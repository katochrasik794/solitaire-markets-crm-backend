/**
 * Unified Actions Routes
 * Fetches all actions from CRM Admin, IB Client, and IB Admin systems
 */

import express from 'express';
import pool from '../config/database.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/admin/unified-actions
 * Get all actions from all systems (CRM Admin, IB Client, IB Admin)
 * Supports filtering, pagination, and sorting
 */
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      system_type, // Filter by system: 'crm_admin', 'crm_user', 'ib_client', 'ib_admin', or 'all'
      action_type, // Filter by action type
      action_category, // Filter by category
      actor_email, // Filter by actor email
      target_type, // Filter by target type
      start_date, // Filter by start date (ISO format)
      end_date, // Filter by end date (ISO format)
      page = 1,
      limit = 50,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const validSortColumns = ['created_at', 'action_type', 'action_category', 'actor_email', 'system_type'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE conditions
    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;

    // System type filter
    if (system_type && system_type !== 'all') {
      whereConditions.push(`system_type = $${paramIndex}`);
      queryParams.push(system_type);
      paramIndex++;
    }

    // Action type filter
    if (action_type) {
      whereConditions.push(`action_type = $${paramIndex}`);
      queryParams.push(action_type);
      paramIndex++;
    }

    // Action category filter
    if (action_category) {
      whereConditions.push(`action_category = $${paramIndex}`);
      queryParams.push(action_category);
      paramIndex++;
    }

    // Actor email filter
    if (actor_email) {
      whereConditions.push(`actor_email ILIKE $${paramIndex}`);
      queryParams.push(`%${actor_email}%`);
      paramIndex++;
    }

    // Target type filter
    if (target_type) {
      whereConditions.push(`target_type = $${paramIndex}`);
      queryParams.push(target_type);
      paramIndex++;
    }

    // Date range filter
    if (start_date) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      queryParams.push(start_date);
      paramIndex++;
    }
    if (end_date) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      queryParams.push(end_date);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM unified_actions ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get actions
    const dataQuery = `
      SELECT 
        id,
        system_type,
        actor_id,
        actor_email,
        actor_name,
        actor_type,
        action_type,
        action_category,
        action_name,
        target_type,
        target_id,
        target_identifier,
        description,
        details,
        request_method,
        request_path,
        response_status,
        ip_address,
        user_agent,
        created_at
      FROM unified_actions
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(dataQuery, queryParams);

    res.json({
      ok: true,
      actions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        total_pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get unified actions error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch actions'
    });
  }
});

/**
 * GET /api/admin/unified-actions/stats
 * Get statistics about actions across all systems
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params = [];
    if (start_date && end_date) {
      dateFilter = 'WHERE created_at >= $1 AND created_at <= $2';
      params.push(start_date, end_date);
    }

    // Get counts by system type
    const systemStatsQuery = `
      SELECT 
        system_type,
        COUNT(*) as count
      FROM unified_actions
      ${dateFilter}
      GROUP BY system_type
      ORDER BY count DESC
    `;

    // Get counts by action category
    const categoryStatsQuery = `
      SELECT 
        action_category,
        COUNT(*) as count
      FROM unified_actions
      ${dateFilter}
      GROUP BY action_category
      ORDER BY count DESC
      LIMIT 10
    `;

    // Get recent actions count
    const recentActionsQuery = `
      SELECT COUNT(*) as count
      FROM unified_actions
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `;

    const [systemStats, categoryStats, recentActions] = await Promise.all([
      pool.query(systemStatsQuery, params),
      pool.query(categoryStatsQuery, params),
      pool.query(recentActionsQuery)
    ]);

    res.json({
      ok: true,
      stats: {
        by_system: systemStats.rows,
        by_category: categoryStats.rows,
        recent_24h: parseInt(recentActions.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Get unified actions stats error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch statistics'
    });
  }
});

/**
 * GET /api/admin/unified-actions/action-types
 * Get list of all available action types across all systems
 */
router.get('/action-types', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT 
        system_type,
        action_type,
        action_category,
        COUNT(*) as count
      FROM unified_actions
      GROUP BY system_type, action_type, action_category
      ORDER BY system_type, action_category, action_type
    `);

    // Group by system type
    const actionTypes = {};
    result.rows.forEach(row => {
      if (!actionTypes[row.system_type]) {
        actionTypes[row.system_type] = [];
      }
      actionTypes[row.system_type].push({
        action_type: row.action_type,
        action_category: row.action_category,
        count: parseInt(row.count)
      });
    });

    res.json({
      ok: true,
      action_types: actionTypes
    });
  } catch (error) {
    console.error('Get action types error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch action types'
    });
  }
});

/**
 * GET /api/admin/unified-actions/:id
 * Get details of a specific action
 */
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM unified_actions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Action not found'
      });
    }

    res.json({
      ok: true,
      action: result.rows[0]
    });
  } catch (error) {
    console.error('Get action details error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch action details'
    });
  }
});

export default router;

