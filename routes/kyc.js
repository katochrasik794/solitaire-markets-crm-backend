import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { createAccessToken, getApplicantData, getApplicantStatus } from '../services/sumsub.service.js';

const router = express.Router();

// GET /api/kyc/status
// Get KYC status and data from kyc_verifications table
router.get('/status', authenticate, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      console.error('Authentication error: req.user is missing');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userId = req.user.id;
    console.log(`[KYC Status] Fetching status for user ${userId}`);

    // First, get user's sumsub_applicant_id
    const userResult = await pool.query(
      'SELECT sumsub_applicant_id FROM users WHERE id = $1',
      [userId]
    );
    const sumsubApplicantId = userResult.rows[0]?.sumsub_applicant_id || null;

    // Get latest KYC status from kyc_verifications table
    const kycResult = await pool.query(
      `SELECT status, sumsub_applicant_id 
       FROM kyc_verifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );

    // If no KYC record exists, default to unverified
    // Normalize to lowercase for consistency
    const status = kycResult.rows[0]?.status
      ? String(kycResult.rows[0].status).toLowerCase()
      : 'unverified';

    // Use sumsub_applicant_id from kyc_verifications if available, otherwise from users table
    const kycSumsubApplicantId = kycResult.rows[0]?.sumsub_applicant_id || sumsubApplicantId;

    console.log(`[KYC Status] User ${userId} status: ${status}, applicantId: ${kycSumsubApplicantId}`);

    res.json({
      success: true,
      data: {
        status,
        sumsub_applicant_id: kycSumsubApplicantId
      }
    });
  } catch (error) {
    console.error('❌ Get KYC info error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request user:', req.user);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch KYC info',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
    // Fallback to user ID if sumsub_applicant_id is missing (service will resolve it)
    const sumsubApplicantId = user?.sumsub_applicant_id || req.user.id.toString();

    let reviewResult = null;
    let reviewComment = null;

    // Check for mismatch: User is approved/active but kyc_verifications is not
    const isMismatch = (status === 'approved' || status === 'active');

    // If refresh is requested AND we have an applicant ID (or we have a mismatch to heal), fetch from Sumsub API
    if ((refresh || isMismatch) && sumsubApplicantId) {
      try {
        // Fetch both status and full applicant data to get idDocs
        const [sumsubStatus, fullApplicantData] = await Promise.allSettled([
          getApplicantStatus(sumsubApplicantId),
          getApplicantData(sumsubApplicantId)
        ]);

        let statusData = null;
        let applicantData = null;
        let sumsubResponseData = {};

        // Process status response
        if (sumsubStatus.status === 'fulfilled') {
          statusData = sumsubStatus.value;
          console.log(`📊 Sumsub status for applicant ${sumsubApplicantId}:`, JSON.stringify(statusData, null, 2));

          // Extract review result from Sumsub response
          if (statusData.reviewResult) {
            reviewResult = statusData.reviewResult.reviewAnswer || statusData.reviewResult.reviewStatus;
            reviewComment = statusData.reviewResult.reviewComment || statusData.reviewResult.comment;
          } else if (statusData.review) {
            reviewResult = statusData.review.reviewAnswer || statusData.review.reviewStatus;
            reviewComment = statusData.review.reviewComment || statusData.review.comment;
          }

          // Update local database with fresh data from Sumsub
          if (reviewResult === 'GREEN' || reviewResult === 'approved') {
            status = 'approved';
          } else if (reviewResult === 'RED' || reviewResult === 'rejected') {
            status = 'rejected';
          } else if (statusData.reviewStatus === 'pending' || statusData.reviewStatus === 'init') {
            status = 'pending';
          }

          sumsubResponseData.status = statusData;
        } else {
          // Handle status fetch error
          console.error('⚠️ Error fetching status from Sumsub:', sumsubStatus.reason);
          if (sumsubStatus.reason?.errorResponse) {
            sumsubResponseData.statusError = sumsubStatus.reason.errorResponse;
          } else {
            sumsubResponseData.statusError = {
              error: true,
              message: sumsubStatus.reason?.message || 'Failed to fetch status'
            };
          }
        }

        // Process full applicant data response (includes idDocs)
        if (fullApplicantData.status === 'fulfilled') {
          applicantData = fullApplicantData.value;
          console.log(`✅ Retrieved full applicant data with idDocs:`, JSON.stringify(applicantData, null, 2));
          sumsubResponseData.fullApplicantData = applicantData;
          sumsubResponseData.idDocs = applicantData.idDocs || null;
        } else {
          // Handle applicant data fetch error
          console.error('⚠️ Error fetching applicant data from Sumsub:', fullApplicantData.reason);
          if (fullApplicantData.reason?.errorResponse) {
            sumsubResponseData.applicantDataError = fullApplicantData.reason.errorResponse;
          } else {
            sumsubResponseData.applicantDataError = {
              error: true,
              message: fullApplicantData.reason?.message || 'Failed to fetch applicant data'
            };
          }
        }

        // Update database with latest status
        await pool.query(
          `UPDATE users SET kyc_status = $1, updated_at = NOW() WHERE id = $2`,
          [status, req.user.id]
        );

        // Update kyc_verifications table - preserve existing profile data
        const shouldUpdateReviewedAt = status === 'approved' || status === 'rejected';
        const reviewedAtVal = shouldUpdateReviewedAt ? new Date() : null;

        const updateResult = await pool.query(
          `UPDATE kyc_verifications 
           SET status = $1,
               sumsub_applicant_id = COALESCE($2::text, sumsub_applicant_id),
               sumsub_review_result = COALESCE($3::text, sumsub_review_result),
               sumsub_review_comment = COALESCE($4::text, sumsub_review_comment),
               sumsub_verification_status = COALESCE($5::text, sumsub_verification_status),
               sumsub_verification_result = $6::jsonb,
               reviewed_at = COALESCE($8::timestamp, reviewed_at),
               updated_at = NOW()
           WHERE user_id = $7`,
          [
            status,
            sumsubApplicantId,
            reviewResult,
            reviewComment,
            statusData?.reviewStatus || statusData?.status || 'unknown',
            JSON.stringify(sumsubResponseData),
            req.user.id,
            reviewedAtVal
          ]
        );

        // If no record was updated, insert a new one
        if (updateResult.rowCount === 0) {
          await pool.query(
            `INSERT INTO kyc_verifications (user_id, status, sumsub_applicant_id, sumsub_review_result, sumsub_review_comment, sumsub_verification_status, sumsub_verification_result, reviewed_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
              req.user.id,
              status,
              sumsubApplicantId,
              reviewResult,
              reviewComment,
              statusData?.reviewStatus || statusData?.status || 'unknown',
              JSON.stringify(sumsubResponseData),
              reviewedAtVal
            ]
          );
        }

        console.log(`✅ Updated KYC status for user ${req.user.id} from Sumsub: ${status}`);
      } catch (sumsubError) {
        console.error('⚠️ Error fetching data from Sumsub API:', sumsubError);
        // Store error response if available
        let errorResponseData = {
          error: true,
          message: sumsubError.message || 'Failed to fetch data from Sumsub'
        };

        if (sumsubError.errorResponse) {
          errorResponseData = sumsubError.errorResponse;
        }

        // Store error in database
        const updateResult = await pool.query(
          `UPDATE kyc_verifications 
           SET sumsub_verification_result = COALESCE(sumsub_verification_result::jsonb || $1::jsonb, $1::jsonb),
               updated_at = NOW()
           WHERE user_id = $2`,
          [
            JSON.stringify({ fetchError: errorResponseData }),
            req.user.id
          ]
        );

        // If no record exists, create one with error
        if (updateResult.rowCount === 0) {
          await pool.query(
            `INSERT INTO kyc_verifications (user_id, status, sumsub_verification_result, updated_at)
             VALUES ($1, 'pending', $2, NOW())`,
            [
              req.user.id,
              JSON.stringify({ fetchError: errorResponseData })
            ]
          );
        }
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

    const shouldUpdateReviewedAt = status === 'approved' || status === 'rejected';
    const reviewedAtVal = shouldUpdateReviewedAt ? new Date() : null;

    // Sync to kyc_verifications - preserve existing profile data
    const updateResult = await pool.query(
      `UPDATE kyc_verifications 
       SET status = $1, 
           reviewed_at = COALESCE($3, reviewed_at),
           updated_at = NOW()
       WHERE user_id = $2`,
      [status, req.user.id, reviewedAtVal]
    );

    // If no record was updated, insert a new one
    if (updateResult.rowCount === 0) {
      await pool.query(
        `INSERT INTO kyc_verifications (user_id, status, reviewed_at, updated_at)
         VALUES ($1, $2, $3, NOW())`,
        [req.user.id, status, reviewedAtVal]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update KYC status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/kyc/sumsub/callback
// Handle Sumsub SDK onMessage callback from client
router.post('/sumsub/callback', authenticate, async (req, res) => {
  try {
    const { type, payload } = req.body;
    console.log('📨 Sumsub SDK callback received:', { type, payload: JSON.stringify(payload, null, 2) });

    const userId = req.user.id;
    const userResult = await pool.query(
      'SELECT sumsub_applicant_id FROM users WHERE id = $1',
      [userId]
    );
    const sumsubApplicantId = userResult.rows[0]?.sumsub_applicant_id || userId.toString();

    let status = 'pending';
    let reviewAnswer = null;
    let reviewComment = null;
    let sumsubResponseData = { type, payload };

    // Handle different callback types
    if (type === 'idCheck.onReviewCompleted' || payload?.reviewStatus === 'completed') {
      // Extract review result
      reviewAnswer = payload?.reviewResult?.reviewAnswer || payload?.reviewResult || null;
      reviewComment = payload?.reviewResult?.reviewComment || payload?.reviewComment || null;

      if (reviewAnswer === 'GREEN' || reviewAnswer === 'approved') {
        status = 'approved';
      } else if (reviewAnswer === 'RED' || reviewAnswer === 'rejected') {
        status = 'rejected';
      }

      console.log(`📝 Processing review completion for user ${userId}: ${status}`, { reviewAnswer, reviewComment });

      // Fetch full applicant data (including idDocs) when verification is completed
      if ((status === 'approved' || status === 'rejected') && sumsubApplicantId) {
        try {
          console.log(`📥 Fetching full applicant data for applicant ${sumsubApplicantId}`);
          const fullApplicantData = await getApplicantData(sumsubApplicantId);
          console.log(`✅ Retrieved full applicant data with idDocs`);

          sumsubResponseData = {
            ...sumsubResponseData,
            fullApplicantData: fullApplicantData,
            idDocs: fullApplicantData.idDocs || null
          };
        } catch (fetchError) {
          console.error(`⚠️ Error fetching full applicant data:`, fetchError);
          if (fetchError.errorResponse) {
            sumsubResponseData.fetchError = fetchError.errorResponse;
          } else {
            sumsubResponseData.fetchError = {
              error: true,
              message: fetchError.message || 'Failed to fetch applicant data'
            };
          }
        }
      }

      // Update users table
      await pool.query(
        `UPDATE users SET kyc_status = $1, updated_at = NOW() WHERE id = $2`,
        [status, userId]
      );

      const shouldUpdateReviewedAt = status === 'approved' || status === 'rejected';
      const reviewedAtVal = shouldUpdateReviewedAt ? new Date() : null;

      // Update or insert into kyc_verifications table
      const updateResult = await pool.query(
        `UPDATE kyc_verifications 
         SET status = $1,
             sumsub_applicant_id = COALESCE($2, sumsub_applicant_id),
             sumsub_review_result = COALESCE($3, sumsub_review_result),
             sumsub_review_comment = COALESCE($4, sumsub_review_comment),
             sumsub_verification_status = COALESCE($5, sumsub_verification_status),
             sumsub_verification_result = $6,
             reviewed_at = COALESCE($8, reviewed_at),
             updated_at = NOW()
         WHERE user_id = $7`,
        [
          status,
          sumsubApplicantId,
          reviewAnswer,
          reviewComment,
          payload?.reviewStatus || 'completed',
          JSON.stringify(sumsubResponseData),
          userId,
          reviewedAtVal
        ]
      );

      // If no record was updated, insert a new one
      if (updateResult.rowCount === 0) {
        await pool.query(
          `INSERT INTO kyc_verifications (user_id, status, sumsub_applicant_id, sumsub_review_result, sumsub_review_comment, sumsub_verification_status, sumsub_verification_result, reviewed_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            userId,
            status,
            sumsubApplicantId,
            reviewAnswer,
            reviewComment,
            payload?.reviewStatus || 'completed',
            JSON.stringify(sumsubResponseData),
            reviewedAtVal
          ]
        );
      }

      console.log(`✅ KYC status updated successfully for user ${userId}: ${status}`);
    } else if (type === 'idCheck.onApplicantSubmitted') {
      // Just update status to pending
      await pool.query(
        `UPDATE users SET kyc_status = 'pending', updated_at = NOW() WHERE id = $1`,
        [userId]
      );

      // Store callback data
      await pool.query(
        `UPDATE kyc_verifications 
         SET status = 'pending',
             sumsub_verification_result = COALESCE(sumsub_verification_result::jsonb || $1::jsonb, $1::jsonb),
             updated_at = NOW()
         WHERE user_id = $2`,
        [
          JSON.stringify(sumsubResponseData),
          userId
        ]
      );
    }

    res.json({ success: true, status });
  } catch (error) {
    console.error('❌ Sumsub callback error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Webhook Handler
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('📧 Sumsub webhook received:', JSON.stringify(payload, null, 2));

    const { externalUserId, type, reviewResult, applicantId } = payload;

    // Check if payload contains error response (code, description, correlationId)
    if (payload.code && payload.description) {
      console.log('⚠️ Error response in webhook payload:', payload);
      // Store error response in database if we can identify the user
      let userId = null;
      if (externalUserId) {
        const userIdMatch = externalUserId.toString().match(/user[_-]?(\d+)$/i) || [null, externalUserId];
        userId = parseInt(userIdMatch[1] || externalUserId);
      } else if (applicantId) {
        const applicantMatch = applicantId.toString().match(/user[_-]?(\d+)$/i) || [null, applicantId];
        userId = parseInt(applicantMatch[1] || applicantId);
      }

      if (userId && !isNaN(userId)) {
        // Store error response in database
        await pool.query(
          `UPDATE kyc_verifications 
           SET sumsub_verification_result = COALESCE(sumsub_verification_result::jsonb || $1::jsonb, $1::jsonb),
               status = CASE WHEN status = 'approved' THEN status ELSE 'rejected' END,
               rejection_reason = COALESCE(rejection_reason, $2),
               updated_at = NOW()
           WHERE user_id = $3`,
          [
            JSON.stringify({ error: payload }),
            payload.description,
            userId
          ]
        );

        // Update users table if status should be rejected
        if (payload.code >= 400) {
          await pool.query(
            `UPDATE users SET kyc_status = 'rejected', updated_at = NOW() WHERE id = $1`,
            [userId]
          );
        }
      }

      return res.status(200).send('OK - Error stored');
    }

    // Handle different webhook event types
    // Also handle cases where reviewStatus is 'completed' or reviewResult exists but type might be missing
    if (type === 'applicantReviewed' || type === 'applicantStatusChanged' ||
      payload.reviewStatus === 'completed' || payload.reviewResult || reviewResult) {
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
        console.error('⚠️ Invalid userId in Sumsub webhook:', { externalUserId, applicantId, type, payload });
        return res.status(200).send('Ignored - invalid userId');
      }

      // Determine status from reviewResult - handle multiple structures
      let reviewAnswer = null;
      if (reviewResult?.reviewAnswer) {
        reviewAnswer = reviewResult.reviewAnswer;
      } else if (reviewResult?.reviewStatus) {
        reviewAnswer = reviewResult.reviewStatus;
      } else if (payload.reviewResult?.reviewAnswer) {
        reviewAnswer = payload.reviewResult.reviewAnswer;
      } else if (payload.reviewResult) {
        reviewAnswer = payload.reviewResult;
      } else if (payload.reviewStatus) {
        reviewAnswer = payload.reviewStatus;
      }

      const isApproved = reviewAnswer === 'GREEN' || reviewAnswer === 'approved';
      const isRejected = reviewAnswer === 'RED' || reviewAnswer === 'rejected';

      let status = 'pending';
      if (isApproved) {
        status = 'approved';
      } else if (isRejected) {
        status = 'rejected';
      }

      const reviewComment = reviewResult?.reviewComment || reviewResult?.comment ||
        payload.reviewComment || payload.comment || null;

      console.log(`📝 Updating KYC status for user ${userId}: ${status}`, { reviewAnswer, reviewComment });

      // Fetch full applicant data (including idDocs) when verification is completed (approved or rejected)
      let fullApplicantData = null;
      let sumsubResponseData = payload;

      const actualApplicantId = applicantId || externalUserId || userId.toString();
      if ((status === 'approved' || status === 'rejected') && actualApplicantId) {
        try {
          console.log(`📥 Fetching full applicant data for applicant ${actualApplicantId}`);
          fullApplicantData = await getApplicantData(actualApplicantId);
          console.log(`✅ Retrieved full applicant data with idDocs:`, JSON.stringify(fullApplicantData, null, 2));

          // Merge webhook payload with full applicant data
          sumsubResponseData = {
            ...payload,
            fullApplicantData: fullApplicantData,
            idDocs: fullApplicantData.idDocs || null
          };
        } catch (fetchError) {
          console.error(`⚠️ Error fetching full applicant data:`, fetchError);
          // If error has errorResponse, store it
          if (fetchError.errorResponse) {
            sumsubResponseData = {
              ...payload,
              fetchError: fetchError.errorResponse
            };
          } else {
            // Store the error in the response
            sumsubResponseData = {
              ...payload,
              fetchError: {
                error: true,
                message: fetchError.message || 'Failed to fetch applicant data'
              }
            };
          }
        }
      }

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
             sumsub_verification_result = $6,
             sumsub_webhook_received_at = NOW(),
             reviewed_at = CASE WHEN $1 = 'approved' OR $1 = 'rejected' THEN NOW() ELSE reviewed_at END,
             updated_at = NOW()
         WHERE user_id = $7`,
        [
          status,
          actualApplicantId,
          reviewAnswer,
          reviewComment,
          type,
          JSON.stringify(sumsubResponseData),
          userId
        ]
      );

      // If no record was updated, insert a new one
      if (updateResult.rowCount === 0) {
        await pool.query(
          `INSERT INTO kyc_verifications (user_id, status, sumsub_applicant_id, sumsub_review_result, sumsub_review_comment, sumsub_verification_status, sumsub_verification_result, sumsub_webhook_received_at, reviewed_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), CASE WHEN $2 = 'approved' OR $2 = 'rejected' THEN NOW() ELSE NULL END, NOW())`,
          [
            userId,
            status,
            actualApplicantId,
            reviewAnswer,
            reviewComment,
            type,
            JSON.stringify(sumsubResponseData)
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
