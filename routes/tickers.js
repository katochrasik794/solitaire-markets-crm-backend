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

// Create uploads directory for ticker images
const tickerUploadsDir = path.join(__dirname, '../uploads/tickers');
if (!fs.existsSync(tickerUploadsDir)) {
  fs.mkdirSync(tickerUploadsDir, { recursive: true });
}

// Configure multer for ticker image uploads
const tickerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tickerUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ticker-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const tickerUpload = multer({
  storage: tickerStorage,
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
 * GET /api/tickers
 * Public endpoint - Get active tickers for user side
 */
router.get('/', async (req, res) => {
  try {
    const { position, is_active } = req.query;
    
    let query = 'SELECT * FROM tickers WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (is_active !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(is_active === 'true');
    }

    if (position) {
      paramCount++;
      query += ` AND position = $${paramCount}`;
      params.push(position);
    }

    query += ' ORDER BY priority DESC, created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get tickers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickers'
    });
  }
});

/**
 * GET /api/tickers/admin
 * Get all tickers (admin only)
 */
router.get('/admin', authenticateAdmin, async (req, res) => {
  try {
    const { position, is_active, search } = req.query;
    
    let query = 'SELECT * FROM tickers WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (is_active !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(is_active === 'true');
    }

    if (position) {
      paramCount++;
      query += ` AND position = $${paramCount}`;
      params.push(position);
    }

    if (search) {
      paramCount++;
      query += ` AND (title ILIKE $${paramCount} OR message ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY priority DESC, created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get admin tickers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickers'
    });
  }
});

/**
 * GET /api/tickers/admin/:id
 * Get single ticker by ID
 */
router.get('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM tickers WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ticker not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get ticker error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ticker'
    });
  }
});

/**
 * POST /api/tickers/admin
 * Create new ticker
 */
router.post('/admin', authenticateAdmin, tickerUpload.single('image'), async (req, res) => {
  try {
    const {
      title,
      message,
      link_url,
      position = 'top',
      is_active = 'true',
      display_duration = 5,
      animation_speed = 50,
      priority = 0
    } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/tickers/${req.file.filename}`;
    }

    const result = await pool.query(
      `INSERT INTO tickers (
        title, message, image_url, link_url, position, is_active, 
        display_duration, animation_speed, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        title.trim(),
        message ? message.trim() : null,
        imageUrl,
        link_url ? link_url.trim() : null,
        position,
        is_active === 'true' || is_active === true,
        parseInt(display_duration) || 5,
        parseInt(animation_speed) || 50,
        parseInt(priority) || 0
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Ticker created successfully'
    });
  } catch (error) {
    console.error('Create ticker error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create ticker'
    });
  }
});

/**
 * PUT /api/tickers/admin/:id
 * Update ticker
 */
router.put('/admin/:id', authenticateAdmin, tickerUpload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      message,
      link_url,
      position,
      is_active,
      display_duration,
      animation_speed,
      priority
    } = req.body;

    // Check if ticker exists
    const existing = await pool.query(
      'SELECT * FROM tickers WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ticker not found'
      });
    }

    const currentTicker = existing.rows[0];

    // Handle image upload
    let imageUrl = currentTicker.image_url;
    if (req.file) {
      // Delete old image if exists
      if (currentTicker.image_url) {
        const oldImagePath = path.join(__dirname, '..', currentTicker.image_url);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      imageUrl = `/uploads/tickers/${req.file.filename}`;
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (title !== undefined) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      values.push(title.trim());
    }

    if (message !== undefined) {
      paramCount++;
      updates.push(`message = $${paramCount}`);
      values.push(message ? message.trim() : null);
    }

    if (imageUrl !== undefined) {
      paramCount++;
      updates.push(`image_url = $${paramCount}`);
      values.push(imageUrl);
    }

    if (link_url !== undefined) {
      paramCount++;
      updates.push(`link_url = $${paramCount}`);
      values.push(link_url ? link_url.trim() : null);
    }

    if (position !== undefined) {
      paramCount++;
      updates.push(`position = $${paramCount}`);
      values.push(position);
    }

    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(is_active === 'true' || is_active === true);
    }

    if (display_duration !== undefined) {
      paramCount++;
      updates.push(`display_duration = $${paramCount}`);
      values.push(parseInt(display_duration) || 5);
    }

    if (animation_speed !== undefined) {
      paramCount++;
      updates.push(`animation_speed = $${paramCount}`);
      values.push(parseInt(animation_speed) || 50);
    }

    if (priority !== undefined) {
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      values.push(parseInt(priority) || 0);
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

    const query = `UPDATE tickers SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Ticker updated successfully'
    });
  } catch (error) {
    console.error('Update ticker error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update ticker'
    });
  }
});

/**
 * DELETE /api/tickers/admin/:id
 * Delete ticker
 */
router.delete('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get ticker to delete image file
    const result = await pool.query(
      'SELECT * FROM tickers WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ticker not found'
      });
    }

    const ticker = result.rows[0];

    // Delete image file if exists
    if (ticker.image_url) {
      const imagePath = path.join(__dirname, '..', ticker.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Delete ticker from database
    await pool.query('DELETE FROM tickers WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Ticker deleted successfully'
    });
  } catch (error) {
    console.error('Delete ticker error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete ticker'
    });
  }
});

/**
 * PATCH /api/tickers/admin/:id/toggle
 * Toggle active status
 */
router.patch('/admin/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE tickers 
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ticker not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `Ticker ${result.rows[0].is_active ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Toggle ticker error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle ticker status'
    });
  }
});

export default router;

