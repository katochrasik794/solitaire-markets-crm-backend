/**
 * Unified Actions Routes
 * Fetches the list of all email-triggering actions in the system
 * This is a simple reference list of all email actions
 */

import express from 'express';
import pool from '../config/database.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/admin/unified-actions
 * Get all email-triggering actions (simple list)
 * Supports filtering by system_type
 */
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      system_type, // Filter by system: 'crm_admin', 'crm_user', 'ib_client', 'ib_admin', or 'all'
      search // Search in action_name
    } = req.query;

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

    // Search filter
    if (search) {
      whereConditions.push(`action_name ILIKE $${paramIndex}`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get actions with template info
    const dataQuery = `
      SELECT 
        ua.id,
        ua.action_name,
        ua.system_type,
        ua.template_id,
        ua.created_at,
        ua.updated_at,
        et.name as template_name
      FROM unified_actions ua
      LEFT JOIN email_templates et ON ua.template_id = et.id
      ${whereClause}
      ORDER BY system_type, action_name
    `;

    const result = await pool.query(dataQuery, queryParams);

    res.json({
      ok: true,
      actions: result.rows,
      total: result.rows.length
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
 * Get statistics about email-triggering actions by system type
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    // Get counts by system type
    const systemStatsQuery = `
      SELECT 
        system_type,
        COUNT(*) as count
      FROM unified_actions
      GROUP BY system_type
      ORDER BY system_type
    `;

    // Get total count
    const totalQuery = `
      SELECT COUNT(*) as count
      FROM unified_actions
    `;

    const [systemStats, totalResult] = await Promise.all([
      pool.query(systemStatsQuery),
      pool.query(totalQuery)
    ]);

    res.json({
      ok: true,
      stats: {
        by_system: systemStats.rows,
        total: parseInt(totalResult.rows[0].count)
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
 * GET /api/admin/unified-actions/by-system
 * Get actions grouped by system type with template info
 */
router.get('/by-system', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ua.system_type,
        ua.action_name,
        ua.id,
        ua.template_id,
        ua.created_at,
        et.name as template_name
      FROM unified_actions ua
      LEFT JOIN email_templates et ON ua.template_id = et.id
      ORDER BY system_type, action_name
    `);

    // Group by system type
    const actionsBySystem = {};
    result.rows.forEach(row => {
      if (!actionsBySystem[row.system_type]) {
        actionsBySystem[row.system_type] = [];
      }
      actionsBySystem[row.system_type].push({
        id: row.id,
        action_name: row.action_name,
        template_id: row.template_id,
        template_name: row.template_name,
        created_at: row.created_at
      });
    });

    res.json({
      ok: true,
      actions_by_system: actionsBySystem
    });
  } catch (error) {
    console.error('Get actions by system error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch actions by system'
    });
  }
});

/**
 * GET /api/admin/unified-actions/:id
 * Get details of a specific action with template info
 */
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        ua.id, 
        ua.action_name, 
        ua.system_type, 
        ua.template_id,
        ua.created_at, 
        ua.updated_at,
        et.name as template_name,
        et.description as template_description
      FROM unified_actions ua
      LEFT JOIN email_templates et ON ua.template_id = et.id
      WHERE ua.id = $1`,
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

/**
 * PUT /api/admin/unified-actions/:id/assign-template
 * Assign a template to an action
 */
router.put('/:id/assign-template', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { template_id } = req.body;

    if (template_id === undefined || template_id === null) {
      return res.status(400).json({
        ok: false,
        error: 'template_id is required'
      });
    }

    // Verify template exists if provided
    if (template_id) {
      const templateCheck = await pool.query(
        'SELECT id FROM email_templates WHERE id = $1',
        [template_id]
      );
      if (templateCheck.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: 'Template not found'
        });
      }
    }

    // Update action with template
    const result = await pool.query(
      `UPDATE unified_actions 
       SET template_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, action_name, system_type, template_id`,
      [template_id || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Action not found'
      });
    }

    res.json({
      ok: true,
      action: result.rows[0],
      message: template_id ? 'Template assigned successfully' : 'Template unassigned successfully'
    });
  } catch (error) {
    console.error('Assign template error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to assign template'
    });
  }
});

/**
 * POST /api/admin/unified-actions
 * Add a new email action
 */
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { action_name, system_type, template_id } = req.body;

    if (!action_name || !system_type) {
      return res.status(400).json({
        ok: false,
        error: 'action_name and system_type are required'
      });
    }

    // Validate system_type
    const validSystemTypes = ['crm_admin', 'crm_user', 'ib_client', 'ib_admin'];
    if (!validSystemTypes.includes(system_type)) {
      return res.status(400).json({
        ok: false,
        error: `system_type must be one of: ${validSystemTypes.join(', ')}`
      });
    }

    // Verify template exists if provided
    if (template_id) {
      const templateCheck = await pool.query(
        'SELECT id FROM email_templates WHERE id = $1',
        [template_id]
      );
      if (templateCheck.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: 'Template not found'
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO unified_actions (action_name, system_type, template_id, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, action_name, system_type, template_id, created_at, updated_at`,
      [action_name, system_type, template_id || null]
    );

    res.json({
      ok: true,
      action: result.rows[0],
      message: 'Action created successfully'
    });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({
        ok: false,
        error: 'An action with this name already exists'
      });
    }
    console.error('Create action error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to create action'
    });
  }
});

/**
 * PUT /api/admin/unified-actions/:id
 * Update an action
 */
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action_name, system_type, template_id } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (action_name !== undefined) {
      updates.push(`action_name = $${paramIndex}`);
      values.push(action_name);
      paramIndex++;
    }

    if (system_type !== undefined) {
      const validSystemTypes = ['crm_admin', 'crm_user', 'ib_client', 'ib_admin'];
      if (!validSystemTypes.includes(system_type)) {
        return res.status(400).json({
          ok: false,
          error: `system_type must be one of: ${validSystemTypes.join(', ')}`
        });
      }
      updates.push(`system_type = $${paramIndex}`);
      values.push(system_type);
      paramIndex++;
    }

    if (template_id !== undefined) {
      // Verify template exists if provided
      if (template_id) {
        const templateCheck = await pool.query(
          'SELECT id FROM email_templates WHERE id = $1',
          [template_id]
        );
        if (templateCheck.rows.length === 0) {
          return res.status(404).json({
            ok: false,
            error: 'Template not found'
          });
        }
      }
      updates.push(`template_id = $${paramIndex}`);
      values.push(template_id || null);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE unified_actions 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, action_name, system_type, template_id, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Action not found'
      });
    }

    res.json({
      ok: true,
      action: result.rows[0],
      message: 'Action updated successfully'
    });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({
        ok: false,
        error: 'An action with this name already exists'
      });
    }
    console.error('Update action error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to update action'
    });
  }
});

export default router;

