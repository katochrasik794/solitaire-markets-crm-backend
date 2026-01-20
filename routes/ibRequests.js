import express from 'express';
import pool from '../config/database.js';
import { authenticate, authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/ib-requests/plans
 * Get all saved plans for the current IB
 */
router.get('/plans', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT * FROM ib_plans WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get IB plans error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/:id/plans
 * Get all saved plans for a specific IB (admin only)
 */
router.get('/:id/plans', authenticateAdmin, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);

    // Get user_id for this request
    const ibRes = await pool.query('SELECT user_id FROM ib_requests WHERE id = $1', [requestId]);
    if (ibRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'IB request not found' });
    }
    const userId = ibRes.rows[0].user_id;

    const result = await pool.query(
      'SELECT * FROM ib_plans WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get IB plans error (admin):', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/plans
 * Save a new IB plan (custom link structure)
 */
router.post('/plans', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, plan_type, levels_count, structure, link_data } = req.body;

    if (!name || !levels_count || !structure || !link_data) {
      return res.status(400).json({
        success: false,
        message: 'Name, levels count, structure, and link data are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO ib_plans 
        (user_id, name, plan_type, levels_count, structure, link_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, name, plan_type || 'advanced', levels_count, JSON.stringify(structure), link_data]
    );

    res.status(201).json({
      success: true,
      message: 'IB plan saved successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Save IB plan error:', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/admin/plans
 * Admin creates a plan for a specific IB
 */
router.post('/admin/plans', authenticateAdmin, async (req, res, next) => {
  try {
    const { name, plan_type, levels_count, structure, link_data, user_id } = req.body;

    if (!name || !levels_count || !structure || !link_data || !user_id) {
      return res.status(400).json({
        success: false,
        message: 'Name, levels count, structure, link data, and user_id are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO ib_plans 
        (user_id, name, plan_type, levels_count, structure, link_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user_id, name, plan_type || 'advanced', levels_count, JSON.stringify(structure), link_data]
    );

    res.status(201).json({
      success: true,
      message: 'IB plan created successfully by admin',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin create plan error:', error);
    next(error);
  }
});

/**
 * PUT /api/ib-requests/plans/:planId
 * Update an existing IB plan (admin only)
 */
router.put('/plans/:planId', authenticateAdmin, async (req, res, next) => {
  try {
    const planId = parseInt(req.params.planId);
    const { name, levels_count, structure, link_data } = req.body;

    if (!name || !levels_count || !structure) {
      return res.status(400).json({
        success: false,
        message: 'Name, levels_count, and structure are required'
      });
    }

    const result = await pool.query(
      `UPDATE ib_plans 
       SET name = $1, levels_count = $2, structure = $3, link_data = COALESCE($4, link_data), updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name, levels_count, JSON.stringify(structure), link_data, planId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB plan not found'
      });
    }

    res.json({
      success: true,
      message: 'IB plan updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update IB plan error:', error);
    next(error);
  }
});

/**
 * DELETE /api/ib-requests/plans/:planId
 * Delete an IB plan (admin only)
 */
router.delete('/plans/:planId', authenticateAdmin, async (req, res, next) => {
  try {
    const planId = parseInt(req.params.planId);

    const result = await pool.query(
      'DELETE FROM ib_plans WHERE id = $1 RETURNING *',
      [planId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB plan not found'
      });
    }

    res.json({
      success: true,
      message: 'IB plan deleted successfully'
    });
  } catch (error) {
    console.error('Delete IB plan error:', error);
    next(error);
  }
});

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
 * GET /api/ib-requests/symbols-with-categories
 * List symbols from symbols_with_categories with optional filters (admin only)
 */
router.get('/symbols-with-categories', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      search = '',
      category,
      group_name,
      status,
      page = '1',
      pageSize = '25'
    } = req.query;

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const sizeNum = Math.min(Math.max(parseInt(pageSize) || 25, 1), 500);
    const offset = (pageNum - 1) * sizeNum;

    const whereParts = [];
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereParts.push(
        `(LOWER(symbol) LIKE $${params.length} OR LOWER(pair) LIKE $${params.length} OR LOWER(group_name) LIKE $${params.length} OR LOWER(category) LIKE $${params.length})`
      );
    }

    if (category) {
      params.push(category.toLowerCase());
      whereParts.push(`LOWER(category) = $${params.length}`);
    }

    if (group_name) {
      params.push(group_name.toLowerCase());
      whereParts.push(`LOWER(group_name) = $${params.length}`);
    }

    if (status) {
      params.push(status.toLowerCase());
      whereParts.push(`LOWER(status) = $${params.length}`);
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    // Total count
    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM symbols_with_categories ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count || 0);

    // Paged rows
    params.push(sizeNum);
    params.push(offset);
    const rowsResult = await pool.query(
      `SELECT 
        id,
        symbol,
        pair,
        group_name,
        category,
        pip_per_lot,
        pip_value,
        commission,
        currency,
        status,
        contract_size,
        digits,
        spread,
        profit_mode,
        is_override,
        created_at,
        updated_at
       FROM symbols_with_categories
       ${whereClause}
       ORDER BY symbol ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: {
        rows: rowsResult.rows,
        total,
        page: pageNum,
        pageSize: sizeNum
      }
    });
  } catch (error) {
    console.error('Get symbols_with_categories error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/symbols-summary
 * Summary stats for symbols_with_categories (admin only)
 */
router.get('/symbols-summary', authenticateAdmin, async (req, res, next) => {
  try {
    const totalResult = await pool.query(
      'SELECT COUNT(*) AS total FROM symbols_with_categories'
    );
    const configuredResult = await pool.query(
      'SELECT COUNT(*) AS configured FROM symbols_with_categories WHERE pip_per_lot IS NOT NULL'
    );
    const overridesResult = await pool.query(
      'SELECT COUNT(*) AS overrides FROM symbols_with_categories WHERE is_override = TRUE'
    );
    const categoriesResult = await pool.query(
      `SELECT category, COUNT(*) AS count 
       FROM symbols_with_categories 
       GROUP BY category 
       ORDER BY category ASC`
    );

    res.json({
      success: true,
      data: {
        totalSymbols: parseInt(totalResult.rows[0]?.total || 0),
        configuredPipLot: parseInt(configuredResult.rows[0]?.configured || 0),
        overrides: parseInt(overridesResult.rows[0]?.overrides || 0),
        categories: categoriesResult.rows
      }
    });
  } catch (error) {
    console.error('Get symbols summary error:', error);
    next(error);
  }
});

/**
 * Trigger MT5 symbols sync into symbols_with_categories (admin only)
 */
router.get('/symbols/sync', authenticateAdmin, async (req, res, next) => {
  const { accountType } = req.query;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendProgress = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    sendProgress({ status: 'starting', message: `Initializing sync for ${accountType || 'all accounts'}...` });

    const { default: runSync } = await import('../scripts/sync_symbols_from_mt5.js');

    await runSync(accountType, (progress) => {
      sendProgress(progress);
    });

    sendProgress({ status: 'success', message: 'Synchronization completed successfully.' });
    res.end();
  } catch (error) {
    console.error('Symbols sync API error:', error);
    sendProgress({ status: 'error', message: error.message });
    res.end();
  }
});

/**
 * POST /api/ib-requests/symbols/add
 * Manually add a new symbol (admin only)
 */
router.post('/symbols/add', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      symbol,
      pair,
      group_name,
      category,
      pip_per_lot,
      pip_value,
      commission,
      currency,
      status = 'active',
      contract_size,
      digits,
      spread,
      profit_mode
    } = req.body;

    if (!symbol || !group_name) {
      return res.status(400).json({
        success: false,
        message: 'Symbol and Group Name are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO symbols_with_categories
        (symbol, pair, group_name, category, pip_per_lot, pip_value, commission, currency, status, contract_size, digits, spread, profit_mode, is_override, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, NOW(), NOW())
       RETURNING *`,
      [
        symbol,
        pair,
        group_name,
        category,
        pip_per_lot || 1.0,
        pip_value,
        commission || 0,
        currency || 'USD',
        status,
        contract_size,
        digits,
        spread,
        profit_mode
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Symbol added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Add symbol error:', error);
    next(error);
  }
});

/**
 * PUT /api/ib-requests/symbols/:id
 * Update an existing symbol (admin only)
 */
router.put('/symbols/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      pair,
      category,
      pip_per_lot,
      pip_value,
      commission,
      currency,
      status,
      contract_size,
      digits,
      spread,
      profit_mode,
      is_override = true
    } = req.body;

    const result = await pool.query(
      `UPDATE symbols_with_categories
       SET pair = COALESCE($2, pair),
           category = COALESCE($3, category),
           pip_per_lot = COALESCE($4, pip_per_lot),
           pip_value = COALESCE($5, pip_value),
           commission = COALESCE($6, commission),
           currency = COALESCE($7, currency),
           status = COALESCE($8, status),
           contract_size = COALESCE($9, contract_size),
           digits = COALESCE($10, digits),
           spread = COALESCE($11, spread),
           profit_mode = COALESCE($12, profit_mode),
           is_override = $13,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        pair,
        category,
        pip_per_lot,
        pip_value,
        commission,
        currency,
        status,
        contract_size,
        digits,
        spread,
        profit_mode,
        is_override
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Symbol not found'
      });
    }

    res.json({
      success: true,
      message: 'Symbol updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update symbol error:', error);
    next(error);
  }
});

/**
 * DELETE /api/ib-requests/symbols/:id
 * Delete a symbol (admin only)
 */
router.delete('/symbols/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM symbols_with_categories WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Symbol not found'
      });
    }

    res.json({
      success: true,
      message: 'Symbol deleted successfully'
    });
  } catch (error) {
    console.error('Delete symbol error:', error);
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
router.get('/admin', authenticateAdmin, async (req, res, next) => {
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
    if (existingCols.has('plan_type')) selectCols.push('ir.plan_type');

    // Add custom plans count subquery
    selectCols.push('(SELECT COUNT(*) FROM ib_plans WHERE user_id = ir.user_id) as custom_plans_count');

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
      planType: row.plan_type || null,
      customPlansCount: parseInt(row.custom_plans_count || 0),
      workingPlansCount: row.plan_type === 'normal' ? 1 : parseInt(row.custom_plans_count || 0),
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
router.get('/active-groups', authenticateAdmin, async (req, res, next) => {
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
router.get('/master-ibs', authenticateAdmin, async (req, res, next) => {
  console.log('GET /api/ib-requests/master-ibs hit');
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
router.post('/:id/approve', authenticateAdmin, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { ib_type, referrer_ib_id, group_pip_commissions, plan_type, show_commission_structure } = req.body;

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
      `SELECT id, user_id, status FROM ib_requests WHERE id = $1`,
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

    // If no pip commissions provided, fetch defaults from group_commission_distribution
    if (Object.keys(pipCommissions).length === 0) {
      const userId = requestCheck.rows[0].user_id;
      const defaultsRes = await pool.query(
        `SELECT group_path, pip_value 
         FROM group_commission_distribution 
         WHERE is_active = true 
           AND (availability = 'All Users' OR id IN (
             SELECT distribution_id FROM group_commission_users WHERE user_id = $1
           ))`,
        [userId]
      );
      defaultsRes.rows.forEach(row => {
        pipCommissions[row.group_path] = row.pip_value;
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
           plan_type = $4,
           show_commission_structure = $5,
           approved_at = NOW(),
           reviewed_by = NULL,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        normalizedIbType,
        referrer_ib_id || null,
        JSON.stringify(pipCommissions),
        plan_type || null, // Allow NULL so user can pick
        show_commission_structure !== false,
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
router.post('/:id/reject', authenticateAdmin, async (req, res, next) => {
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
router.post('/:id/status', authenticateAdmin, async (req, res, next) => {
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
router.post('/:id/ban', authenticateAdmin, async (req, res, next) => {
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
      message: is_banned ? 'IB locked successfully' : 'IB unlocked successfully',
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
 * GET /api/ib-requests/commission-distributions
 * List all group commission distributions (admin only)
 */
router.get('/commission-distributions', authenticateAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        d.*,
        (SELECT COUNT(*) FROM group_commission_users u WHERE u.distribution_id = d.id) as availability_count,
        (SELECT json_agg(json_build_object('id', u.user_id, 'name', CONCAT(usr.first_name, ' ', usr.last_name), 'email', usr.email))
         FROM group_commission_users u
         JOIN users usr ON u.user_id = usr.id
         WHERE u.distribution_id = d.id) as selected_users
       FROM group_commission_distribution d
       ORDER BY d.created_at DESC`
    );

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        groupPath: row.group_path,
        displayName: row.display_name,
        pipValue: row.pip_value,
        availability: row.availability,
        availabilityCount: parseInt(row.availability_count || 0),
        selectedUsers: row.selected_users || [],
        status: row.is_active ? 'Active' : 'Inactive',
        is_active: row.is_active,
        created: row.created_at,
        updated: row.updated_at
      }))
    });
  } catch (error) {
    console.error('Get commission distributions error:', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/commission-distributions
 * Create a new group commission distribution (admin only)
 */
router.post('/commission-distributions', authenticateAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { group_path, display_name, pip_value, availability, is_active, user_ids } = req.body;

    if (!group_path || !display_name) {
      return res.status(400).json({ success: false, message: 'Group path and display name are required' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO group_commission_distribution 
        (group_path, display_name, pip_value, availability, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [group_path, display_name, pip_value || 0, availability || 'All Users', is_active !== false]
    );

    const distributionId = result.rows[0].id;

    if (availability === 'Selected Users' && Array.isArray(user_ids) && user_ids.length > 0) {
      for (const userId of user_ids) {
        await client.query(
          `INSERT INTO group_commission_users (distribution_id, user_id) VALUES ($1, $2)`,
          [distributionId, userId]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Commission distribution created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create commission distribution error:', error);
    next(error);
  } finally {
    client.release();
  }
});

/**
 * PUT /api/ib-requests/commission-distributions/:id
 * Update a group commission distribution (admin only)
 */
router.put('/commission-distributions/:id', authenticateAdmin, async (req, res, next) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const { display_name, pip_value, availability, is_active, user_ids } = req.body;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE group_commission_distribution 
       SET display_name = COALESCE($1, display_name),
           pip_value = COALESCE($2, pip_value),
           availability = COALESCE($3, availability),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [display_name, pip_value, availability, is_active, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Distribution not found' });
    }

    // Update selected users if availability is 'Selected Users'
    if (availability === 'Selected Users' && Array.isArray(user_ids)) {
      await client.query('DELETE FROM group_commission_users WHERE distribution_id = $1', [id]);
      for (const userId of user_ids) {
        await client.query(
          `INSERT INTO group_commission_users (distribution_id, user_id) VALUES ($1, $2)`,
          [id, userId]
        );
      }
    } else if (availability === 'All Users') {
      await client.query('DELETE FROM group_commission_users WHERE distribution_id = $1', [id]);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Commission distribution updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update commission distribution error:', error);
    next(error);
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/ib-requests/commission-distributions/:id
 * Delete a group commission distribution (admin only)
 */
router.delete('/commission-distributions/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM group_commission_distribution WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Distribution not found' });
    }

    res.json({ success: true, message: 'Commission distribution deleted successfully' });
  } catch (error) {
    console.error('Delete commission distribution error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/users-search
 * Search users for commission distribution selection (admin only)
 */
router.get('/users-search', authenticateAdmin, async (req, res, next) => {
  try {
    const { q = '' } = req.query;
    const result = await pool.query(
      `SELECT id, first_name, last_name, email 
       FROM users 
       WHERE ($1 = '' OR LOWER(first_name) LIKE $2 
          OR LOWER(last_name) LIKE $2 
          OR LOWER(email) LIKE $2)
       ORDER BY first_name ASC`,
      [q, `%${q.toLowerCase()}%`]
    );

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User #${row.id}`,
        email: row.email
      }))
    });
  } catch (error) {
    console.error('User search error:', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/commission-distributions/add-all
 * Bulk add all active groups as distributions (admin only)
 */
router.post('/commission-distributions/add-all', authenticateAdmin, async (req, res, next) => {
  try {
    // Fetch active groups from mt5_groups that aren't already in distributions
    const result = await pool.query(
      `INSERT INTO group_commission_distribution (group_path, display_name, pip_value, availability, is_active, updated_at)
       SELECT 
         mg.group_name, 
         mg.dedicated_name, 
         0.00, 
         'All Users', 
         true,
         NOW()
       FROM mt5_groups mg
       WHERE mg.is_active = true
         AND LOWER(mg.group_name) NOT LIKE '%demo%'
         AND NOT EXISTS (SELECT 1 FROM group_commission_distribution gcd WHERE gcd.group_path = mg.group_name)
       RETURNING id`
    );

    res.json({
      success: true,
      message: `Successfully added ${result.rows.length} new distributions`,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Add all distributions error:', error);
    next(error);
  }
});


/**
 * POST /api/ib-requests/:id/ib-type
 * Update IB type for an approved IB request
 */
router.post('/:id/ib-type', authenticateAdmin, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { ib_type, referrer_ib_id, plan_type, show_commission_structure } = req.body;

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

    updateQuery += `, plan_type = $${paramIndex}`;
    params.push(plan_type !== undefined ? plan_type : null); // undefined means keep current, but here we usually pass what we want
    paramIndex++;

    updateQuery += `, show_commission_structure = $${paramIndex}`;
    params.push(show_commission_structure !== false);
    paramIndex++;

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

/**
 * POST /api/ib-requests/:id/pip-rates
 * Update pip rates for an approved IB request (admin only)
 */
router.post('/:id/pip-rates', authenticateAdmin, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { group_pip_commissions } = req.body;

    if (!requestId || isNaN(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
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
        message: 'Can only update pip rates for approved requests'
      });
    }

    // Validate group_pip_commissions is an object
    if (!group_pip_commissions || typeof group_pip_commissions !== 'object' || Array.isArray(group_pip_commissions)) {
      return res.status(400).json({
        success: false,
        message: 'group_pip_commissions must be an object'
      });
    }

    // Validate all pip values are numeric
    const cleanedCommissions = {};
    for (const [groupId, pipValue] of Object.entries(group_pip_commissions)) {
      if (pipValue !== null && pipValue !== '' && pipValue !== undefined) {
        const numValue = parseFloat(pipValue);
        if (isNaN(numValue) || numValue < 0) {
          return res.status(400).json({
            success: false,
            message: `Invalid pip value for group ${groupId}: must be a non-negative number`
          });
        }
        cleanedCommissions[groupId] = numValue;
      }
    }

    // Check if group_pip_commissions column exists
    const colsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'ib_requests' AND column_name = 'group_pip_commissions' AND table_schema = 'public'`
    );

    if (colsRes.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'group_pip_commissions column does not exist. Please run the migration.'
      });
    }

    // Update the pip commissions
    const updateResult = await pool.query(
      `UPDATE ib_requests 
       SET group_pip_commissions = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(cleanedCommissions), requestId]
    );

    res.json({
      success: true,
      message: 'Pip rates updated successfully',
      data: {
        request: updateResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Update pip rates error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/profiles-by-groups
 * Get approved IBs with their accounts grouped by active MT5 groups (admin only)
 */
router.get('/profiles-by-groups', authenticateAdmin, async (req, res, next) => {
  try {
    // First, get all active MT5 groups
    const activeGroupsResult = await pool.query(
      `SELECT 
        id, group_name, dedicated_name, currency, is_active
       FROM mt5_groups
       WHERE is_active = TRUE 
         AND LOWER(group_name) NOT LIKE '%demo%'
       ORDER BY dedicated_name NULLS LAST, group_name ASC`
    );

    const activeGroups = activeGroupsResult.rows;
    const groupMap = new Map();
    activeGroups.forEach(group => {
      groupMap.set(group.id, {
        id: group.id,
        groupName: group.group_name,
        dedicatedName: group.dedicated_name || group.group_name,
        currency: group.currency,
        ibs: []
      });
    });

    // Get all approved IBs
    const approvedIbsResult = await pool.query(
      `SELECT 
        ir.id as ib_request_id,
        ir.user_id,
        ir.ib_type,
        ir.referrer_ib_id,
        ir.group_pip_commissions,
        COALESCE(ir.ib_balance, 0) as ib_balance,
        (
           COALESCE((SELECT SUM(commission_amount) FROM ib_commissions WHERE ib_id = ir.id), 0) +
           COALESCE((SELECT SUM(amount) FROM ib_distributions WHERE ib_id = ir.id), 0)
        ) as total_commission,
        ir.approved_at,
        ir.plan_type,
        (SELECT COUNT(*) FROM ib_plans WHERE user_id = ir.user_id) as custom_plans_count,
        u.first_name,
        u.last_name,
        u.email,
        u.referral_code,
        u.referred_by
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       WHERE ir.status = 'approved'
       ORDER BY u.first_name, u.last_name`
    );

    // Check which columns exist in trading_accounts table
    const accountColsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'trading_accounts' AND table_schema = 'public'`
    );
    const accountCols = new Set(accountColsRes.rows.map(r => r.column_name));
    const hasMt5GroupId = accountCols.has('mt5_group_id');
    const hasMt5GroupName = accountCols.has('mt5_group_name');
    const hasGroup = accountCols.has('group');

    // Build select columns dynamically
    let selectCols = [
      'ta.id',
      'ta.account_number',
      'ta.platform',
      'ta.account_type',
      'ta.currency',
      'ta.leverage',
      'ta.account_status',
      'ta.is_demo',
      'ta.created_at'
    ];

    // Add optional columns if they exist
    if (accountCols.has('balance')) selectCols.push('ta.balance');
    if (accountCols.has('equity')) selectCols.push('ta.equity');
    if (hasMt5GroupId) selectCols.push('ta.mt5_group_id');
    if (hasMt5GroupName) selectCols.push('ta.mt5_group_name');
    if (hasGroup) selectCols.push('ta.group');

    // Build WHERE conditions for group filtering
    let groupConditions = [];
    if (hasMt5GroupId) {
      groupConditions.push(`ta.mt5_group_id IN (SELECT id FROM mt5_groups WHERE is_active = TRUE AND LOWER(group_name) NOT LIKE '%demo%')`);
    }
    if (hasMt5GroupName) {
      groupConditions.push(`ta.mt5_group_name IN (SELECT group_name FROM mt5_groups WHERE is_active = TRUE AND LOWER(group_name) NOT LIKE '%demo%')`);
    }
    if (hasGroup) {
      groupConditions.push(`ta.group IN (SELECT group_name FROM mt5_groups WHERE is_active = TRUE AND LOWER(group_name) NOT LIKE '%demo%')`);
    }

    // For each approved IB, get their MT5 accounts grouped by group
    for (const ib of approvedIbsResult.rows) {
      let accountsQuery = `
        SELECT ${selectCols.join(', ')}
        FROM trading_accounts ta
        WHERE ta.user_id = $1 
          AND ta.platform = 'MT5'
          AND ta.is_demo = FALSE
          AND ta.account_status = 'active'
      `;

      // Add group filtering if we have any group columns
      if (groupConditions.length > 0) {
        accountsQuery += ` AND (${groupConditions.join(' OR ')})`;
      }

      accountsQuery += ` ORDER BY ta.created_at DESC`;

      const accountsResult = await pool.query(accountsQuery, [ib.user_id]);

      const ibData = {
        ibRequestId: ib.ib_request_id,
        userId: ib.user_id,
        name: `${ib.first_name || ''} ${ib.last_name || ''}`.trim() || `User #${ib.user_id}`,
        email: ib.email,
        ibType: ib.ib_type || 'normal',
        referralCode: ib.referral_code,
        referredBy: ib.referred_by,
        approvedAt: ib.approved_at,
        approvedAt: ib.approved_at,
        ibBalance: parseFloat(ib.ib_balance || 0),
        totalCommission: parseFloat(ib.total_commission || 0),
        planType: ib.plan_type || null,
        customPlansCount: parseInt(ib.custom_plans_count || 0),
        workingPlansCount: ib.plan_type === 'normal' ? 1 : parseInt(ib.custom_plans_count || 0),
        groupPipCommissions: (() => {
          if (!ib.group_pip_commissions) return {};
          if (typeof ib.group_pip_commissions === 'string') {
            try {
              return JSON.parse(ib.group_pip_commissions);
            } catch (e) {
              return {};
            }
          }
          return ib.group_pip_commissions;
        })(),
        accounts: accountsResult.rows.map(acc => ({
          id: acc.id,
          accountNumber: acc.account_number,
          platform: acc.platform,
          accountType: acc.account_type,
          currency: acc.currency,
          leverage: acc.leverage,
          accountStatus: acc.account_status,
          balance: parseFloat(acc.balance || 0),
          equity: parseFloat(acc.equity || 0),
          mt5GroupId: acc.mt5_group_id || null,
          mt5GroupName: acc.mt5_group_name || acc.group || null,
          createdAt: acc.created_at
        }))
      };

      // Group IBs by their configured pip commission groups (from group_pip_commissions)
      // This way IBs show up in groups they have pip rates configured for, even without accounts
      const groupsWithPipCommissions = new Set();

      // Check which groups this IB has pip commissions configured for
      if (ibData.groupPipCommissions && Object.keys(ibData.groupPipCommissions).length > 0) {
        Object.keys(ibData.groupPipCommissions).forEach(groupIdStr => {
          const groupId = parseInt(groupIdStr);
          if (!isNaN(groupId) && groupMap.has(groupId)) {
            groupsWithPipCommissions.add(groupId);
          }
        });
      }

      // Also group accounts by MT5 group (for showing accounts in the right group)
      const accountsByGroup = new Map();
      ibData.accounts.forEach(account => {
        let groupId = account.mt5GroupId;
        let groupName = account.mt5GroupName;

        // If we don't have groupId, try to find it by group name
        if (!groupId && groupName) {
          const foundGroup = activeGroups.find(g =>
            g.group_name === groupName || g.dedicated_name === groupName
          );
          if (foundGroup) {
            groupId = foundGroup.id;
          }
        }

        // Only group if we have a valid groupId and it exists in our active groups
        if (groupId && groupMap.has(groupId)) {
          if (!accountsByGroup.has(groupId)) {
            accountsByGroup.set(groupId, []);
          }
          accountsByGroup.get(groupId).push(account);
          // Also add to groupsWithPipCommissions if not already there
          groupsWithPipCommissions.add(groupId);
        }
      });

      // Add IB to each group they have pip commissions configured for OR accounts in
      groupsWithPipCommissions.forEach(groupId => {
        if (groupMap.has(groupId)) {
          // Get accounts for this specific group, or empty array if none
          const accountsForThisGroup = accountsByGroup.get(groupId) || [];

          // Check if IB already exists in this group (avoid duplicates)
          const existingIb = groupMap.get(groupId).ibs.find(ib => ib.userId === ibData.userId);
          if (!existingIb) {
            groupMap.get(groupId).ibs.push({
              ...ibData,
              accounts: accountsForThisGroup
            });
          }
        }
      });
    }

    // Convert map to array format
    // Show all active groups, even if they have no IBs (so user can see which groups exist)
    const groupsWithIbs = Array.from(groupMap.values())
      .map(group => ({
        ...group,
        ibCount: group.ibs.length
      }));
    // Removed filter - show all active groups, even with 0 IBs

    // Prepare a flat list of all approved IBs for the frontend table
    const flatIbsList = approvedIbsResult.rows.map(ib => ({
      ibRequestId: ib.ib_request_id,
      userId: ib.user_id,
      name: `${ib.first_name || ''} ${ib.last_name || ''}`.trim() || `User #${ib.user_id}`,
      email: ib.email,
      ibType: ib.ib_type || 'normal',
      referralCode: ib.referral_code,
      referredBy: ib.referred_by,
      ibBalance: parseFloat(ib.ib_balance || 0).toFixed(2),
      totalCommission: `$${parseFloat(ib.total_commission || 0).toFixed(2)}`,
      planType: ib.plan_type || null,
      workingPlansCount: ib.plan_type === 'normal' ? 1 : parseInt(ib.custom_plans_count || 0),
      groupPipCommissions: (() => {
        if (!ib.group_pip_commissions) return {};
        if (typeof ib.group_pip_commissions === 'string') {
          try {
            return JSON.parse(ib.group_pip_commissions);
          } catch (e) {
            return {};
          }
        }
        return ib.group_pip_commissions;
      })(),
      approvedAt: ib.approved_at
    }));

    res.json({
      success: true,
      data: {
        groups: groupsWithIbs,
        totalGroups: groupsWithIbs.length,
        totalIbs: approvedIbsResult.rows.length,
        allIbs: flatIbsList
      }
    });
  } catch (error) {
    console.error('Get IB profiles by groups error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/:id/referred-users
 * Get all users referred by an IB with their MT5 accounts and trade history (admin only)
 */
router.get('/:id/referred-users', authenticateAdmin, async (req, res, next) => {
  try {
    const ibRequestId = parseInt(req.params.id);

    if (!ibRequestId || isNaN(ibRequestId) || ibRequestId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IB request ID'
      });
    }

    // Get the IB request and user details
    const ibRequestResult = await pool.query(
      `SELECT ir.id, ir.user_id, u.referral_code
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       WHERE ir.id = $1 AND ir.status = 'approved'`,
      [ibRequestId]
    );

    if (ibRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB request not found or not approved'
      });
    }

    const ib = ibRequestResult.rows[0];
    const ibReferralCode = ib.referral_code;

    if (!ibReferralCode) {
      return res.json({
        success: true,
        data: {
          referredUsers: [],
          totalUsers: 0,
          ibReferralCode: null
        }
      });
    }

    // Get all users referred by this IB (using referred_by field)
    const referredUsersResult = await pool.query(
      `SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_code,
        u.phone_number,
        u.country,
        u.referral_code,
        u.referred_by,
        u.created_at
       FROM users u
       WHERE u.referred_by = $1
       ORDER BY u.created_at DESC`,
      [ibReferralCode]
    );

    const referredUsers = [];

    // Check which columns exist in trading_accounts (do this once before the loop)
    const accountColsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'trading_accounts' AND table_schema = 'public'`
    );
    const accountCols = new Set(accountColsRes.rows.map(r => r.column_name));

    // Build account select columns dynamically
    let accountSelectCols = [
      'ta.id',
      'ta.account_number',
      'ta.platform',
      'ta.account_type',
      'ta.currency',
      'ta.leverage',
      'ta.account_status',
      'ta.is_demo',
      'ta.created_at'
    ];

    if (accountCols.has('balance')) accountSelectCols.push('ta.balance');
    if (accountCols.has('equity')) accountSelectCols.push('ta.equity');
    if (accountCols.has('mt5_group_id')) accountSelectCols.push('ta.mt5_group_id');
    if (accountCols.has('mt5_group_name')) accountSelectCols.push('ta.mt5_group_name');
    if (accountCols.has('group')) accountSelectCols.push('ta.group');

    // For each referred user, get their MT5 accounts
    for (const user of referredUsersResult.rows) {
      // Get MT5 accounts for this user
      const accountsResult = await pool.query(
        `SELECT ${accountSelectCols.join(', ')}
         FROM trading_accounts ta
         WHERE ta.user_id = $1 
           AND ta.platform = 'MT5'
           AND ta.is_demo = FALSE
         ORDER BY ta.created_at DESC`,
        [user.id]
      );

      const accounts = accountsResult.rows.map(acc => ({
        id: acc.id,
        accountNumber: acc.account_number,
        platform: acc.platform,
        accountType: acc.account_type,
        currency: acc.currency,
        leverage: acc.leverage,
        accountStatus: acc.account_status,
        balance: parseFloat(acc.balance || 0),
        equity: parseFloat(acc.equity || 0),
        mt5GroupId: acc.mt5_group_id,
        mt5GroupName: acc.mt5_group_name || acc.group,
        createdAt: acc.created_at
      }));

      referredUsers.push({
        userId: user.id,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User #${user.id}`,
        email: user.email,
        phone: user.phone_code && user.phone_number ? `${user.phone_code}${user.phone_number}` : null,
        country: user.country,
        referralCode: user.referral_code,
        referredBy: user.referred_by,
        createdAt: user.created_at,
        accounts: accounts,
        accountCount: accounts.length,
        // Trade history will be fetched separately via MT5 API when needed
      });
    }

    res.json({
      success: true,
      data: {
        referredUsers: referredUsers,
        totalUsers: referredUsers.length,
        ibReferralCode: ibReferralCode
      }
    });
  } catch (error) {
    console.error('Get referred users error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/:id/ib-tree
 * Get IB tree structure (hierarchical view of IB network) (admin only)
 * NOTE: This must come before /:id route to avoid route conflicts
 */
router.get('/:id/ib-tree', authenticateAdmin, async (req, res, next) => {
  try {
    const ibRequestId = parseInt(req.params.id);

    if (!ibRequestId || isNaN(ibRequestId) || ibRequestId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IB request ID'
      });
    }

    // Get the IB request and user details
    const ibRequestResult = await pool.query(
      `SELECT ir.id, ir.user_id, ir.ib_type, u.referral_code, u.first_name, u.last_name, u.email
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       WHERE ir.id = $1 AND ir.status = 'approved'`,
      [ibRequestId]
    );

    if (ibRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB request not found or not approved'
      });
    }

    const ib = ibRequestResult.rows[0];
    const ibReferralCode = ib.referral_code;

    // Recursive function to build tree
    const buildTree = async (referralCode, level = 1, maxLevel = 3) => {
      if (level > maxLevel || !referralCode) return null;

      // Get users referred by this referral code
      const usersResult = await pool.query(
        `SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.referral_code,
          u.referred_by,
          ir.id as ib_request_id,
          ir.ib_type,
          ir.status
         FROM users u
         LEFT JOIN ib_requests ir ON u.id = ir.user_id AND ir.status = 'approved'
         WHERE u.referred_by = $1
         ORDER BY u.created_at DESC`,
        [referralCode]
      );

      if (usersResult.rows.length === 0) return null;

      const children = [];

      for (const user of usersResult.rows) {
        const isIB = user.ib_request_id !== null;
        const childTree = user.referral_code
          ? await buildTree(user.referral_code, level + 1, maxLevel)
          : null;

        // Get accounts for this user
        const accountsResult = await pool.query(
          `SELECT COUNT(*) as count, SUM(balance) as total_balance
           FROM trading_accounts
           WHERE user_id = $1 AND platform = 'MT5' AND is_demo = FALSE`,
          [user.id]
        );

        const accountCount = parseInt(accountsResult.rows[0]?.count || 0);
        const totalBalance = parseFloat(accountsResult.rows[0]?.total_balance || 0);

        // Get group_pip_commissions for this IB if they are an IB
        let groupPipCommissions = {};
        if (isIB && user.ib_request_id) {
          const pipCommissionsResult = await pool.query(
            `SELECT group_pip_commissions FROM ib_requests WHERE id = $1`,
            [user.ib_request_id]
          );
          if (pipCommissionsResult.rows.length > 0 && pipCommissionsResult.rows[0].group_pip_commissions) {
            const pipComms = pipCommissionsResult.rows[0].group_pip_commissions;
            if (typeof pipComms === 'string') {
              try {
                groupPipCommissions = JSON.parse(pipComms);
              } catch (e) {
                groupPipCommissions = {};
              }
            } else {
              groupPipCommissions = pipComms;
            }
          }
        }

        children.push({
          userId: user.id,
          ibRequestId: user.ib_request_id,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User #${user.id}`,
          email: user.email,
          referralCode: user.referral_code,
          referredBy: user.referred_by,
          type: isIB ? (user.ib_type || 'IB') : 'Client',
          level: `L${level}`,
          accountCount: accountCount,
          totalBalance: totalBalance,
          groupPipCommissions: groupPipCommissions,
          children: childTree || []
        });
      }

      return children;
    };

    // Build the tree starting from the IB
    const tree = await buildTree(ibReferralCode);

    // Get IB's own accounts
    const ibAccountsResult = await pool.query(
      `SELECT COUNT(*) as count, SUM(balance) as total_balance
       FROM trading_accounts
       WHERE user_id = $1 AND platform = 'MT5' AND is_demo = FALSE`,
      [ib.user_id]
    );

    const ibAccountCount = parseInt(ibAccountsResult.rows[0]?.count || 0);
    const ibTotalBalance = parseFloat(ibAccountsResult.rows[0]?.total_balance || 0);

    // Get group_pip_commissions for the root IB
    let rootGroupPipCommissions = {};
    const rootPipCommissionsResult = await pool.query(
      `SELECT group_pip_commissions FROM ib_requests WHERE id = $1`,
      [ib.id]
    );
    if (rootPipCommissionsResult.rows.length > 0 && rootPipCommissionsResult.rows[0].group_pip_commissions) {
      const pipComms = rootPipCommissionsResult.rows[0].group_pip_commissions;
      if (typeof pipComms === 'string') {
        try {
          rootGroupPipCommissions = JSON.parse(pipComms);
        } catch (e) {
          rootGroupPipCommissions = {};
        }
      } else {
        rootGroupPipCommissions = pipComms;
      }
    }

    const ibTreeData = {
      userId: ib.user_id,
      ibRequestId: ib.id,
      name: `${ib.first_name || ''} ${ib.last_name || ''}`.trim() || `User #${ib.user_id}`,
      email: ib.email,
      referralCode: ibReferralCode,
      type: ib.ib_type || 'IB',
      level: 'L1',
      accountCount: ibAccountCount,
      totalBalance: ibTotalBalance,
      groupPipCommissions: rootGroupPipCommissions,
      children: tree || []
    };

    res.json({
      success: true,
      data: ibTreeData
    });
  } catch (error) {
    console.error('Get IB tree error:', error);
    next(error);
  }
});


/**
 * GET /api/ib-requests/dashboard/stats
 * Get dashboard statistics (admin only)
 */
router.get('/dashboard/stats', authenticateAdmin, async (req, res, next) => {
  try {
    // Total Users
    const totalUsersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(totalUsersResult.rows[0]?.count || 0);

    // Active IBs (approved IB requests)
    const activeIBsResult = await pool.query(
      `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'approved'`
    );
    const activeIBs = parseInt(activeIBsResult.rows[0]?.count || 0);

    // Active Users (30 days) - users who have traded (generated commission) in last 30 days
    let activeUsers30Days = 0;
    try {
      const activeCommCheck = await pool.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ib_commissions')"
      );
      if (activeCommCheck.rows[0]?.exists) {
        const activeUsersResult = await pool.query(
          `SELECT COUNT(DISTINCT client_id) as count
           FROM ib_commissions
           WHERE created_at >= NOW() - INTERVAL '30 days'`
        );
        activeUsers30Days = parseInt(activeUsersResult.rows[0]?.count || 0);
      }
    } catch (e) {
      console.error('Error fetching active users:', e);
    }

    // Trading Accounts (active, non-demo)
    const tradingAccountsResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM trading_accounts 
       WHERE platform = 'MT5' AND is_demo = FALSE AND account_status = 'active'`
    );
    const tradingAccounts = parseInt(tradingAccountsResult.rows[0]?.count || 0);

    // Total Commission - check if commission table exists
    let totalCommission = 0;
    let commissionFromIbs = 0;
    let commissionBreakdown = '';

    // Try to get commission data if table exists
    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (commissionTableCheck.rows[0]?.exists) {
      const commissionResult = await pool.query(
        `SELECT 
          COALESCE(SUM(commission_amount), 0) as total,
          COUNT(DISTINCT ib_id) as ib_count
         FROM ib_commissions`
      );
      totalCommission = parseFloat(commissionResult.rows[0]?.total || 0);
      commissionFromIbs = parseInt(commissionResult.rows[0]?.ib_count || 0);
      commissionBreakdown = `From ${commissionFromIbs} IBs (aggregated)`;
    } else {
      // If no commission table, return 0
      commissionBreakdown = 'Commission tracking not available';
    }

    res.json({
      success: true,
      data: {
        totalUsers,
        activeIBs,
        activeUsers30Days,
        tradingAccounts,
        totalCommission: totalCommission.toFixed(2),
        commissionFromIbs,
        commissionBreakdown
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/dashboard/commission-by-group
 * Get commission breakdown by account group (admin only)
 */
router.get('/dashboard/commission-by-group', authenticateAdmin, async (req, res, next) => {
  try {
    // Check if commission table exists
    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (!commissionTableCheck.rows[0]?.exists) {
      // Return empty data if table doesn't exist
      return res.json({
        success: true,
        data: []
      });
    }

    const { preset, startDate, endDate } = req.query;

    // Calculate date range filter
    let dateFilter = '';
    const queryParams = [];

    // Helper to get date clause
    const getDateClause = (paramIndex) => {
      if (preset === '1') return `AND ic.created_at >= NOW() - INTERVAL '24 hours'`;
      if (preset === '7') return `AND ic.created_at >= NOW() - INTERVAL '7 days'`;
      if (preset === '30') return `AND ic.created_at >= NOW() - INTERVAL '30 days'`;
      if (preset === 'YTD') return `AND ic.created_at >= DATE_TRUNC('year', NOW())`;
      if (preset === 'CUSTOM' && startDate && endDate) {
        return `AND ic.created_at >= $${paramIndex} AND ic.created_at <= $${paramIndex + 1}`;
      }
      return ''; // ALL or default
    };

    // Prepare custom date params if needed
    const customParams = [];
    if (preset === 'CUSTOM' && startDate && endDate) {
      customParams.push(startDate, endDate);
    }

    const whereClause = getDateClause(1); // params start at $1 for the custom check inside join? No, join condition parameters

    // Get commission by group from mt5_groups
    // We filter the JOINED table ib_commissions by date
    const groupQuery = `
      SELECT 
        mg.id,
        mg.dedicated_name,
        mg.group_name,
        COALESCE(SUM(ic.commission_amount), 0) as total_commission,
        COUNT(DISTINCT ic.ib_id) as ib_count
       FROM mt5_groups mg
       LEFT JOIN ib_commissions ic ON ic.group_id = mg.id ${whereClause}
       WHERE mg.is_active = TRUE 
         AND LOWER(mg.group_name) NOT LIKE '%demo%'
       GROUP BY mg.id, mg.dedicated_name, mg.group_name
       ORDER BY total_commission DESC
    `;

    const result = await pool.query(groupQuery, customParams);

    // Calculate total for percentage with SAME filter
    const totalQuery = `
      SELECT COALESCE(SUM(commission_amount), 0) as total 
      FROM ib_commissions ic
      WHERE 1=1 ${whereClause}
    `;
    const totalResult = await pool.query(totalQuery, customParams);
    const totalCommission = parseFloat(totalResult.rows[0]?.total || 0);

    const groups = result.rows.map(row => {
      const amount = parseFloat(row.total_commission || 0);
      const percentage = totalCommission > 0 ? ((amount / totalCommission) * 100).toFixed(1) : '0.0';
      return {
        id: row.id,
        group: row.dedicated_name || row.group_name,
        amount: amount.toFixed(2),
        percentage: `${percentage}%`
      };
    });

    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error('Get commission by group error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/dashboard/commission-chart
 * Get commission data for charts (last 12 months) (admin only)
 */
router.get('/dashboard/commission-chart', authenticateAdmin, async (req, res, next) => {
  try {
    const { preset, startDate, endDate } = req.query;

    // Check if commission table exists
    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (!commissionTableCheck.rows[0]?.exists) {
      return res.json({
        success: true,
        data: { labels: [], data: [] }
      });
    }

    let truncate = 'month';
    let format = 'Mon';
    let interval = '12 months';

    if (preset === '1') {
      truncate = 'hour';
      format = 'HH24:00';
      interval = '24 hours';
    } else if (preset === '7') {
      truncate = 'day';
      format = 'DD Mon';
      interval = '7 days';
    } else if (preset === '30') {
      truncate = 'day';
      format = 'DD Mon';
      interval = '30 days';
    } else if (preset === 'YTD') {
      truncate = 'month';
      format = 'Mon';
      interval = '12 months';
    }

    let result;
    if (preset === 'CUSTOM' && startDate && endDate) {
      result = await pool.query(
        `SELECT 
          TO_CHAR(DATE_TRUNC($1, created_at), $2) as label,
          COALESCE(SUM(commission_amount), 0) as total,
          DATE_TRUNC($1, created_at) as sort_date
         FROM ib_commissions
         WHERE created_at >= $3 AND created_at <= $4
         GROUP BY DATE_TRUNC($1, created_at)
         ORDER BY sort_date ASC`,
        [truncate, format, startDate, endDate]
      );
    } else {
      result = await pool.query(
        `SELECT 
          TO_CHAR(DATE_TRUNC($1, created_at), $2) as label,
          COALESCE(SUM(commission_amount), 0) as total,
          DATE_TRUNC($1, created_at) as sort_date
         FROM ib_commissions
         WHERE created_at >= NOW() - CAST($3 AS INTERVAL)
         GROUP BY DATE_TRUNC($1, created_at)
         ORDER BY sort_date ASC`,
        [truncate, format, interval]
      );
    }

    const labels = result.rows.map(row => row.label);
    const data = result.rows.map(row => parseFloat(row.total || 0));

    res.json({
      success: true,
      data: { labels, data }
    });
  } catch (error) {
    console.error('Get commission chart error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/dashboard/commission-by-category
 * Get commission breakdown by category (admin only)
 */
router.get('/dashboard/commission-by-category', authenticateAdmin, async (req, res, next) => {
  try {
    // Check if commission table exists with category/symbol field
    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (!commissionTableCheck.rows[0]?.exists) {
      return res.json({
        success: true,
        data: {
          Forex: 100,
          Metals: 0,
          Indices: 0,
          Crypto: 0
        }
      });
    }

    // Check if symbol column exists
    const symbolColumnCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
        AND column_name = 'symbol'
      )`
    );

    if (!symbolColumnCheck.rows[0]?.exists) {
      // Default to 100% Forex if no symbol column
      return res.json({
        success: true,
        data: {
          Forex: 100,
          Metals: 0,
          Indices: 0,
          Crypto: 0
        }
      });
    }

    // Categorize symbols with timeframe filtering
    const { preset, startDate, endDate } = req.query;
    let whereClause = 'WHERE symbol IS NOT NULL';
    const params = [];

    if (preset === '1') {
      whereClause += " AND created_at >= NOW() - INTERVAL '24 hours'";
    } else if (preset === '7') {
      whereClause += " AND created_at >= NOW() - INTERVAL '7 days'";
    } else if (preset === '30') {
      whereClause += " AND created_at >= NOW() - INTERVAL '30 days'";
    } else if (preset === 'CUSTOM' && startDate && endDate) {
      whereClause += " AND created_at >= $1 AND created_at <= $2";
      params.push(startDate, endDate);
    }

    const result = await pool.query(
      `SELECT 
        symbol,
        SUM(commission_amount) as total
       FROM ib_commissions
       ${whereClause}
       GROUP BY symbol`,
      params
    );

    const categories = {
      Forex: 0,
      Metals: 0,
      Indices: 0,
      Crypto: 0
    };

    // Symbol categorization logic
    const forexSymbols = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'];
    const metalsSymbols = ['XAU', 'XAG', 'GOLD', 'SILVER', 'XAUUSD', 'XAGUSD'];
    const indicesSymbols = ['US30', 'US500', 'NAS100', 'UK100', 'GER30', 'SPX', 'DJI', 'NDX'];
    const cryptoSymbols = ['BTC', 'ETH', 'BTCUSD', 'ETHUSD', 'XRP', 'LTC'];

    result.rows.forEach(row => {
      const symbol = (row.symbol || '').toUpperCase();
      const amount = parseFloat(row.total || 0);

      if (forexSymbols.some(f => symbol.includes(f))) {
        categories.Forex += amount;
      } else if (metalsSymbols.some(m => symbol.includes(m))) {
        categories.Metals += amount;
      } else if (indicesSymbols.some(i => symbol.includes(i))) {
        categories.Indices += amount;
      } else if (cryptoSymbols.some(c => symbol.includes(c))) {
        categories.Crypto += amount;
      } else {
        // Default to Forex for unknown symbols
        categories.Forex += amount;
      }
    });

    // Calculate percentages
    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
    const percentages = {};
    Object.keys(categories).forEach(key => {
      percentages[key] = total > 0 ? ((categories[key] / total) * 100).toFixed(1) : 0;
    });

    res.json({
      success: true,
      data: percentages
    });
  } catch (error) {
    console.error('Get commission by category error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/dashboard/recent-requests
 * Get recent IB requests (admin only)
 */
router.get('/dashboard/recent-requests', authenticateAdmin, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const result = await pool.query(
      `SELECT 
        ir.id,
        ir.status,
        ir.ib_type,
        ir.created_at,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       ORDER BY ir.created_at DESC
       LIMIT $1`,
      [limit]
    );

    const requests = result.rows.map(row => ({
      id: row.id,
      applicant: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User #${row.user_id}`,
      email: row.email,
      requestedRate: '$1.00', // Default, can be calculated from group_pip_commissions if needed
      type: row.ib_type || 'normal',
      applied: new Date(row.created_at).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(',', ''),
      status: row.status.charAt(0).toUpperCase() + row.status.slice(1)
    }));

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Get recent requests error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/dashboard/recent-commissions
 * Get recent commission ledger entries (admin only)
 */
router.get('/dashboard/recent-commissions', authenticateAdmin, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Check if commission table exists
    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (!commissionTableCheck.rows[0]?.exists) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Get recent commissions with IB and group info
    const result = await pool.query(
      `SELECT 
      ic.id,
      ic.created_at,
      ic.commission_amount as amount,
      ic.symbol,
      ic.lots,
      mg.dedicated_name,
      mg.group_name,
      u.first_name,
      u.last_name,
      ir.id as ib_request_id
     FROM ib_commissions ic
     JOIN users u ON ic.ib_id = u.id
     JOIN ib_requests ir ON u.id = ir.user_id
     LEFT JOIN mt5_groups mg ON ic.group_id = mg.id
     ORDER BY ic.created_at DESC
     LIMIT $1`,
      [limit]
    );

    const commissions = result.rows.map(row => ({
      id: row.id,
      date: new Date(row.created_at).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(',', ''),
      ib: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User #${row.ib_request_id}`,
      symbol: row.symbol || 'N/A',
      group: row.dedicated_name || row.group_name || 'N/A',
      lots: parseFloat(row.lots || 0).toFixed(2),
      commission: `$${parseFloat(row.amount || 0).toFixed(2)}`
    }));

    res.json({
      success: true,
      data: commissions
    });
  } catch (error) {
    console.error('Get recent commissions error:', error);
    next(error);
  }
});


/**
 * GET /api/ib-requests/overview/stats
 * Get overview statistics (admin only)
 */
router.get('/overview/stats', authenticateAdmin, async (req, res, next) => {
  try {
    // Total IBs
    const totalIBsResult = await pool.query('SELECT COUNT(*) as count FROM ib_requests');
    const totalIBs = parseInt(totalIBsResult.rows[0]?.count || 0);

    // Approved IBs
    const approvedIBsResult = await pool.query(
      `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'approved'`
    );
    const approvedIBs = parseInt(approvedIBsResult.rows[0]?.count || 0);

    // Pending IBs
    const pendingIBsResult = await pool.query(
      `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'pending'`
    );
    const pendingIBs = parseInt(pendingIBsResult.rows[0]?.count || 0);

    // Rejected IBs
    const rejectedIBsResult = await pool.query(
      `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'rejected'`
    );
    const rejectedIBs = parseInt(rejectedIBsResult.rows[0]?.count || 0);

    // Approval rate
    const approvalRate = totalIBs > 0 ? ((approvedIBs / totalIBs) * 100).toFixed(1) : '0.0';

    // Total referrals (users referred by IBs)
    const totalReferralsResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM users u
       WHERE u.referred_by IS NOT NULL 
         AND EXISTS (
           SELECT 1 FROM ib_requests ir 
           JOIN users ib_user ON ir.user_id = ib_user.id 
           WHERE ir.status = 'approved' 
             AND ib_user.referral_code = u.referred_by
         )`
    );
    const totalReferrals = parseInt(totalReferralsResult.rows[0]?.count || 0);

    // Total commission and lots
    let totalCommission = 0;
    let totalLots = 0;
    let ibsEarning = 0;

    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (commissionTableCheck.rows[0]?.exists) {
      const commissionResult = await pool.query(
        `SELECT 
          COALESCE(SUM(commission_amount), 0) as total_commission,
          COALESCE(SUM(lots), 0) as total_lots,
          COUNT(DISTINCT ib_id) as ibs_count
         FROM ib_commissions`
      );
      totalCommission = parseFloat(commissionResult.rows[0]?.total_commission || 0);
      totalLots = parseFloat(commissionResult.rows[0]?.total_lots || 0);
      ibsEarning = parseInt(commissionResult.rows[0]?.ibs_count || 0);
    }

    console.log('[DEBUG] /overview/stats - final data:', {
      totalIBs,
      approvedIBs,
      pendingIBs,
      totalReferrals,
      totalCommission,
      totalLots
    });

    res.json({
      success: true,
      data: {
        totalIBs,
        approvedIBs,
        pendingIBs,
        rejectedIBs,
        approvalRate: `${approvalRate}%`,
        totalReferrals,
        totalCommission: totalCommission.toFixed(2),
        totalLots: totalLots.toFixed(2),
        ibsEarning
      }
    });
  } catch (error) {
    console.error('Get overview stats error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/overview/commission-by-group
 * Get commission breakdown by group with lots (admin only)
 */
router.get('/overview/commission-by-group', authenticateAdmin, async (req, res, next) => {
  try {
    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (!commissionTableCheck.rows[0]?.exists) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Get total commission for percentage calculation
    const totalResult = await pool.query('SELECT COALESCE(SUM(commission_amount), 0) as total FROM ib_commissions');
    const totalCommission = parseFloat(totalResult.rows[0]?.total || 0);

    // Get commission by group
    const result = await pool.query(
      `SELECT 
        mg.id,
        mg.dedicated_name,
        mg.group_name,
        COALESCE(SUM(ic.commission_amount), 0) as total_commission,
        COALESCE(SUM(ic.lots), 0) as total_lots
       FROM mt5_groups mg
       LEFT JOIN ib_commissions ic ON ic.group_id = mg.id
       WHERE mg.is_active = TRUE 
         AND LOWER(mg.group_name) NOT LIKE '%demo%'
       GROUP BY mg.id, mg.dedicated_name, mg.group_name
       ORDER BY total_commission DESC`
    );

    const groups = result.rows.map(row => {
      const amount = parseFloat(row.total_commission || 0);
      const lots = parseFloat(row.total_lots || 0);
      const percentage = totalCommission > 0 ? ((amount / totalCommission) * 100).toFixed(1) : '0.0';
      return {
        id: row.id,
        group: row.dedicated_name || row.group_name,
        amount: amount.toFixed(2),
        percentage: `${percentage}% of total`,
        lots: `${lots.toFixed(2)} lots`
      };
    });

    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error('Get overview commission by group error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/overview/ib-activity
 * Get IB activity statistics (admin only)
 */
router.get('/overview/ib-activity', authenticateAdmin, async (req, res, next) => {
  try {
    // Approved IBs
    const approvedIBsResult = await pool.query(
      `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'approved'`
    );
    const approvedIBs = parseInt(approvedIBsResult.rows[0]?.count || 0);

    // Total volume and trades from commission table
    let totalVolume = 0;
    let totalTrades = 0;
    let avgCommissionLot = 0;

    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (commissionTableCheck.rows[0]?.exists) {
      const activityResult = await pool.query(
        `SELECT 
          COALESCE(SUM(lots), 0) as total_volume,
          COUNT(*) as total_trades,
          COALESCE(SUM(commission_amount), 0) as total_commission
         FROM ib_commissions`
      );
      totalVolume = parseFloat(activityResult.rows[0]?.total_volume || 0);
      totalTrades = parseInt(activityResult.rows[0]?.total_trades || 0);
      const totalCommission = parseFloat(activityResult.rows[0]?.total_commission || 0);
      avgCommissionLot = totalVolume > 0 ? (totalCommission / totalVolume) : 0;
    }

    res.json({
      success: true,
      data: {
        approvedIBs,
        totalVolume: totalVolume.toFixed(2),
        totalTrades: totalTrades.toLocaleString(),
        avgCommissionLot: `$${avgCommissionLot.toFixed(2)}`
      }
    });
  } catch (error) {
    console.error('Get IB activity error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/overview/recent-requests
 * Get recent IB requests with rate info (admin only)
 */
router.get('/overview/recent-requests', authenticateAdmin, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const result = await pool.query(
      `SELECT 
        ir.id,
        ir.status,
        ir.ib_type,
        ir.group_pip_commissions,
        COALESCE(ir.ib_balance, 0) as ib_balance,
        ir.created_at,
        ir.approved_at,
        u.first_name,
        u.last_name,
        u.email
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       ORDER BY ir.created_at DESC
       LIMIT $1`,
      [limit]
    );

    // Get groups for rate display
    const groupsResult = await pool.query(
      `SELECT id, dedicated_name, group_name 
       FROM mt5_groups 
       WHERE is_active = TRUE AND LOWER(group_name) NOT LIKE '%demo%'`
    );
    const groupsMap = new Map();
    groupsResult.rows.forEach(g => {
      groupsMap.set(g.id, g.dedicated_name || g.group_name);
    });

    const requests = result.rows.map(row => {
      let rate = 'Not configured';
      let rateGroups = '';

      if (row.group_pip_commissions) {
        let pipComms = row.group_pip_commissions;
        if (typeof pipComms === 'string') {
          try {
            pipComms = JSON.parse(pipComms);
          } catch (e) {
            pipComms = {};
          }
        }

        const rates = [];
        Object.entries(pipComms).forEach(([groupId, pipValue]) => {
          if (pipValue !== null && pipValue !== '' && pipValue !== undefined) {
            const numValue = parseFloat(pipValue);
            if (!isNaN(numValue) && numValue >= 0) {
              rates.push(numValue);
            }
          }
        });

        if (rates.length > 0) {
          const avgRate = rates.reduce((sum, val) => sum + val, 0) / rates.length;
          rate = `${avgRate.toFixed(2)} pip/lot`;
          rateGroups = `${rates.length} group${rates.length > 1 ? 's' : ''}`;
        }
      }

      return {
        id: row.id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User #${row.user_id}`,
        email: row.email,
        rate,
        rateGroups,
        status: row.status.charAt(0).toUpperCase() + row.status.slice(1),
        date: row.approved_at
          ? new Date(row.approved_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
          : new Date(row.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
      };
    });

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Get recent requests error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/overview/top-earners
 * Get top commission earners (admin only)
 */
router.get('/overview/top-earners', authenticateAdmin, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (!commissionTableCheck.rows[0]?.exists) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Get top earners with referral count
    const result = await pool.query(
      `SELECT 
        ir.id as ib_request_id,
        ir.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.referral_code,
        COALESCE(SUM(ic.commission_amount), 0) as total_commission,
        COALESCE(SUM(ic.lots), 0) as total_volume
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       LEFT JOIN ib_commissions ic ON ic.ib_id = ir.id
       WHERE ir.status = 'approved'
       GROUP BY ir.id, ir.user_id, u.first_name, u.last_name, u.email, u.referral_code
       HAVING COALESCE(SUM(ic.commission_amount), 0) > 0
       ORDER BY total_commission DESC
       LIMIT $1`,
      [limit]
    );

    // Get referral counts for each IB
    const earners = await Promise.all(result.rows.map(async (row) => {
      const referralsResult = await pool.query(
        `SELECT COUNT(*) as count FROM users WHERE referred_by = $1`,
        [row.referral_code]
      );
      const referrals = parseInt(referralsResult.rows[0]?.count || 0);

      return {
        id: row.ib_request_id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User #${row.user_id}`,
        email: row.email,
        referrals: `${referrals} referral${referrals !== 1 ? 's' : ''}`,
        commission: `$${parseFloat(row.total_commission || 0).toFixed(2)}`,
        volume: `${parseFloat(row.total_volume || 0).toFixed(2)} lots`
      };
    }));

    res.json({
      success: true,
      data: earners
    });
  } catch (error) {
    console.error('Get top earners error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/overview/recent-activity
 * Get recent activity (last 7 days) (admin only)
 */
router.get('/overview/recent-activity', authenticateAdmin, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (!commissionTableCheck.rows[0]?.exists) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Get recent activity (last 7 days) grouped by IB
    const result = await pool.query(
      `SELECT 
        ir.id as ib_request_id,
        ir.user_id,
        u.first_name,
        u.last_name,
        u.email,
        COALESCE(SUM(ic.commission_amount), 0) as total_commission,
        COALESCE(SUM(ic.lots), 0) as total_volume
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       LEFT JOIN ib_commissions ic ON ic.ib_id = ir.id 
         AND ic.created_at >= NOW() - INTERVAL '7 days'
       WHERE ir.status = 'approved'
       GROUP BY ir.id, ir.user_id, u.first_name, u.last_name, u.email
       HAVING COALESCE(SUM(ic.commission_amount), 0) > 0
       ORDER BY total_commission DESC
       LIMIT $1`,
      [limit]
    );

    const activity = result.rows.map(row => ({
      id: row.ib_request_id,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User #${row.user_id}`,
      email: row.email,
      commission: `$${parseFloat(row.total_commission || 0).toFixed(2)}`,
      period: 'Last 7 days',
      volume: `${parseFloat(row.total_volume || 0).toFixed(2)} lots`
    }));

    res.json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/overview/system-summary
 * Get complete system summary statistics (admin only)
 */
router.get('/overview/system-summary', authenticateAdmin, async (req, res, next) => {
  try {
    // IB Statistics
    const totalIBsResult = await pool.query('SELECT COUNT(*) as count FROM ib_requests');
    const totalIBs = parseInt(totalIBsResult.rows[0]?.count || 0);

    const approvedResult = await pool.query(
      `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'approved'`
    );
    const approved = parseInt(approvedResult.rows[0]?.count || 0);

    const pendingResult = await pool.query(
      `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'pending'`
    );
    const pending = parseInt(pendingResult.rows[0]?.count || 0);

    const rejectedResult = await pool.query(
      `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'rejected'`
    );
    const rejected = parseInt(rejectedResult.rows[0]?.count || 0);

    const approvalRate = totalIBs > 0 ? ((approved / totalIBs) * 100).toFixed(1) : '0.0';

    // IBs earning commission
    let ibsEarning = 0;
    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );

    if (commissionTableCheck.rows[0]?.exists) {
      const earningResult = await pool.query(
        `SELECT COUNT(DISTINCT ib_id) as count FROM ib_commissions WHERE commission_amount > 0`
      );
      ibsEarning = parseInt(earningResult.rows[0]?.count || 0);
    }

    // Trading Statistics
    let totalVolume = '0.00';
    let totalTrades = '0';
    let avgVolumePerTrade = '0.00';
    let totalReferrals = 0;
    let totalClients = 0;
    let ibsWithReferrals = 0;

    if (commissionTableCheck.rows[0]?.exists) {
      const tradingResult = await pool.query(
        `SELECT 
          COALESCE(SUM(lots), 0) as volume,
          COUNT(*) as trades
         FROM ib_commissions`
      );
      totalVolume = parseFloat(tradingResult.rows[0]?.volume || 0).toFixed(2);
      totalTrades = parseInt(tradingResult.rows[0]?.trades || 0).toLocaleString();
      const tradesCount = parseInt(tradingResult.rows[0]?.trades || 0);
      avgVolumePerTrade = tradesCount > 0 ? (parseFloat(totalVolume) / tradesCount).toFixed(2) : '0.00';
    }

    // Total referrals
    const referralsResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM users u
       WHERE u.referred_by IS NOT NULL 
         AND EXISTS (
           SELECT 1 FROM ib_requests ir 
           JOIN users ib_user ON ir.user_id = ib_user.id 
           WHERE ir.status = 'approved' 
             AND ib_user.referral_code = u.referred_by
         )`
    );
    totalReferrals = parseInt(referralsResult.rows[0]?.count || 0);

    // Total clients (users with trading accounts)
    const clientsResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as count 
       FROM trading_accounts 
       WHERE platform = 'MT5' AND is_demo = FALSE`
    );
    totalClients = parseInt(clientsResult.rows[0]?.count || 0);

    // IBs with referrals
    const ibsWithRefsResult = await pool.query(
      `SELECT COUNT(DISTINCT ir.id) as count
       FROM ib_requests ir
       JOIN users ib_user ON ir.user_id = ib_user.id
       WHERE ir.status = 'approved'
         AND EXISTS (
           SELECT 1 FROM users u 
           WHERE u.referred_by = ib_user.referral_code
         )`
    );
    ibsWithReferrals = parseInt(ibsWithRefsResult.rows[0]?.count || 0);

    // Commission Statistics
    let totalCommission = '$0.00';
    let avgCommissionPerLot = '$0.00';
    let commissionPerTrade = '$0.00';
    let avgPerEarningIB = '$0.00';

    if (commissionTableCheck.rows[0]?.exists) {
      const commStatsResult = await pool.query(
        `SELECT 
          COALESCE(SUM(commission_amount), 0) as total,
          COALESCE(SUM(lots), 0) as lots,
          COUNT(*) as trades
         FROM ib_commissions`
      );
      const commTotal = parseFloat(commStatsResult.rows[0]?.total || 0);
      const commLots = parseFloat(commStatsResult.rows[0]?.lots || 0);
      const commTrades = parseInt(commStatsResult.rows[0]?.trades || 0);

      totalCommission = `$${commTotal.toFixed(2)}`;
      avgCommissionPerLot = commLots > 0 ? `$${(commTotal / commLots).toFixed(2)}` : '$0.00';
      commissionPerTrade = commTrades > 0 ? `$${(commTotal / commTrades).toFixed(2)}` : '$0.00';
      avgPerEarningIB = ibsEarning > 0 ? `$${(commTotal / ibsEarning).toFixed(2)}` : '$0.00';
    }

    // Performance Metrics
    const volumePerIB = approved > 0 ? (parseFloat(totalVolume) / approved).toFixed(2) : '0.00';
    const commissionPerIB = approved > 0 ? (parseFloat(totalCommission.replace('$', '')) / approved).toFixed(2) : '0.00';
    const referralsPerIB = approved > 0 ? (totalReferrals / approved).toFixed(1) : '0.0';
    const avgReferralsActive = ibsWithReferrals > 0 ? (totalReferrals / ibsWithReferrals).toFixed(1) : '0.0';

    res.json({
      success: true,
      data: {
        ibStatistics: {
          totalIBs: totalIBs.toString(),
          approved: approved.toString(),
          pending: pending.toString(),
          rejected: rejected.toString(),
          approvalRate: `${approvalRate}%`,
          ibsEarning: ibsEarning.toString()
        },
        tradingStatistics: {
          totalVolume: `${totalVolume} lots`,
          totalTrades,
          avgVolumePerTrade: `${avgVolumePerTrade} lots`,
          totalReferrals: totalReferrals.toString(),
          totalClients: totalClients.toString(),
          ibsWithReferrals: ibsWithReferrals.toString()
        },
        commissionStatistics: {
          totalCommission,
          avgCommissionPerLot,
          commissionPerTrade,
          ibsEarning: `${ibsEarning}/${approved}`,
          avgPerEarningIB
        },
        performanceMetrics: {
          activeIBs: approved.toString(),
          volumePerIB: `${volumePerIB} lots`,
          commissionPerIB: `$${commissionPerIB}`,
          referralsPerIB,
          avgReferralsActive
        }
      }
    });
  } catch (error) {
    console.error('Get system summary error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/commission-distribution/summary
 * Get commission distribution summary stats (admin only)
 */
router.get('/commission-distribution/summary', authenticateAdmin, async (req, res, next) => {
  try {
    // Total approved IBs
    const approvedIBsResult = await pool.query(
      `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'approved'`
    );
    const totalApprovedIBs = parseInt(approvedIBsResult.rows[0]?.count || 0);

    // Total direct clients (users referred by IBs who are not IBs themselves)
    const directClientsResult = await pool.query(
      `SELECT COUNT(DISTINCT u.id) as count
       FROM users u
       JOIN ib_requests ir ON ir.user_id = (
         SELECT ib_user.id FROM users ib_user 
         WHERE ib_user.referral_code = u.referred_by
         LIMIT 1
       )
       WHERE u.referred_by IS NOT NULL
         AND ir.status = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM ib_requests ir2 
           WHERE ir2.user_id = u.id AND ir2.status = 'approved'
         )`
    );
    const totalDirectClients = parseInt(directClientsResult.rows[0]?.count || 0);

    // Total Sub-IBs (IBs with referrer_ib_id set)
    const subIBsResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM ib_requests 
       WHERE status = 'approved' 
         AND referrer_ib_id IS NOT NULL`
    );
    const totalSubIBs = parseInt(subIBsResult.rows[0]?.count || 0);

    // Total IB balance (sum of ib_balance from ib_requests)
    const balanceResult = await pool.query(
      `SELECT COALESCE(SUM(ib_balance), 0) as total FROM ib_requests WHERE status = 'approved'`
    );
    const totalIBBalance = parseFloat(balanceResult.rows[0]?.total || 0);

    res.json({
      success: true,
      data: {
        totalApprovedIBs,
        totalDirectClients,
        totalSubIBs,
        totalIBBalance: totalIBBalance.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Get commission distribution summary error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/commission-distribution/list
 * Get all IBs with commission distribution data (admin only)
 */
router.get('/commission-distribution/list', authenticateAdmin, async (req, res, next) => {
  try {
    // Get all approved IBs with their details
    const ibsResult = await pool.query(
      `SELECT 
        ir.id,
        ir.status,
        ir.ib_type,
        ir.referrer_ib_id,
        ir.group_pip_commissions,
        COALESCE(ir.ib_balance, 0) as ib_balance,
        ir.approved_at,
        ir.created_at,
        ir.ib_balance,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_code,
        u.phone_number,
        u.referral_code
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       WHERE ir.status = 'approved'
       ORDER BY ir.approved_at DESC, ir.created_at DESC`
    );

    // Get groups for rate calculation
    const groupsResult = await pool.query(
      `SELECT id, dedicated_name, group_name 
       FROM mt5_groups 
       WHERE is_active = TRUE AND LOWER(group_name) NOT LIKE '%demo%'`
    );
    const groupsMap = new Map();
    groupsResult.rows.forEach(g => {
      groupsMap.set(g.id, g.dedicated_name || g.group_name);
    });

    // Check if commission table exists
    const commissionTableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ib_commissions'
      )`
    );
    const hasCommissionTable = commissionTableCheck.rows[0]?.exists;

    // Process each IB
    const ibs = await Promise.all(ibsResult.rows.map(async (ib) => {
      // Calculate IB rate (average from group_pip_commissions)
      let ibRate = '0.00';
      if (ib.group_pip_commissions) {
        let pipComms = ib.group_pip_commissions;
        if (typeof pipComms === 'string') {
          try { pipComms = JSON.parse(pipComms); } catch (e) { pipComms = {}; }
        }

        const rates = [];
        Object.entries(pipComms).forEach(([groupId, pipValue]) => {
          if (pipValue && !isNaN(parseFloat(pipValue))) {
            rates.push(parseFloat(pipValue));
          }
        });

        if (rates.length > 0) {
          ibRate = (rates.reduce((sum, val) => sum + val, 0) / rates.length).toFixed(2);
        }
      }

      // Recursive CTE for network details
      const networkStatsResult = await pool.query(
        `WITH RECURSIVE referral_tree AS (
            SELECT id, referral_code, 1 as level FROM users WHERE referred_by = $1
            UNION ALL
            SELECT u.id, u.referral_code, rt.level + 1
            FROM users u
            INNER JOIN referral_tree rt ON u.referred_by = rt.referral_code
            WHERE rt.level < 10
        )
        SELECT 
          COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM ib_requests ir WHERE ir.user_id = referral_tree.id AND ir.status = 'approved')) as direct_clients,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ib_requests ir WHERE ir.user_id = referral_tree.id AND ir.status = 'approved')) as sub_ibs
        FROM referral_tree`,
        [ib.referral_code]
      );

      const directClients = parseInt(networkStatsResult.rows[0]?.direct_clients || 0);
      const subIBs = parseInt(networkStatsResult.rows[0]?.sub_ibs || 0);
      const totalReferrals = directClients + subIBs;

      // Get commission data
      let totalBalance = 0;
      let commission = 0;
      let totalLots = 0;
      let totalTrades = 0;

      if (hasCommissionTable) {
        const commissionResult = await pool.query(
          `SELECT 
            COALESCE(SUM(commission_amount), 0) as total_commission,
            COALESCE(SUM(lots), 0) as total_lots,
            COUNT(*) as total_trades
           FROM ib_commissions
           WHERE ib_id = $1`,
          [ib.id]
        );
        commission = parseFloat(commissionResult.rows[0]?.total_commission || 0);
        totalBalance = commission;
        totalLots = parseFloat(commissionResult.rows[0]?.total_lots || 0);
        totalTrades = parseInt(commissionResult.rows[0]?.total_trades || 0);
      }

      // Format group pip commissions with names
      const groupRates = [];
      if (ib.group_pip_commissions) {
        let pipComms = ib.group_pip_commissions;
        if (typeof pipComms === 'string') {
          try { pipComms = JSON.parse(pipComms); } catch (e) { pipComms = {}; }
        }
        Object.entries(pipComms).forEach(([groupId, rate]) => {
          if (rate && parseFloat(rate) > 0) {
            groupRates.push({
              name: groupsMap.get(parseInt(groupId)) || `Group ${groupId}`,
              rate: parseFloat(rate).toFixed(2)
            });
          }
        });
      }

      return {
        id: ib.id,
        name: `${ib.first_name || ''} ${ib.last_name || ''}`.trim() || `User #${ib.user_id}`,
        email: ib.email,
        approvedDate: new Date(ib.approved_at || ib.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }),
        ibRate,
        directClients,
        subIBs,
        totalReferrals,
        totalBalance: `$${totalBalance.toFixed(2)}`,
        commission: `$${commission.toFixed(2)}`,
        phone: ib.phone_code && ib.phone_number ? `${ib.phone_code}${ib.phone_number}` : 'N/A',
        memberSince: new Date(ib.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }),
        totalLots: totalLots.toFixed(2),
        totalTrades,
        totalLots: totalLots.toFixed(2),
        totalTrades,
        ibBalance: parseFloat(ib.ib_balance || 0).toFixed(2),
        groupRates
      };
    }));

    res.json({
      success: true,
      data: ibs
    });
  } catch (error) {
    console.error('Get commission distribution list error:', error);
    next(error);
  }
});

/**
 * POST /api/ib-requests/commission-distribution/:id/distribute
 * Manually distribute commission to an IB's available balance (admin only)
 */
router.post('/commission-distribution/:id/distribute', authenticateAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const ibRequestId = parseInt(req.params.id);
    const { amount, notes } = req.body;
    const adminId = req.admin.adminId;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid distribution amount' });
    }

    await client.query('BEGIN');

    // 1. Check if IB exists and is approved
    const ibCheck = await client.query(
      'SELECT id, user_id FROM ib_requests WHERE id = $1 AND status = \'approved\' FOR UPDATE',
      [ibRequestId]
    );

    if (ibCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Approved IB not found' });
    }

    // 2. Insert into ib_distributions
    await client.query(
      `INSERT INTO ib_distributions (ib_id, amount, notes, admin_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [ibRequestId, amount, notes || 'Commission Distribution', adminId]
    );

    // 3. Update ib_balance in ib_requests
    await client.query(
      'UPDATE ib_requests SET ib_balance = COALESCE(ib_balance, 0) + $1, updated_at = NOW() WHERE id = $2',
      [amount, ibRequestId]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Commission distributed successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Commission distribution error:', error);
    next(error);
  } finally {
    client.release();
  }
});

/**
 * GET /api/ib-requests/commission-distribution/:id/calculation
 * Get detailed commission calculation for a specific IB (admin only)
 */
router.get('/commission-distribution/:id/calculation', authenticateAdmin, async (req, res, next) => {
  try {
    const ibRequestId = parseInt(req.params.id);

    // Get IB details
    const ibResult = await pool.query(
      `SELECT 
        ir.id, ir.user_id, ir.ib_type, ir.referrer_ib_id, ir.group_pip_commissions,
        COALESCE(ir.ib_balance, 0) as ib_balance,
        u.referral_code, u.first_name, u.last_name, u.email
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       WHERE ir.id = $1 AND ir.status = 'approved'`,
      [ibRequestId]
    );

    if (ibResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'IB not found' });
    }

    const ib = ibResult.rows[0];

    // Recursive CTE to find all descendants with their level
    const networkResult = await pool.query(
      `WITH RECURSIVE referral_tree AS (
          -- Direct clients and sub-IBs (Level 1)
          SELECT id, referral_code, 1 as level 
          FROM users 
          WHERE referred_by = $1
          
          UNION ALL
          
          -- Recursive step
          SELECT u.id, u.referral_code, rt.level + 1
          FROM users u
          INNER JOIN referral_tree rt ON u.referred_by = rt.referral_code
          WHERE rt.level < 10 -- Limit recursion depth
      )
      SELECT rt.id, rt.level, u.first_name, u.last_name, u.email,
             EXISTS (SELECT 1 FROM ib_requests ir WHERE ir.user_id = u.id AND ir.status = 'approved') as is_ib,
             (SELECT ir.group_pip_commissions FROM ib_requests ir WHERE ir.user_id = u.id AND ir.status = 'approved' ORDER BY ir.created_at DESC LIMIT 1) as sub_ib_rates
      FROM referral_tree rt
      JOIN users u ON rt.id = u.id`,
      [ib.referral_code]
    );

    const descendants = networkResult.rows;
    const descendantIds = descendants.map(d => d.id);

    // Get IB's own rates
    const ibRates = typeof ib.group_pip_commissions === 'string' ? JSON.parse(ib.group_pip_commissions) : (ib.group_pip_commissions || {});
    const ibAvgRate = Object.values(ibRates).length > 0 ? (Object.values(ibRates).map(v => parseFloat(v || 0)).reduce((a, b) => a + b, 0) / Object.values(ibRates).length) : 0;

    // Direct Clients (Level-wise but consolidated for the table if needed, though user requested real level-wise data)
    let directCommission = 0;
    let totalLots = 0;
    let totalTrades = 0;
    const directClientsData = [];
    const subIBsData = [];
    let residualCommission = 0;

    if (descendantIds.length > 0) {
      // Fetch all commissions for these descendants where the IB earned a share
      // Fetch all commissions for these descendants where the IB earned a share
      const commissionResult = await pool.query(
        `SELECT ic.client_id as user_id, ic.lots, ic.commission_amount as amount
         FROM ib_commissions ic
         WHERE ic.ib_id = $1`,
        [ibRequestId]
      );

      const commByUserId = {};
      commissionResult.rows.forEach(row => {
        if (!commByUserId[row.user_id]) commByUserId[row.user_id] = { lots: 0, amount: 0, trades: 0 };
        commByUserId[row.user_id].lots += parseFloat(row.lots || 0);
        commByUserId[row.user_id].amount += parseFloat(row.amount || 0);
        commByUserId[row.user_id].trades += 1;
      });

      descendants.forEach(d => {
        const stats = commByUserId[d.id] || { lots: 0, amount: 0, trades: 0 };
        if (d.is_ib) {
          // Sub-IB Residual Calculation
          let subIBRates = d.sub_ib_rates;
          if (typeof subIBRates === 'string') try { subIBRates = JSON.parse(subIBRates); } catch (e) { subIBRates = {}; }
          const subIBAvgRate = Object.values(subIBRates || {}).length > 0 ? (Object.values(subIBRates).map(v => parseFloat(v || 0)).reduce((a, b) => a + b, 0) / Object.values(subIBRates).length) : 0;

          const residualVal = stats.amount; // The amount in ic.ib_id = $1 is already what THIS IB earned
          residualCommission += residualVal;

          subIBsData.push({
            subIB: `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.email,
            email: d.email,
            level: `L${d.level}`,
            rate: subIBAvgRate.toFixed(2),
            trades: stats.trades,
            lots: stats.lots.toFixed(2),
            residual: `$${stats.amount.toFixed(2)}`
          });
        } else {
          // Direct/Network Client
          directCommission += stats.amount;
          directClientsData.push({
            client: `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.email,
            email: d.email,
            level: `L${d.level}`,
            trades: stats.trades,
            lots: stats.lots.toFixed(2),
            commission: `$${stats.amount.toFixed(2)}`
          });
        }
        totalLots += stats.lots;
        totalTrades += stats.trades;
      });
    }

    // Get total manual distributions
    const distributionResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM ib_distributions WHERE ib_id = $1`,
      [ibRequestId]
    );
    const distributedCommission = parseFloat(distributionResult.rows[0]?.total || 0);

    res.json({
      success: true,
      data: {
        ibId: ibRequestId,
        ibName: `${ib.first_name || ''} ${ib.last_name || ''}`.trim() || ib.email,
        ibRate: ibAvgRate.toFixed(2),
        directCommission: directCommission.toFixed(2),
        residualCommission: residualCommission.toFixed(2),
        totalCommission: (directCommission + residualCommission + distributedCommission).toFixed(2),
        distributedCommission: distributedCommission.toFixed(2),
        totalLots: totalLots.toFixed(2),
        totalTrades,
        directClients: directClientsData,
        subIBs: subIBsData
      }
    });
  } catch (error) {
    console.error('Get commission calculation error:', error);
    next(error);
  }
});

/**
 * GET /api/ib-requests/commission-distribution/:id/details
 * Get detailed IB information for commission distribution (admin only)
 */
router.get('/commission-distribution/:id/details', authenticateAdmin, async (req, res, next) => {
  try {
    const ibRequestId = parseInt(req.params.id);

    // 1. Get IB details and their approved rates
    const ibResult = await pool.query(
      `SELECT 
        ir.id, ir.user_id, ir.ib_type, ir.group_pip_commissions,
        COALESCE(ir.ib_balance, 0) as ib_balance, ir.approved_at, ir.created_at,
        u.first_name, u.last_name, u.email, u.phone_code, u.phone_number, u.referral_code
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       WHERE ir.id = $1 AND ir.status = 'approved'`,
      [ibRequestId]
    );

    if (ibResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'IB not found' });
    }

    const ib = ibResult.rows[0];
    const ibRequestRates = typeof ib.group_pip_commissions === 'string' ? JSON.parse(ib.group_pip_commissions) : (ib.group_pip_commissions || {});

    // 2. Fetch MT5 groups to map names for approved rates
    const groupsResult = await pool.query(
      `SELECT id, dedicated_name, group_name FROM mt5_groups WHERE is_active = TRUE AND LOWER(group_name) NOT LIKE '%demo%'`
    );

    const approvedGroups = [];
    groupsResult.rows.forEach(g => {
      const rate = parseFloat(ibRequestRates[g.id] || 0);
      if (rate > 0) {
        approvedGroups.push({
          id: g.id,
          name: g.dedicated_name || g.group_name,
          rate: rate.toFixed(2)
        });
      }
    });

    // 3. Recursive CTE for ALL network descendants (Normalized like user-side fetch)
    const networkResult = await pool.query(
      `WITH RECURSIVE referral_tree AS (
          SELECT id, referral_code, 1 as level FROM users WHERE referred_by = $1
          UNION ALL
          SELECT u.id, u.referral_code, rt.level + 1
          FROM users u
          INNER JOIN referral_tree rt ON u.referred_by = rt.referral_code
          WHERE rt.level < 10
      )
      SELECT 
        rt.id, rt.level, u.first_name, u.last_name, u.email, u.created_at,
        COUNT(DISTINCT ta.id) as account_count,
        COALESCE(SUM(ta.balance), 0) as total_balance,
        ir.status as ib_status,
        ir.group_pip_commissions as sub_ib_rates
      FROM referral_tree rt
      JOIN users u ON rt.id = u.id
      LEFT JOIN trading_accounts ta ON ta.user_id = u.id 
        AND ta.platform = 'MT5' AND ta.is_demo = FALSE AND ta.account_status = 'active'
      LEFT JOIN ib_requests ir ON ir.user_id = u.id AND ir.status = 'approved'
      GROUP BY rt.id, rt.level, u.first_name, u.last_name, u.email, u.created_at, ir.status, ir.group_pip_commissions
      ORDER BY rt.level, u.created_at DESC`,
      [ib.referral_code]
    );

    const directClients = [];
    const subIBs = [];

    networkResult.rows.forEach(row => {
      const entry = {
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
        email: row.email,
        level: `L${row.level}`,
        accounts: parseInt(row.account_count || 0),
        balance: `$${parseFloat(row.total_balance || 0).toFixed(2)}`
      };

      if (row.ib_status === 'approved') {
        let rates = typeof row.sub_ib_rates === 'string' ? JSON.parse(row.sub_ib_rates) : (row.sub_ib_rates || {});
        const ratesArr = Object.values(rates).map(v => parseFloat(v || 0)).filter(v => v > 0);
        const avgRate = ratesArr.length > 0 ? (ratesArr.reduce((a, b) => a + b, 0) / ratesArr.length) : 0;

        subIBs.push({
          ...entry,
          ibRate: avgRate.toFixed(2)
        });
      } else {
        directClients.push(entry);
      }
    });

    // Overall commission stats
    const commStatsResult = await pool.query(
      `SELECT COALESCE(SUM(commission_amount), 0) as total_commission, COALESCE(SUM(lots), 0) as total_lots, COUNT(*) as total_trades
        FROM ib_commissions WHERE ib_id = $1`,
      [ibRequestId]
    );

    // Get total manual distributions
    const distributionResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM ib_distributions WHERE ib_id = $1`,
      [ibRequestId]
    );
    const totalDistribution = parseFloat(distributionResult.rows[0]?.total || 0);
    const totalComm = parseFloat(commStatsResult.rows[0].total_commission) + totalDistribution;

    const avgRate = approvedGroups.length > 0 ? (approvedGroups.reduce((sum, g) => sum + parseFloat(g.rate), 0) / approvedGroups.length) : 0;

    res.json({
      success: true,
      data: {
        id: ib.id,
        name: `${ib.first_name || ''} ${ib.last_name || ''}`.trim() || ib.email,
        email: ib.email,
        phone: ib.phone_code && ib.phone_number ? `${ib.phone_code}${ib.phone_number}` : 'N/A',
        ibRate: avgRate.toFixed(2),
        approvedDate: new Date(ib.approved_at || ib.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }),
        memberSince: new Date(ib.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }),
        totalTrades: parseInt(commStatsResult.rows[0].total_trades),
        totalLots: parseFloat(commStatsResult.rows[0].total_lots).toFixed(2),
        totalCommission: `$${totalComm.toFixed(2)}`,
        estimatedEarnings: `$${totalComm.toFixed(2)}`,
        ibBalance: parseFloat(ib.ib_balance || 0).toFixed(2),
        approvedGroups,
        directClients,
        subIBs
      }
    });
  } catch (error) {
    console.error('Get IB details error:', error);
    next(error);
  }
});


router.get('/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);

    if (!requestId || isNaN(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    // Check which columns exist in ib_requests
    const colsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'ib_requests' AND table_schema = 'public'`
    );
    const ibCols = new Set(colsRes.rows.map(r => r.column_name));

    // Build select columns dynamically
    let selectCols = [
      'ir.id',
      'ir.user_id',
      'ir.status',
      'ir.created_at',
      'ir.updated_at',
      'u.first_name',
      'u.last_name',
      'u.email',
      'u.phone_code',
      'u.phone_number',
      'u.country',
      'u.referral_code',
      'u.referred_by'
    ];

    if (ibCols.has('ib_type')) selectCols.push('ir.ib_type');
    if (ibCols.has('referrer_ib_id')) selectCols.push('ir.referrer_ib_id');
    if (ibCols.has('group_pip_commissions')) selectCols.push('ir.group_pip_commissions');
    if (ibCols.has('approved_at')) selectCols.push('ir.approved_at');

    // Get IB request with user details
    const result = await pool.query(
      `SELECT ${selectCols.join(', ')}
       FROM ib_requests ir
       JOIN users u ON ir.user_id = u.id
       WHERE ir.id = $1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IB request not found'
      });
    }

    const ib = result.rows[0];

    // Get referrer info if exists
    let referredBy = null;
    if (ib.referrer_ib_id) {
      const referrerResult = await pool.query(
        `SELECT first_name, last_name, email FROM users WHERE id = $1`,
        [ib.referrer_ib_id]
      );
      if (referrerResult.rows.length > 0) {
        referredBy = referrerResult.rows[0];
      }
    }

    // Check which columns exist in trading_accounts
    const accountColsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'trading_accounts' AND table_schema = 'public'`
    );
    const accountCols = new Set(accountColsRes.rows.map(r => r.column_name));

    // Build account select columns dynamically
    let accountSelectCols = [
      'ta.id',
      'ta.account_number',
      'ta.platform',
      'ta.account_type',
      'ta.currency',
      'ta.leverage',
      'ta.account_status',
      'ta.is_demo',
      'ta.created_at'
    ];

    if (accountCols.has('balance')) accountSelectCols.push('ta.balance');
    if (accountCols.has('equity')) accountSelectCols.push('ta.equity');
    if (accountCols.has('mt5_group_id')) accountSelectCols.push('ta.mt5_group_id');
    if (accountCols.has('mt5_group_name')) accountSelectCols.push('ta.mt5_group_name');
    if (accountCols.has('group')) accountSelectCols.push('ta.group');

    // Get accounts for this IB
    const accountsResult = await pool.query(
      `SELECT ${accountSelectCols.join(', ')}
       FROM trading_accounts ta
       WHERE ta.user_id = $1 
         AND ta.platform = 'MT5'
         AND ta.is_demo = FALSE
       ORDER BY ta.created_at DESC`,
      [ib.user_id]
    );

    const accounts = accountsResult.rows.map(acc => ({
      id: acc.id,
      accountNumber: acc.account_number,
      platform: acc.platform,
      accountType: acc.account_type,
      currency: acc.currency,
      leverage: acc.leverage,
      accountStatus: acc.account_status,
      balance: parseFloat(acc.balance || 0),
      equity: parseFloat(acc.equity || 0),
      mt5GroupId: acc.mt5_group_id,
      mt5GroupName: acc.mt5_group_name || acc.group,
      createdAt: acc.created_at
    }));

    res.json({
      success: true,
      data: {
        id: ib.id,
        user_id: ib.user_id,
        first_name: ib.first_name,
        last_name: ib.last_name,
        email: ib.email,
        phone: ib.phone_code && ib.phone_number ? `${ib.phone_code}${ib.phone_number}` : null,
        country: ib.country,
        ib_type: ib.ib_type,
        referrer_ib_id: ib.referrer_ib_id,
        group_pip_commissions: (() => {
          if (!ib.group_pip_commissions) return {};
          if (typeof ib.group_pip_commissions === 'string') {
            try {
              return JSON.parse(ib.group_pip_commissions);
            } catch (e) {
              return {};
            }
          }
          return ib.group_pip_commissions;
        })(),
        approved_at: ib.approved_at,
        status: ib.status,
        created_at: ib.created_at,
        updated_at: ib.updated_at,
        referral_code: ib.referral_code,
        referred_by: ib.referred_by,
        referred_by_name: referredBy ? `${referredBy.first_name || ''} ${referredBy.last_name || ''}`.trim() : null,
        referred_by_email: referredBy?.email || null,
        accounts: accounts
      }
    });
  } catch (error) {
    console.error('Get IB request error:', error);
    next(error);
  }
});


export default router;
