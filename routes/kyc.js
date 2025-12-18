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
      `SELECT status 
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

    res.json({
      success: true,
      data: {
        status,
        sumsub_applicant_id: sumsubApplicantId
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
    const profileData = req.body;
    // Upsert profile data
    await pool.query(
      'UPDATE users SET kyc_profile = $1 WHERE id = $2',
      [profileData, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Save profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to save profile' });
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
    const result = await pool.query('SELECT kyc_status FROM users WHERE id = $1', [req.user.id]);
    let status = result.rows[0]?.kyc_status || 'unverified';

    let reviewResult = null;
    if (status === 'approved') reviewResult = 'GREEN';
    if (status === 'rejected') reviewResult = 'RED';

    res.json({
      success: true,
      data: {
        reviewResult,
        status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false });
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

    // Sync to kyc_verifications
    await pool.query(
      `INSERT INTO kyc_verifications (user_id, status, reviewed_at, updated_at)
              VALUES ($1, $2, NOW(), NOW())
              ON CONFLICT (user_id) DO UPDATE 
              SET status = $2, reviewed_at = NOW(), updated_at = NOW()`,
      [req.user.id, status]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});


// Webhook Handler
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const { externalUserId, type, reviewResult } = payload;

    if (!externalUserId) return res.status(200).send('Ignored');

    if (type === 'applicantReviewed') {
      const userId = parseInt(externalUserId);
      // Check if userId is valid integer
      if (isNaN(userId)) {
        console.error('Invalid externalUserId in Sumsub webhook:', externalUserId);
        return res.status(200).send('Ignored');
      }

      const isApproved = reviewResult?.reviewAnswer === 'GREEN';
      const isRejected = reviewResult?.reviewAnswer === 'RED';

      let status = 'pending';
      if (isApproved) status = 'approved';
      else if (isRejected) status = 'rejected';

      await pool.query(
        `UPDATE users SET kyc_status = $1 WHERE id = $2`,
        [status, userId]
      );

      await pool.query(
        `INSERT INTO kyc_verifications (user_id, status, reviewed_at, updated_at)
                 VALUES ($1, $2, NOW(), NOW())
                 ON CONFLICT (user_id) DO UPDATE 
                 SET status = $2, reviewed_at = NOW(), updated_at = NOW()`,
        [userId, status]
      );
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook failed');
  }
});

export default router;
