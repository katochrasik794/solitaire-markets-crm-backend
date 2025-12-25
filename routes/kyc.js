import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { createAccessToken } from '../services/sumsub.service.js';

const router = express.Router();

// GET /api/kyc/status
// Get KYC status and data from kyc_verifications table
router.get('/status', authenticate, async (req, res) => {
  try {
    // First, get user's sumsub_applicant_id
    const userResult = await pool.query(
      'SELECT sumsub_applicant_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const sumsubApplicantId = userResult.rows[0]?.sumsub_applicant_id || null;

    // Get latest KYC status from kyc_verifications table
    const kycResult = await pool.query(
      `SELECT status, sumsub_applicant_id 
       FROM kyc_verifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [req.user.id]
    );

    // If no KYC record exists, default to unverified
    // Normalize to lowercase for consistency
    const status = kycResult.rows[0]?.status 
      ? String(kycResult.rows[0].status).toLowerCase() 
      : 'unverified';

    // Use sumsub_applicant_id from kyc_verifications if available, otherwise from users table
    const kycSumsubApplicantId = kycResult.rows[0]?.sumsub_applicant_id || sumsubApplicantId;

    res.json({
      success: true,
      data: {
        status,
        sumsub_applicant_id: kycSumsubApplicantId
      }
    });
  } catch (error) {
    console.error('Get KYC info error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch KYC info' });
  }
});

// POST /api/kyc/profile
// Save profile data (step 1)
router.post('/profile', authenticate, async (req, res) => {
  try {
    const { hasTradingExperience, employmentStatus, annualIncome, totalNetWorth, sourceOfWealth } = req.body;

    // Validate required fields
    if (!hasTradingExperience || !employmentStatus || !annualIncome || !totalNetWorth || !sourceOfWealth) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }

    // Convert hasTradingExperience from "yes"/"no" to boolean
    const hasTradingExperienceBool = hasTradingExperience === 'yes' || hasTradingExperience === true;

    // Check if KYC record exists
    const existingKyc = await pool.query(
      'SELECT id FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (existingKyc.rows.length > 0) {
      // Update existing record with profile data, set status to 'pending' for step 1 submission
      await pool.query(
        `UPDATE kyc_verifications 
         SET has_trading_experience = $1,
             employment_status = $2,
             annual_income = $3,
             total_net_worth = $4,
             source_of_wealth = $5,
             status = 'pending',
             submitted_at = COALESCE(submitted_at, NOW()),
             updated_at = NOW()
         WHERE user_id = $6`,
        [
          hasTradingExperienceBool,
          employmentStatus,
          annualIncome,
          totalNetWorth,
          sourceOfWealth,
          req.user.id
        ]
      );
    } else {
      // Insert new KYC record with status 'pending' for step 1
      await pool.query(
        `INSERT INTO kyc_verifications (
          user_id, 
          has_trading_experience, 
          employment_status, 
          annual_income, 
          total_net_worth, 
          source_of_wealth, 
          status,
          submitted_at,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW(), NOW())`,
        [
          req.user.id,
          hasTradingExperienceBool,
          employmentStatus,
          annualIncome,
          totalNetWorth,
          sourceOfWealth
        ]
      );
    }

    // Also save to users.kyc_profile as JSON for backward compatibility
    await pool.query(
      'UPDATE users SET kyc_profile = $1 WHERE id = $2',
      [req.body, req.user.id]
    );

    res.json({ success: true, message: 'Profile submitted successfully' });
  } catch (error) {
    console.error('Save profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to save profile: ' + error.message });
  }
});

// POST /api/kyc/sumsub/init
// Initialize Sumsub (get token, return applicantId)
router.post('/sumsub/init', authenticate, async (req, res) => {
  try {
    // Check if Sumsub credentials are configured
    if (!process.env.SUMSUB_APP_TOKEN || !process.env.SUMSUB_SECRET_KEY) {
      console.error('Sumsub credentials missing:', {
        hasAppToken: !!process.env.SUMSUB_APP_TOKEN,
        hasSecretKey: !!process.env.SUMSUB_SECRET_KEY
      });
      return res.status(500).json({ 
        success: false, 
        message: 'Sumsub verification service is not configured. Please contact support.',
        error: 'SUMSUB_APP_TOKEN or SUMSUB_SECRET_KEY is missing'
      });
    }

    const userId = req.user.id.toString();
    const levelName = process.env.SUMSUB_LEVEL_NAME || 'id-only';
    
    console.log('Sumsub configuration:', {
      hasAppToken: !!process.env.SUMSUB_APP_TOKEN,
      hasSecretKey: !!process.env.SUMSUB_SECRET_KEY,
      levelName: levelName,
      apiUrl: process.env.SUMSUB_API_URL || 'https://api.sumsub.com'
    });

    console.log('Initializing Sumsub for user:', userId, 'with level:', levelName);

    const tokenData = await createAccessToken(userId, levelName);

    if (!tokenData || !tokenData.token) {
      console.error('Invalid token data from Sumsub:', tokenData);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get access token from Sumsub. Please try again.',
        error: 'Invalid token data'
      });
    }

    // Save applicant link
    await pool.query(
      'UPDATE users SET sumsub_applicant_id = $1 WHERE id = $2',
      [userId, req.user.id]
    );

    res.json({
      success: true,
      data: {
        accessToken: tokenData.token,
        applicantId: userId
      }
    });
  } catch (error) {
    console.error('Sumsub init error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to initialize verification. Please try again.';
    if (error.message.includes('SUMSUB_SECRET_KEY is missing') || error.message.includes('SUMSUB_APP_TOKEN is missing')) {
      errorMessage = 'Verification service is not configured. Please contact support.';
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      errorMessage = 'Verification level not found or access denied. Please contact support.';
    } else if (error.message.includes('Invalid JSON') || error.message.includes('HTML error')) {
      errorMessage = 'Invalid response from verification service. Please try again later.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: error.message || 'Failed to initialize Sumsub'
    });
  }
});

// GET /api/kyc/sumsub/access-token/:applicantId
// Refresh access token
router.get('/sumsub/access-token/:applicantId', authenticate, async (req, res) => {
  try {
    const { applicantId } = req.params;
    const levelName = process.env.SUMSUB_LEVEL_NAME || 'id-only';
    const tokenData = await createAccessToken(req.user.id.toString(), levelName);

    res.json({
      success: true,
      data: {
        accessToken: tokenData.token
      }
    });
  } catch (error) {
    console.error('Sumsub refresh token error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh token' });
  }
});

// GET /api/kyc/sumsub/status
// Check status from Sumsub (optional manual check)
router.get('/sumsub/status', authenticate, async (req, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    
    // Get user's sumsub applicant ID
    const userResult = await pool.query(
      'SELECT sumsub_applicant_id, kyc_status FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];
    let status = user?.kyc_status || 'unverified';
    const sumsubApplicantId = user?.sumsub_applicant_id;

    let reviewResult = null;
    let reviewComment = null;

    // If refresh is requested and we have an applicant ID, fetch from Sumsub API
    if (refresh && sumsubApplicantId) {
      try {
        const { getApplicantStatus } = await import('../services/sumsub.js');
        const sumsubStatus = await getApplicantStatus(sumsubApplicantId);
        
        console.log(`📊 Sumsub status for applicant ${sumsubApplicantId}:`, JSON.stringify(sumsubStatus, null, 2));
        
        // Extract review result from Sumsub response
        if (sumsubStatus.reviewResult) {
          reviewResult = sumsubStatus.reviewResult.reviewAnswer || sumsubStatus.reviewResult.reviewStatus;
          reviewComment = sumsubStatus.reviewResult.reviewComment || sumsubStatus.reviewResult.comment;
        } else if (sumsubStatus.review) {
          reviewResult = sumsubStatus.review.reviewAnswer || sumsubStatus.review.reviewStatus;
          reviewComment = sumsubStatus.review.reviewComment || sumsubStatus.review.comment;
        }

        // Update local database with fresh data from Sumsub
        if (reviewResult === 'GREEN' || reviewResult === 'approved') {
          status = 'approved';
        } else if (reviewResult === 'RED' || reviewResult === 'rejected') {
          status = 'rejected';
        } else if (sumsubStatus.reviewStatus === 'pending' || sumsubStatus.reviewStatus === 'init') {
          status = 'pending';
        }

        // Update database with latest status
        await pool.query(
          `UPDATE users SET kyc_status = $1, updated_at = NOW() WHERE id = $2`,
          [status, req.user.id]
        );

        // Update kyc_verifications table - preserve existing profile data
        const updateResult = await pool.query(
          `UPDATE kyc_verifications 
           SET status = $1,
               sumsub_applicant_id = COALESCE($2, sumsub_applicant_id),
               sumsub_review_result = COALESCE($3, sumsub_review_result),
               sumsub_review_comment = COALESCE($4, sumsub_review_comment),
               sumsub_verification_status = COALESCE($5, sumsub_verification_status),
               sumsub_verification_result = COALESCE($6, sumsub_verification_result),
               reviewed_at = CASE WHEN $1 = 'approved' OR $1 = 'rejected' THEN NOW() ELSE reviewed_at END,
               updated_at = NOW()
           WHERE user_id = $7`,
          [
            status,
            sumsubApplicantId,
            reviewResult,
            reviewComment,
            sumsubStatus.reviewStatus || sumsubStatus.status,
            JSON.stringify(sumsubStatus),
            req.user.id
          ]
        );

        // If no record was updated, insert a new one (shouldn't happen if profile was submitted, but handle it)
        if (updateResult.rowCount === 0) {
          await pool.query(
            `INSERT INTO kyc_verifications (user_id, status, sumsub_applicant_id, sumsub_review_result, sumsub_review_comment, sumsub_verification_status, sumsub_verification_result, reviewed_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $2 = 'approved' OR $2 = 'rejected' THEN NOW() ELSE NULL END, NOW())`,
            [
              req.user.id,
              status,
              sumsubApplicantId,
              reviewResult,
              reviewComment,
              sumsubStatus.reviewStatus || sumsubStatus.status,
              JSON.stringify(sumsubStatus)
            ]
          );
        }

        console.log(`✅ Updated KYC status for user ${req.user.id} from Sumsub: ${status}`);
      } catch (sumsubError) {
        console.error('⚠️ Error fetching status from Sumsub API:', sumsubError);
        // Continue with database status if API call fails
      }
    } else {
      // Use database status
      if (status === 'approved') reviewResult = 'GREEN';
      if (status === 'rejected') reviewResult = 'RED';
    }

    res.json({
      success: true,
      data: {
        reviewResult,
        status,
        reviewComment
      }
    });
  } catch (error) {
    console.error('❌ Get Sumsub status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// POST /api/kyc/update-status
// Manual status update from frontend
router.post('/update-status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    // Update both users and kyc_verifications for consistency
    await pool.query(
      'UPDATE users SET kyc_status = $1 WHERE id = $2',
      [status, req.user.id]
    );

    // Sync to kyc_verifications - preserve existing profile data
    const updateResult = await pool.query(
      `UPDATE kyc_verifications 
       SET status = $1, 
           reviewed_at = CASE WHEN $1 = 'approved' OR $1 = 'rejected' THEN NOW() ELSE reviewed_at END,
           updated_at = NOW()
       WHERE user_id = $2`,
      [status, req.user.id]
    );

    // If no record was updated, insert a new one
    if (updateResult.rowCount === 0) {
      await pool.query(
        `INSERT INTO kyc_verifications (user_id, status, reviewed_at, updated_at)
         VALUES ($1, $2, CASE WHEN $2 = 'approved' OR $2 = 'rejected' THEN NOW() ELSE NULL END, NOW())`,
        [req.user.id, status]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update KYC status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Webhook Handler
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('📧 Sumsub webhook received:', JSON.stringify(payload, null, 2));
    
    const { externalUserId, type, reviewResult, applicantId } = payload;

    // Handle different webhook event types
    if (type === 'applicantReviewed' || type === 'applicantStatusChanged') {
      // Extract userId from externalUserId (format: "user_123" or just "123")
      let userId = null;
      if (externalUserId) {
        // Handle format: "user_123" or just "123"
        const userIdMatch = externalUserId.toString().match(/user[_-]?(\d+)$/i) || [null, externalUserId];
        userId = parseInt(userIdMatch[1] || externalUserId);
      } else if (applicantId) {
        // Fallback: try to get from applicantId if externalUserId is missing
        // applicantId might be in format "user_123" or just the userId
        const applicantMatch = applicantId.toString().match(/user[_-]?(\d+)$/i) || [null, applicantId];
        userId = parseInt(applicantMatch[1] || applicantId);
      }

      if (!userId || isNaN(userId)) {
        console.error('⚠️ Invalid userId in Sumsub webhook:', { externalUserId, applicantId, type });
        return res.status(200).send('Ignored - invalid userId');
      }

      // Determine status from reviewResult
      const reviewAnswer = reviewResult?.reviewAnswer || reviewResult?.reviewStatus || payload.reviewStatus;
      const isApproved = reviewAnswer === 'GREEN' || reviewAnswer === 'approved';
      const isRejected = reviewAnswer === 'RED' || reviewAnswer === 'rejected';

      let status = 'pending';
      if (isApproved) {
        status = 'approved';
      } else if (isRejected) {
        status = 'rejected';
      }

      const reviewComment = reviewResult?.reviewComment || reviewResult?.comment || payload.comment || null;

      console.log(`📝 Updating KYC status for user ${userId}: ${status}`, { reviewAnswer, reviewComment });

      // Update users table
      await pool.query(
        `UPDATE users SET kyc_status = $1, updated_at = NOW() WHERE id = $2`,
        [status, userId]
      );

      // Update or insert into kyc_verifications table
      // First try to update existing record (preserves profile data)
      const updateResult = await pool.query(
        `UPDATE kyc_verifications 
         SET status = $1, 
             sumsub_applicant_id = COALESCE($2, sumsub_applicant_id),
             sumsub_review_result = COALESCE($3, sumsub_review_result),
             sumsub_review_comment = COALESCE($4, sumsub_review_comment),
             sumsub_verification_status = COALESCE($5, sumsub_verification_status),
             sumsub_verification_result = COALESCE($6, sumsub_verification_result),
             sumsub_webhook_received_at = NOW(),
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $7`,
        [
          status,
          applicantId || externalUserId,
          reviewAnswer,
          reviewComment,
          type,
          JSON.stringify(payload),
          userId
        ]
      );

      // If no record was updated, insert a new one
      if (updateResult.rowCount === 0) {
        await pool.query(
          `INSERT INTO kyc_verifications (user_id, status, sumsub_applicant_id, sumsub_review_result, sumsub_review_comment, sumsub_verification_status, sumsub_verification_result, sumsub_webhook_received_at, reviewed_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())`,
          [
            userId, 
            status, 
            applicantId || externalUserId,
            reviewAnswer,
            reviewComment,
            type,
            JSON.stringify(payload)
          ]
        );
      }

      console.log(`✅ KYC status updated successfully for user ${userId}: ${status}`);
    } else if (type === 'applicantCreated' || type === 'applicantPending') {
      // Handle applicant creation/pending status
      let userId = null;
      if (externalUserId) {
        const userIdMatch = externalUserId.toString().match(/user[_-]?(\d+)$/i) || [null, externalUserId];
        userId = parseInt(userIdMatch[1] || externalUserId);
      }

      if (userId && !isNaN(userId)) {
        await pool.query(
          `UPDATE users SET kyc_status = 'pending', updated_at = NOW() WHERE id = $1`,
          [userId]
        );
        console.log(`📝 Applicant status set to pending for user ${userId}`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    console.error('Error stack:', error.stack);
    console.error('Webhook payload:', JSON.stringify(req.body, null, 2));
    res.status(500).send('Webhook failed');
  }
});

export default router;
