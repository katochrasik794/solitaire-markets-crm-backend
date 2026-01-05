import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/ib-requests
 * Create a new IB partnership application
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { ib_experience, previous_clients_count, willing_to_become_ib, willing_to_sign_agreement } = req.body;

    // Validate required fields
    if (!ib_experience || !previous_clients_count || !willing_to_become_ib || !willing_to_sign_agreement) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if user already has a pending or approved request
    const existingRequest = await pool.query(
      `SELECT id, status FROM ib_requests 
       WHERE user_id = $1 AND status IN ('pending', 'approved')
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (existingRequest.rows.length > 0) {
      const existingStatus = existingRequest.rows[0].status;
      if (existingStatus === 'approved') {
        return res.status(400).json({
          success: false,
          message: 'You already have an approved IB partnership'
        });
      } else if (existingStatus === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'You already have a pending IB partnership application'
        });
      }
    }

    // Validate willing_to_become_ib and willing_to_sign_agreement
    if (!['yes', 'no'].includes(willing_to_become_ib)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid value for willing_to_become_ib'
      });
    }

    if (!['yes', 'no'].includes(willing_to_sign_agreement)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid value for willing_to_sign_agreement'
      });
    }

    // Validate previous_clients_count is a positive integer
    const clientsCount = parseInt(previous_clients_count);
    if (isNaN(clientsCount) || clientsCount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Previous clients count must be a valid non-negative number'
      });
    }

    // Insert new IB request
    const result = await pool.query(
      `INSERT INTO ib_requests 
       (user_id, ib_experience, previous_clients_count, willing_to_become_ib, willing_to_sign_agreement, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, user_id, ib_experience, previous_clients_count, willing_to_become_ib, 
                 willing_to_sign_agreement, status, created_at`,
      [userId, ib_experience, clientsCount, willing_to_become_ib, willing_to_sign_agreement]
    );

    const ibRequest = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'IB partnership application submitted successfully',
      data: {
        ibRequest: {
          id: ibRequest.id,
          userId: ibRequest.user_id,
          ibExperience: ibRequest.ib_experience,
          previousClientsCount: ibRequest.previous_clients_count,
          willingToBecomeIB: ibRequest.willing_to_become_ib,
          willingToSignAgreement: ibRequest.willing_to_sign_agreement,
          status: ibRequest.status,
          createdAt: ibRequest.created_at
        }
      }
    });
  } catch (error) {
    console.error('Create IB request error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/status
 * Get current user's IB request status
 */
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get the latest IB request for the user
    const result = await pool.query(
      `SELECT id, status, rejection_reason, created_at, reviewed_at
       FROM ib_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          status: null,
          hasRequest: false
        }
      });
    }

    const ibRequest = result.rows[0];

    res.json({
      success: true,
      data: {
        status: ibRequest.status,
        hasRequest: true,
        rejectionReason: ibRequest.rejection_reason,
        createdAt: ibRequest.created_at,
        reviewedAt: ibRequest.reviewed_at
      }
    });
  } catch (error) {
    console.error('Get IB request status error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests
 * Get current user's IB requests (all)
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, ib_experience, previous_clients_count, willing_to_become_ib, 
              willing_to_sign_agreement, status, rejection_reason, created_at, reviewed_at
       FROM ib_requests
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        ibRequests: result.rows.map(row => ({
          id: row.id,
          ibExperience: row.ib_experience,
          previousClientsCount: row.previous_clients_count,
          willingToBecomeIB: row.willing_to_become_ib,
          willingToSignAgreement: row.willing_to_sign_agreement,
          status: row.status,
          rejectionReason: row.rejection_reason,
          createdAt: row.created_at,
          reviewedAt: row.reviewed_at
        }))
      }
    });
  } catch (error) {
    console.error('Get IB requests error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/admin
 * Get all IB requests with user details (admin only)
 */
router.get('/admin', authenticate, async (req, res, next) => {
  try {
    // Check if user is admin (you may need to adjust this based on your admin check)
    // For now, we'll assume this endpoint requires admin authentication middleware
    const { status } = req.query;
    
    // Check which columns exist in ib_requests table
    const colsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'ib_requests' AND table_schema = 'public'`
    );
    const existingCols = new Set(colsRes.rows.map(r => r.column_name));
    
    // Build query with optional columns
    let selectCols = [
      'ir.id',
      'ir.user_id',
      'ir.status',
      'ir.ib_experience',
      'ir.previous_clients_count',
      'ir.willing_to_become_ib',
      'ir.willing_to_sign_agreement',
      'ir.rejection_reason',
      'ir.reviewed_by',
      'ir.reviewed_at',
      'ir.created_at',
      'ir.updated_at',
      'u.first_name',
      'u.last_name',
      'u.email',
      'u.referral_code',
      'u.referred_by'
    ];
    
    // Always include referral_code and referred_by from users table
    
    // Add optional columns if they exist
    if (existingCols.has('ib_type')) selectCols.push('ir.ib_type');
    if (existingCols.has('referrer_ib_id')) selectCols.push('ir.referrer_ib_id');
    if (existingCols.has('group_pip_commissions')) selectCols.push('ir.group_pip_commissions');
    if (existingCols.has('approved_at')) selectCols.push('ir.approved_at');
    
    // Check if is_banned column exists in users table
    const userColsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name = 'is_banned' AND table_schema = 'public'`
    );
    const hasIsBanned = userColsRes.rows.length > 0;
    
    if (hasIsBanned) {
      selectCols.push('u.is_banned');
    }
    
    let query = `
      SELECT ${selectCols.join(', ')}
      FROM ib_requests ir
      JOIN users u ON ir.user_id = u.id
    `;
    
    const params = [];
    if (status) {
      query += ` WHERE ir.status = $1`;
      params.push(status);
    }
    
    query += ` ORDER BY ir.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    // Calculate commission stats (placeholder - you may need to implement actual commission calculation)
    const requestsWithStats = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      applicant: {
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User #${row.user_id}`,
        userId: row.user_id,
        email: row.email,
        referralCode: row.referral_code || null,
        referredBy: row.referred_by || null
      },
      status: row.status,
      ibExperience: row.ib_experience || '',
      previousClientsCount: row.previous_clients_count || 0,
      willingToBecomeIB: row.willing_to_become_ib || 'no',
      willingToSignAgreement: row.willing_to_sign_agreement || 'no',
      ibType: row.ib_type || null,
      referrerIbId: row.referrer_ib_id || null,
      groupPipCommissions: (() => {
        if (!row.group_pip_commissions) return {};
        if (typeof row.group_pip_commissions === 'string') {
          try {
            return JSON.parse(row.group_pip_commissions);
          } catch (e) {
            return {};
          }
        }
        return row.group_pip_commissions;
      })(),
      approvedAt: row.approved_at || null,
      rejectionReason: row.rejection_reason,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isBanned: row.is_banned || false,
      // Commission stats (placeholder - implement actual calculation)
      commissionGenerated: {
        own: 0,
        referrals: 0,
        total: 0
      }
    }));
    
    res.json({
      success: true,
      data: {
        requests: requestsWithStats
      }
    });
  } catch (error) {
    console.error('Get IB requests admin error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/active-groups
 * Get active MT5 groups (excluding demo groups)
 */
router.get('/active-groups', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, 
        group_name, 
        dedicated_name,
        currency
       FROM mt5_groups
       WHERE is_active = TRUE 
         AND LOWER(group_name) NOT LIKE '%demo%'
       ORDER BY dedicated_name NULLS LAST, group_name ASC`,
      []
    );
    
    const groups = result.rows.map(row => ({
      id: row.id,
      groupName: row.group_name,
      dedicatedName: row.dedicated_name,
      displayName: row.dedicated_name || row.group_name,
      currency: row.currency
    }));
    
    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error('Get active groups error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/master-ibs
 * Get list of approved Master IBs for referrer selection
 */
router.get('/master-ibs', authenticate, async (req, res, next) => {
  try {
    // Check if ib_type column exists
    const colsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'ib_requests' AND column_name = 'ib_type' AND table_schema = 'public'`
    );
    const hasIbType = colsRes.rows.length > 0;
    
    let query;
    if (hasIbType) {
      query = `
        SELECT DISTINCT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          ir.ib_type
         FROM ib_requests ir
         JOIN users u ON ir.user_id = u.id
         WHERE ir.status = 'approved'
           AND (ir.ib_type = 'master' OR ir.ib_type = 'normal')
         ORDER BY u.first_name, u.last_name
      `;
    } else {
      // If ib_type doesn't exist, return all approved IBs
      query = `
        SELECT DISTINCT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          'normal' as ib_type
         FROM ib_requests ir
         JOIN users u ON ir.user_id = u.id
         WHERE ir.status = 'approved'
         ORDER BY u.first_name, u.last_name
      `;
    }
    
    const result = await pool.query(query, []);
    
    const masterIbs = result.rows.map(row => ({
      id: row.id,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User #${row.id}`,
      email: row.email,
      ibType: row.ib_type
    }));
    
    res.json({
      success: true,
      data: masterIbs
    });
  } catch (error) {
    console.error('Get master IBs error:', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/:id/approve
 * Approve IB request with ib_type, referrer, and pip commissions
 */
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { ib_type, referrer_ib_id, group_pip_commissions } = req.body;
    
    if (!requestId || isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }
    
    // Normalize 'normal' to 'master' for backward compatibility
    const normalizedIbType = ib_type === 'normal' ? 'master' : ib_type;
    
    // Validate ib_type
    if (!normalizedIbType || !['master', 'sub_ib'].includes(normalizedIbType)) {
      return res.status(400).json({
        success: false,
        message: 'Valid ib_type is required (master or sub_ib)'
      });
    }
    
    // If sub_ib, require referrer_ib_id
    if (normalizedIbType === 'sub_ib' && !referrer_ib_id) {
      return res.status(400).json({
        success: false,
        message: 'referrer_ib_id is required for Sub-IB type'
      });
    }
    
    // Validate referrer exists if provided
    if (referrer_ib_id) {
      const referrerCheck = await pool.query(
        `SELECT id FROM users WHERE id = $1`,
        [referrer_ib_id]
      );
      if (referrerCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Referrer IB not found'
        });
      }
    }
    
    // Validate group_pip_commissions is an object
    let pipCommissions = {};
    if (group_pip_commissions) {
      if (typeof group_pip_commissions !== 'object' || Array.isArray(group_pip_commissions)) {
        return res.status(400).json({
          success: false,
          message: 'group_pip_commissions must be an object'
        });
      }
      pipCommissions = group_pip_commissions;
      
      // Validate all pip values are numeric
      for (const [groupId, pipValue] of Object.entries(pipCommissions)) {
        if (pipValue !== null && pipValue !== '' && isNaN(parseFloat(pipValue))) {
          return res.status(400).json({
            success: false,
            message: `Invalid pip value for group ${groupId}: must be a number`
          });
        }
      }
    }
    
    // Check if request exists and is pending
    const requestCheck = await pool.query(
      `SELECT id, status FROM ib_requests WHERE id = $1`,
      [requestId]
    );
    
    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB request not found'
      });
    }
    
    if (requestCheck.rows[0].status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `IB request is already ${requestCheck.rows[0].status}`
      });
    }
    
    // Note: reviewed_by references admin(id), but req.user.id is from users table
    // Setting reviewed_by to NULL to avoid foreign key constraint violation
    // The foreign key allows NULL (ON DELETE SET NULL)
    
    // Update the request
    const updateResult = await pool.query(
      `UPDATE ib_requests 
       SET status = 'approved',
           ib_type = $1,
           referrer_ib_id = $2,
           group_pip_commissions = $3,
           approved_at = NOW(),
           reviewed_by = NULL,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        normalizedIbType,
        referrer_ib_id || null,
        JSON.stringify(pipCommissions),
        requestId
      ]
    );
    
    res.json({
      success: true,
      message: 'IB request approved successfully',
      data: {
        request: updateResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Approve IB request error:', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/:id/reject
 * Reject IB request
 */
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { rejection_reason } = req.body;
    
    if (!requestId || isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }
    
    // Check if request exists and is pending
    const requestCheck = await pool.query(
      `SELECT id, status FROM ib_requests WHERE id = $1`,
      [requestId]
    );
    
    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB request not found'
      });
    }
    
    if (requestCheck.rows[0].status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `IB request is already ${requestCheck.rows[0].status}`
      });
    }
    
    // Note: reviewed_by references admin(id), but req.user.id is from users table
    // Setting reviewed_by to NULL to avoid foreign key constraint violation
    // The foreign key allows NULL (ON DELETE SET NULL)
    
    // Update the request
    const updateResult = await pool.query(
      `UPDATE ib_requests 
       SET status = 'rejected',
           rejection_reason = $1,
           reviewed_by = NULL,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [
        rejection_reason || null,
        requestId
      ]
    );
    
    res.json({
      success: true,
      message: 'IB request rejected successfully',
      data: {
        request: updateResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Reject IB request error:', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/:id/status
 * Change IB request status
 */
router.post('/:id/status', authenticate, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (!requestId || isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }
    
    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (pending, approved, or rejected)'
      });
    }
    
    // Check if request exists
    const requestCheck = await pool.query(
      `SELECT id, status FROM ib_requests WHERE id = $1`,
      [requestId]
    );
    
    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB request not found'
      });
    }
    
    // Update the status
    const updateResult = await pool.query(
      `UPDATE ib_requests 
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, requestId]
    );
    
    res.json({
      success: true,
      message: 'Status updated successfully',
      data: {
        request: updateResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Change IB request status error:', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/:id/ban
 * Ban or unban an IB user
 */
router.post('/:id/ban', authenticate, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { user_id, is_banned } = req.body;
    
    if (!requestId || isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }
    
    if (is_banned === undefined) {
      return res.status(400).json({
        success: false,
        message: 'is_banned is required'
      });
    }
    
    // Check if request exists and is approved
    const requestCheck = await pool.query(
      `SELECT id, user_id, status FROM ib_requests WHERE id = $1`,
      [requestId]
    );
    
    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB request not found'
      });
    }
    
    if (requestCheck.rows[0].status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Can only ban/unban approved IBs'
      });
    }
    
    const userId = user_id || requestCheck.rows[0].user_id;
    
    // Check if is_banned column exists in users table, if not add it
    const colsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name = 'is_banned' AND table_schema = 'public'`
    );
    
    if (colsRes.rows.length === 0) {
      // Add is_banned column if it doesn't exist
      await pool.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned)`
      );
    }
    
    // Update user's ban status
    const updateResult = await pool.query(
      `UPDATE users 
       SET is_banned = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, is_banned`,
      [is_banned, userId]
    );
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: is_banned ? 'IB banned successfully' : 'IB unbanned successfully',
      data: {
        user: updateResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Ban/unban IB error:', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/:id/ib-type
 * Update IB type for an approved IB request
 */
router.post('/:id/ib-type', authenticate, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { ib_type, referrer_ib_id } = req.body;
    
    if (!requestId || isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }
    
    // Normalize 'normal' to 'master' for backward compatibility
    const normalizedIbType = ib_type === 'normal' ? 'master' : ib_type;
    
    if (!normalizedIbType || !['master', 'sub_ib'].includes(normalizedIbType)) {
      return res.status(400).json({
        success: false,
        message: 'Valid ib_type is required (master or sub_ib)'
      });
    }
    
    // If sub_ib, require referrer_ib_id
    if (normalizedIbType === 'sub_ib' && !referrer_ib_id) {
      return res.status(400).json({
        success: false,
        message: 'referrer_ib_id is required for Sub-IB type'
      });
    }
    
    // Check if request exists and is approved
    const requestCheck = await pool.query(
      `SELECT id, status FROM ib_requests WHERE id = $1`,
      [requestId]
    );
    
    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB request not found'
      });
    }
    
    if (requestCheck.rows[0].status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Can only update IB type for approved requests'
      });
    }
    
    // Validate referrer exists if provided
    if (referrer_ib_id) {
      const referrerCheck = await pool.query(
        `SELECT id FROM users WHERE id = $1`,
        [referrer_ib_id]
      );
      if (referrerCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Referrer IB not found'
        });
      }
    }
    
    // Check if ib_type column exists
    const colsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'ib_requests' AND column_name = 'ib_type' AND table_schema = 'public'`
    );
    const hasIbType = colsRes.rows.length > 0;
    
    if (!hasIbType) {
      return res.status(400).json({
        success: false,
        message: 'IB type column does not exist. Please run the migration.'
      });
    }
    
    // Build update query
    let updateQuery = `UPDATE ib_requests SET updated_at = NOW()`;
    const params = [];
    let paramIndex = 1;
    
    updateQuery += `, ib_type = $${paramIndex}`;
    params.push(normalizedIbType);
    paramIndex++;
    
    // Check if referrer_ib_id column exists
    const hasReferrerCol = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'ib_requests' AND column_name = 'referrer_ib_id' AND table_schema = 'public'`
    );
    
    if (hasReferrerCol.rows.length > 0) {
      updateQuery += `, referrer_ib_id = $${paramIndex}`;
      params.push(referrer_ib_id || null);
      paramIndex++;
    }
    
    updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(requestId);
    
    const updateResult = await pool.query(updateQuery, params);
    
    res.json({
      success: true,
      message: 'IB type updated successfully',
      data: {
        request: updateResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Update IB type error:', error);
    next(error);
  }
});

export default router;

