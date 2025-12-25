import express from 'express';
import pool from '../config/database.js';
import { authenticate, authenticateAdmin } from '../middleware/auth.js';
import { extractMenusFromRoutes } from '../services/menuDiscovery.js';

const router = express.Router();

// GET /api/admin/menus
// Get all menus with their enabled/disabled status
router.get('/admin', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, route_path, display_name, is_enabled, icon_name, parent_path, display_order, created_at, updated_at
       FROM menu_features
       ORDER BY parent_path NULLS FIRST, display_order, route_path`
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get menus error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch menus'
    });
  }
});

// POST /api/admin/menus/fetch
// Fetch menus from UserRoutes.jsx and sync with database
router.post('/admin/fetch', authenticateAdmin, async (req, res) => {
  try {
    // Extract menus from routes file
    const discoveredMenus = extractMenusFromRoutes();
    
    const syncedMenus = [];
    const newMenus = [];

    // Sync each discovered menu with database
    for (const menu of discoveredMenus) {
      // Check if menu exists
      const existing = await pool.query(
        'SELECT id, is_enabled, display_name FROM menu_features WHERE route_path = $1',
        [menu.route_path]
      );

      if (existing.rows.length > 0) {
        // Update display_name if it changed, but keep existing is_enabled status
        const existingMenu = existing.rows[0];
        if (existingMenu.display_name !== menu.display_name || 
            existingMenu.parent_path !== menu.parent_path) {
          await pool.query(
            `UPDATE menu_features 
             SET display_name = $1, parent_path = $2, updated_at = NOW()
             WHERE route_path = $3`,
            [menu.display_name, menu.parent_path, menu.route_path]
          );
        }
        syncedMenus.push({
          ...menu,
          id: existingMenu.id,
          is_enabled: existingMenu.is_enabled
        });
      } else {
        // Insert new menu with is_enabled = true (default enabled)
        const insertResult = await pool.query(
          `INSERT INTO menu_features (route_path, display_name, parent_path, is_enabled, created_at, updated_at)
           VALUES ($1, $2, $3, TRUE, NOW(), NOW())
           RETURNING id, route_path, display_name, is_enabled, parent_path`,
          [menu.route_path, menu.display_name, menu.parent_path]
        );
        
        const newMenu = insertResult.rows[0];
        syncedMenus.push(newMenu);
        newMenus.push(newMenu);
      }
    }

    res.json({
      success: true,
      data: syncedMenus,
      message: `Synced ${syncedMenus.length} menus. ${newMenus.length} new menu(s) added.`,
      newMenusCount: newMenus.length
    });
  } catch (error) {
    console.error('Fetch menus error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch and sync menus'
    });
  }
});

// PATCH /api/admin/menus/:id/toggle
// Toggle enable/disable status for a menu
// If disabling a parent menu, also disable all its submenus
router.patch('/admin/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get current menu with its route_path
    const current = await pool.query(
      'SELECT id, is_enabled, route_path FROM menu_features WHERE id = $1',
      [id]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Menu not found'
      });
    }

    const menu = current.rows[0];
    const newStatus = !menu.is_enabled;

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Update the menu status
      const result = await pool.query(
        `UPDATE menu_features 
         SET is_enabled = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, route_path, display_name, is_enabled`,
        [newStatus, id]
      );

      // If disabling, also disable all submenus (children)
      if (!newStatus) {
        await pool.query(
          `UPDATE menu_features 
           SET is_enabled = FALSE, updated_at = NOW()
           WHERE parent_path = $1`,
          [menu.route_path]
        );
      }

      await pool.query('COMMIT');

      res.json({
        success: true,
        data: result.rows[0],
        message: newStatus 
          ? 'Menu enabled successfully' 
          : 'Menu and all its submenus disabled successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Toggle menu error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle menu status'
    });
  }
});

// PUT /api/admin/menus/:id
// Update menu details (display_name, display_order)
router.put('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, display_order } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(display_name);
    }

    if (display_order !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(display_order);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE menu_features 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, route_path, display_name, is_enabled, display_order`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Menu not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Menu updated successfully'
    });
  } catch (error) {
    console.error('Update menu error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update menu'
    });
  }
});

// GET /api/user/menus
// Get enabled menus for client sidebar (public endpoint, but requires authentication)
router.get('/user', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT route_path, display_name, parent_path, display_order
       FROM menu_features
       WHERE is_enabled = TRUE
       ORDER BY parent_path NULLS FIRST, display_order, route_path`
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get enabled menus error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch enabled menus'
    });
  }
});

export default router;

