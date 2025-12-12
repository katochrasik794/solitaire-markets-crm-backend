import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { createAccessToken } from '../services/sumsub.service.js';

const router = express.Router();

// GET /api/kyc/status
// Get KYC status and data
router.get('/status', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT kyc_status as status, sumsub_applicant_id FROM users WHERE id = $1',
      [req.user.id]
    );

    const data = result.rows[0];
    // If status is null, default to unverified
    const status = data?.status || 'unverified';

    res.json({
      success: true,
      data: {
        status,
        sumsub_applicant_id: data?.sumsub_applicant_id
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
    const userId = req.user.id.toString();
    const levelName = process.env.SUMSUB_LEVEL_NAME || 'id-and-phone-verification';

    const tokenData = await createAccessToken(userId, levelName);

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
    res.status(500).json({ success: false, error: 'Failed to initialize Sumsub' });
  }
});

// GET /api/kyc/sumsub/access-token/:applicantId
// Refresh access token
router.get('/sumsub/access-token/:applicantId', authenticate, async (req, res) => {
  try {
    const { applicantId } = req.params;
    const levelName = process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level';
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
