import express from 'express';
import pool from '../config/database.js';
import { authenticateAdmin } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create uploads directory for promotion images
const promotionUploadsDir = path.join(__dirname, '../uploads/promotions');
if (!fs.existsSync(promotionUploadsDir)) {
  fs.mkdirSync(promotionUploadsDir, { recursive: true });
}

// Configure multer for promotion image uploads
const promotionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, promotionUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'promotion-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const promotionUpload = multer({
  storage: promotionStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
  }
});

/**
 * GET /api/promotions
 * Public endpoint - Get active promotions for user side
 */
router.get('/', async (req, res) => {
  try {
    const { is_active } = req.query;
    
    let query = 'SELECT * FROM promotions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (is_active !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(is_active === 'true');
    } else {
      // Default to active only for public endpoint
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(true);
    }

    query += ' ORDER BY priority DESC, display_order ASC, created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get promotions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promotions'
    });
  }
});

/**
 * GET /api/promotions/admin
 * Get all promotions (admin only)
 */
router.get('/admin', authenticateAdmin, async (req, res) => {
  try {
    const { is_active, search } = req.query;
    
    let query = 'SELECT * FROM promotions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (is_active !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(is_active === 'true');
    }

    if (search) {
      paramCount++;
      query += ` AND (title ILIKE $${paramCount} OR button_text ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY priority DESC, display_order ASC, created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get admin promotions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promotions'
    });
  }
});

/**
 * GET /api/promotions/admin/:id
 * Get single promotion by ID
 */
router.get('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM promotions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Promotion not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get promotion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promotion'
    });
  }
});

/**
 * POST /api/promotions/admin
 * Create new promotion
 */
router.post('/admin', authenticateAdmin, promotionUpload.single('image'), async (req, res) => {
  try {
    const {
      title,
      button_text,
      button_link,
      button_position = 'right-center',
      is_active = 'true',
      priority = 0,
      display_order = 0
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    const imageUrl = `/uploads/promotions/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO promotions (
        title, image_url, button_text, button_link, button_position, 
        is_active, priority, display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        title ? title.trim() : null,
        imageUrl,
        button_text ? button_text.trim() : null,
        button_link ? button_link.trim() : null,
        button_position,
        is_active === 'true' || is_active === true,
        parseInt(priority) || 0,
        parseInt(display_order) || 0
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Promotion created successfully'
    });
  } catch (error) {
    console.error('Create promotion error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create promotion'
    });
  }
});

/**
 * PUT /api/promotions/admin/:id
 * Update promotion
 */
router.put('/admin/:id', authenticateAdmin, promotionUpload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      button_text,
      button_link,
      button_position,
      is_active,
      priority,
      display_order
    } = req.body;

    // Check if promotion exists
    const existing = await pool.query(
      'SELECT * FROM promotions WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Promotion not found'
      });
    }

    const currentPromotion = existing.rows[0];

    // Handle image upload
    let imageUrl = currentPromotion.image_url;
    if (req.file) {
      // Delete old image if exists
      if (currentPromotion.image_url) {
        const oldImagePath = path.join(__dirname, '..', currentPromotion.image_url);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      imageUrl = `/uploads/promotions/${req.file.filename}`;
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (title !== undefined) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      values.push(title ? title.trim() : null);
    }

    if (imageUrl !== undefined) {
      paramCount++;
      updates.push(`image_url = $${paramCount}`);
      values.push(imageUrl);
    }

    if (button_text !== undefined) {
      paramCount++;
      updates.push(`button_text = $${paramCount}`);
      values.push(button_text ? button_text.trim() : null);
    }

    if (button_link !== undefined) {
      paramCount++;
      updates.push(`button_link = $${paramCount}`);
      values.push(button_link ? button_link.trim() : null);
    }

    if (button_position !== undefined) {
      paramCount++;
      updates.push(`button_position = $${paramCount}`);
      values.push(button_position);
    }

    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(is_active === 'true' || is_active === true);
    }

    if (priority !== undefined) {
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      values.push(parseInt(priority) || 0);
    }

    if (display_order !== undefined) {
      paramCount++;
      updates.push(`display_order = $${paramCount}`);
      values.push(parseInt(display_order) || 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE promotions SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Promotion updated successfully'
    });
  } catch (error) {
    console.error('Update promotion error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update promotion'
    });
  }
});

/**
 * DELETE /api/promotions/admin/:id
 * Delete promotion
 */
router.delete('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get promotion to delete image file
    const result = await pool.query(
      'SELECT * FROM promotions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Promotion not found'
      });
    }

    const promotion = result.rows[0];

    // Delete image file if exists
    if (promotion.image_url) {
      const imagePath = path.join(__dirname, '..', promotion.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Delete promotion from database
    await pool.query('DELETE FROM promotions WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Promotion deleted successfully'
    });
  } catch (error) {
    console.error('Delete promotion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete promotion'
    });
  }
});

/**
 * PATCH /api/promotions/admin/:id/toggle
 * Toggle active status
 */
router.patch('/admin/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE promotions 
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Promotion not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `Promotion ${result.rows[0].is_active ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Toggle promotion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle promotion status'
    });
  }
});

export default router;

