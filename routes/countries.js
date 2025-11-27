import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

/**
 * GET /api/countries
 * Get all active countries from database
 */
// Root route - MUST come before /:countryCode
router.get('/', async (req, res, next) => {
  try {
    console.log('🌍 Countries route hit:', req.url);
    const { active_only = 'true' } = req.query;
    
    let query = 'SELECT id, name, country_code, phone_code, is_active FROM countries';
    const params = [];
    
    // If active_only is true, only return active countries
    if (active_only === 'true') {
      query += ' WHERE is_active = $1';
      params.push(1);
    }
    
    query += ' ORDER BY name ASC';
    
    const result = await pool.query(query, params);
    
    console.log(`✅ Returning ${result.rows.length} countries`);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get countries error:', error);
    // If table doesn't exist, return empty array instead of error
    if (error.message && error.message.includes('does not exist')) {
      console.error('Countries table does not exist. Please run countries_table.sql');
      return res.json({
        success: true,
        data: [],
        message: 'Countries table not found. Please run the migration.'
      });
    }
    next(error);
  }
});

/**
 * GET /api/countries/:countryCode
 * Get a specific country by country code
 */
router.get('/:countryCode', async (req, res, next) => {
  try {
    const { countryCode } = req.params;
    
    const result = await pool.query(
      'SELECT id, name, country_code, phone_code, is_active FROM countries WHERE country_code = $1',
      [countryCode.toUpperCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Country not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get country error:', error);
    next(error);
  }
});

export default router;

