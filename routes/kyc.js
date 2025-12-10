import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as sumsubService from '../services/sumsub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Test route to verify KYC routes are working
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'KYC routes are working!' });
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads/kyc');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG) and PDF are allowed'));
    }
  }
});

/**
 * GET /api/kyc/status
 * Get KYC verification status for logged in user
 */
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, status, document_type, submitted_at, reviewed_at, rejection_reason,
              sumsub_applicant_id, sumsub_verification_status, sumsub_review_result,
              sumsub_review_comment, sumsub_level_name
       FROM kyc_verifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No verification submitted yet'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get KYC status error:', error);
    next(error);
  }
});

/**
 * POST /api/kyc/profile
 * Submit profile information (Step 1) - before Sumsub verification
 */
router.post('/profile', authenticate, async (req, res, next) => {
  try {
    const {
      hasTradingExperience,
      employmentStatus,
      annualIncome,
      totalNetWorth,
      sourceOfWealth
    } = req.body;

    // Validation
    if (!hasTradingExperience || !employmentStatus || !annualIncome || 
        !totalNetWorth || !sourceOfWealth) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if user already has a KYC record
    const existingCheck = await pool.query(
      'SELECT id FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (existingCheck.rows.length > 0) {
      // Update existing record
      await pool.query(
        `UPDATE kyc_verifications 
         SET has_trading_experience = $1, employment_status = $2, annual_income = $3,
             total_net_worth = $4, source_of_wealth = $5, updated_at = NOW()
         WHERE id = $6`,
        [
          hasTradingExperience === 'yes' || hasTradingExperience === true,
          employmentStatus,
          annualIncome,
          totalNetWorth,
          sourceOfWealth,
          existingCheck.rows[0].id
        ]
      );
    } else {
      // Create new KYC record with profile data only
      await pool.query(
        `INSERT INTO kyc_verifications (
          user_id, has_trading_experience, employment_status, annual_income,
          total_net_worth, source_of_wealth, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING id`,
        [
          req.user.id,
          hasTradingExperience === 'yes' || hasTradingExperience === true,
          employmentStatus,
          annualIncome,
          totalNetWorth,
          sourceOfWealth
        ]
      );
    }

    // Profile saved successfully - don't initialize Sumsub here
    // Sumsub will be initialized when user moves to step 2
    res.json({
      success: true,
      message: 'Profile submitted successfully'
    });
  } catch (error) {
    console.error('Submit profile error:', error);
    next(error);
  }
});

/**
 * POST /api/kyc/submit
 * Submit KYC verification with documents (OLD - kept for backward compatibility)
 */
router.post('/submit', authenticate, upload.fields([
  { name: 'frontDocument', maxCount: 1 },
  { name: 'backDocument', maxCount: 1 }
]), async (req, res, next) => {
  try {
    const {
      hasTradingExperience,
      employmentStatus,
      annualIncome,
      totalNetWorth,
      sourceOfWealth,
      documentType
    } = req.body;

    // Validation
    if (!hasTradingExperience || !employmentStatus || !annualIncome || 
        !totalNetWorth || !sourceOfWealth || !documentType) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (!req.files || !req.files.frontDocument) {
      return res.status(400).json({
        success: false,
        message: 'Front document is required'
      });
    }

    // Check if user already has a pending verification
    const existingCheck = await pool.query(
      'SELECT id FROM kyc_verifications WHERE user_id = $1 AND status = $2',
      [req.user.id, 'pending']
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending verification. Please wait for review.'
      });
    }

    // Store relative path from server root
    const frontDocumentPath = `/uploads/kyc/${req.files.frontDocument[0].filename}`;
    const backDocumentPath = req.files.backDocument && req.files.backDocument[0] 
      ? `/uploads/kyc/${req.files.backDocument[0].filename}`
      : null;

    // Insert KYC verification
    const result = await pool.query(
      `INSERT INTO kyc_verifications (
        user_id, has_trading_experience, employment_status, annual_income,
        total_net_worth, source_of_wealth, document_type,
        document_front_path, document_back_path, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, status, submitted_at`,
      [
        req.user.id,
        hasTradingExperience === 'true',
        employmentStatus,
        annualIncome,
        totalNetWorth,
        sourceOfWealth,
        documentType,
        frontDocumentPath,
        backDocumentPath,
        'pending'
      ]
    );

    res.json({
      success: true,
      message: 'Verification submitted successfully. Your documents are under review.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Submit KYC error:', error);
    next(error);
  }
});

/**
 * POST /api/kyc/update-status
 * Update KYC status (called after Sumsub verification completes)
 */
router.post('/update-status', authenticate, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: pending, approved, rejected'
      });
    }

    // Update KYC status
    await pool.query(
      `UPDATE kyc_verifications 
       SET status = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE user_id = $2 AND id = (SELECT id FROM kyc_verifications WHERE user_id = $2 ORDER BY created_at DESC LIMIT 1)`,
      [status, req.user.id]
    );

    res.json({
      success: true,
      message: 'KYC status updated successfully'
    });
  } catch (error) {
    console.error('Update KYC status error:', error);
    next(error);
  }
});

/**
 * POST /api/kyc/sumsub/init
 * Initialize Sumsub verification (create applicant + get access token)
 * Called automatically when Verification page loads
 */
router.post('/sumsub/init', authenticate, async (req, res, next) => {
  try {
    // Get user data from database with country code
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_code, u.phone_number, u.country,
              c.country_code
       FROM users u
       LEFT JOIN countries c ON LOWER(TRIM(u.country)) = LOWER(TRIM(c.name))
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userResult.rows[0];
    
    // Convert 2-letter country code to 3-letter ISO code if needed
    // Sumsub typically uses ISO 3166-1 alpha-3 (3-letter codes)
    let countryCode = null;
    if (userData.country_code) {
      // We have 2-letter code, need to convert to 3-letter
      // For now, use the 2-letter code - Sumsub may accept it
      // If not, we'll need a mapping table
      countryCode = userData.country_code;
    } else if (userData.country) {
      // Try to find country code from countries table
      const countryResult = await pool.query(
        'SELECT country_code FROM countries WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1',
        [userData.country]
      );
      if (countryResult.rows.length > 0) {
        countryCode = countryResult.rows[0].country_code;
      }
    }
    
    // Create a mapping object with country code
    const userDataForSumsub = {
      ...userData,
      country_code: countryCode
    };

    // Check if user already has a Sumsub applicant
    const existingKyc = await pool.query(
      'SELECT sumsub_applicant_id FROM kyc_verifications WHERE user_id = $1 AND sumsub_applicant_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    let applicantId;
    let accessToken;

    const levelName = process.env.SUMSUB_LEVEL_NAME || 'id-only';

    if (existingKyc.rows.length > 0 && existingKyc.rows[0].sumsub_applicant_id) {
      // Use existing applicant
      applicantId = existingKyc.rows[0].sumsub_applicant_id;
      accessToken = await sumsubService.generateAccessToken(applicantId, levelName);
    } else {
      // Create new applicant with configured level
      const applicant = await sumsubService.createApplicant(req.user.id, userDataForSumsub, levelName);
      applicantId = applicant.id;

      // Generate access token
      accessToken = await sumsubService.generateAccessToken(applicantId, levelName);

      // Create or update KYC record with Sumsub data
      const kycCheck = await pool.query(
        'SELECT id FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [req.user.id]
      );

      if (kycCheck.rows.length > 0) {
        // Update existing record
        await pool.query(
          `UPDATE kyc_verifications 
           SET sumsub_applicant_id = $1, sumsub_verification_status = 'init', sumsub_level_name = $2
           WHERE id = $3`,
          [applicantId, levelName, kycCheck.rows[0].id]
        );
      } else {
        // Create new record
        await pool.query(
          `INSERT INTO kyc_verifications (user_id, sumsub_applicant_id, sumsub_verification_status, sumsub_level_name, status)
           VALUES ($1, $2, 'init', $3, 'pending')`,
          [req.user.id, applicantId, levelName]
        );
      }
    }

    res.json({
      success: true,
      data: {
        applicantId,
        accessToken,
        levelName: levelName
      }
    });
  } catch (error) {
    console.error('Sumsub init error:', error);
    next(error);
  }
});

/**
 * GET /api/kyc/sumsub/access-token/:applicantId
 * Get access token for existing applicant
 */
router.get('/sumsub/access-token/:applicantId', authenticate, async (req, res, next) => {
  try {
    const { applicantId } = req.params;

    // Verify applicant belongs to user
    const kycCheck = await pool.query(
      'SELECT id FROM kyc_verifications WHERE user_id = $1 AND sumsub_applicant_id = $2',
      [req.user.id, applicantId]
    );

    if (kycCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Applicant not found for this user'
      });
    }

    const accessToken = await sumsubService.generateAccessToken(applicantId);

    res.json({
      success: true,
      data: {
        applicantId,
        accessToken
      }
    });
  } catch (error) {
    console.error('Get access token error:', error);
    next(error);
  }
});

/**
 * POST /api/kyc/sumsub/webhook
 * Webhook endpoint for Sumsub callbacks
 * No authentication required, but signature verification is performed
 */
router.post('/sumsub/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    const signature = req.headers['x-payload-digest'];
    const payload = req.body.toString();

    // Verify webhook signature
    if (!sumsubService.verifyWebhookSignature(payload, signature)) {
      console.error('Invalid webhook signature');
      return res.status(401).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    const eventData = JSON.parse(payload);
    const processedEvent = sumsubService.handleWebhookEvent(eventData);

    // Update KYC record based on webhook event
    if (eventData.applicant && eventData.applicant.id) {
      const applicantId = eventData.applicant.id;
      const reviewResult = eventData.reviewResult || null;
      const reviewStatus = eventData.reviewStatus || null;
      const reviewComment = eventData.reviewComment || null;

      // Find KYC record by applicant ID
      const kycResult = await pool.query(
        'SELECT id, user_id FROM kyc_verifications WHERE sumsub_applicant_id = $1',
        [applicantId]
      );

      if (kycResult.rows.length > 0) {
        const kycId = kycResult.rows[0].id;
        const updateData = {
          sumsub_verification_status: reviewStatus || eventData.type,
          sumsub_webhook_received_at: new Date(),
          sumsub_verification_result: eventData
        };

        if (reviewResult) {
          updateData.sumsub_review_result = reviewResult;
          // Update local status based on Sumsub result
          if (reviewResult === 'GREEN') {
            updateData.status = 'approved';
            updateData.reviewed_at = new Date();
          } else if (reviewResult === 'RED') {
            updateData.status = 'rejected';
            updateData.reviewed_at = new Date();
          }
        }

        if (reviewComment) {
          updateData.sumsub_review_comment = reviewComment;
          if (reviewResult === 'RED') {
            updateData.rejection_reason = reviewComment;
          }
        }

        await pool.query(
          `UPDATE kyc_verifications 
           SET sumsub_verification_status = $1,
               sumsub_webhook_received_at = $2,
               sumsub_verification_result = $3,
               sumsub_review_result = $4,
               sumsub_review_comment = $5,
               status = COALESCE($6, status),
               reviewed_at = COALESCE($7, reviewed_at),
               rejection_reason = COALESCE($8, rejection_reason)
           WHERE id = $9`,
          [
            updateData.sumsub_verification_status,
            updateData.sumsub_webhook_received_at,
            JSON.stringify(updateData.sumsub_verification_result),
            updateData.sumsub_review_result || null,
            updateData.sumsub_review_comment || null,
            updateData.status || null,
            updateData.reviewed_at || null,
            updateData.rejection_reason || null,
            kycId
          ]
        );
      }
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    next(error);
  }
});

/**
 * GET /api/kyc/sumsub/status
 * Get current Sumsub verification status for authenticated user
 */
router.get('/sumsub/status', authenticate, async (req, res, next) => {
  try {
    const kycResult = await pool.query(
      `SELECT sumsub_applicant_id, sumsub_verification_status, sumsub_review_result,
              sumsub_review_comment, sumsub_level_name, sumsub_verification_result
       FROM kyc_verifications
       WHERE user_id = $1 AND sumsub_applicant_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (kycResult.rows.length === 0 || !kycResult.rows[0].sumsub_applicant_id) {
      return res.json({
        success: true,
        data: null,
        message: 'No Sumsub verification found'
      });
    }

    const kycData = kycResult.rows[0];
    let sumsubStatus = null;

    // Optionally fetch fresh status from Sumsub API
    if (req.query.refresh === 'true' && kycData.sumsub_applicant_id) {
      try {
        sumsubStatus = await sumsubService.getApplicantStatus(kycData.sumsub_applicant_id);
      } catch (error) {
        console.error('Error fetching status from Sumsub:', error);
      }
    }

    res.json({
      success: true,
      data: {
        applicantId: kycData.sumsub_applicant_id,
        status: kycData.sumsub_verification_status,
        reviewResult: kycData.sumsub_review_result,
        reviewComment: kycData.sumsub_review_comment,
        levelName: kycData.sumsub_level_name,
        sumsubStatus: sumsubStatus || kycData.sumsub_verification_result
      }
    });
  } catch (error) {
    console.error('Get Sumsub status error:', error);
    next(error);
  }
});

/**
 * POST /api/kyc/sumsub/check-status
 * Manually check status from Sumsub API
 */
router.post('/sumsub/check-status', authenticate, async (req, res, next) => {
  try {
    const kycResult = await pool.query(
      'SELECT sumsub_applicant_id FROM kyc_verifications WHERE user_id = $1 AND sumsub_applicant_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (kycResult.rows.length === 0 || !kycResult.rows[0].sumsub_applicant_id) {
      return res.status(404).json({
        success: false,
        message: 'No Sumsub applicant found for this user'
      });
    }

    const applicantId = kycResult.rows[0].sumsub_applicant_id;
    const status = await sumsubService.getApplicantStatus(applicantId);

    // Update database with latest status
    await pool.query(
      `UPDATE kyc_verifications 
       SET sumsub_verification_status = $1,
           sumsub_verification_result = $2
       WHERE sumsub_applicant_id = $3`,
      [status.reviewStatus || status.status, JSON.stringify(status), applicantId]
    );

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Check Sumsub status error:', error);
    next(error);
  }
});

export default router;

