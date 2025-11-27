import express from 'express';
import pool from '../config/database.js';
import { comparePassword } from '../utils/helpers.js';
import { validateLogin } from '../middleware/validate.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Test endpoint to verify admin routes are working
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Admin routes are working' });
});

/**
 * POST /api/admin/login
 * Admin login
 */
router.post('/login', validateLogin, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find admin by email
    const result = await pool.query(
      'SELECT id, username, email, password_hash, admin_role, is_active, login_attempts, locked_until FROM admin WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const admin = result.rows[0];

    // Check if admin is active
    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is deactivated'
      });
    }

    // Check if account is locked
    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is temporarily locked. Please try again later.'
      });
    }

    // Verify password - handle bcrypt formats ($2a$, $2b$, $2y$)
    // bcryptjs can handle all bcrypt formats including $2y$
    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);

    if (!isPasswordValid) {
      // Increment login attempts
      const newAttempts = (admin.login_attempts || 0) + 1;
      const lockUntil = newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null; // Lock for 30 minutes after 5 failed attempts
      
      await pool.query(
        'UPDATE admin SET login_attempts = $1, locked_until = $2 WHERE id = $3',
        [newAttempts, lockUntil, admin.id]
      );

      // Log failed login attempt
      try {
        await pool.query(
          `INSERT INTO admin_login_log (admin_id, ip_address, user_agent, success, failure_reason, created_at)
           VALUES ($1, $2, $3, FALSE, $4, NOW())`,
          [admin.id, req.ip || req.headers['x-forwarded-for'] || 'unknown', req.headers['user-agent'] || 'unknown', 'Invalid password']
        );
      } catch (logError) {
        console.error('Error logging failed login:', logError);
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Reset login attempts on successful login
    await pool.query(
      'UPDATE admin SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
      [admin.id]
    );

    // Log successful login attempt
    try {
      await pool.query(
        `INSERT INTO admin_login_log (admin_id, ip_address, user_agent, success, created_at)
         VALUES ($1, $2, $3, TRUE, NOW())`,
        [admin.id, req.ip || req.headers['x-forwarded-for'] || 'unknown', req.headers['user-agent'] || 'unknown']
      );
    } catch (logError) {
      console.error('Error logging successful login:', logError);
    }

    // Check if admin is also a country admin
    let countryAdminData = null;
    try {
      const countryAdminResult = await pool.query(
        'SELECT * FROM country_admins WHERE email = $1',
        [admin.email]
      );
      
      if (countryAdminResult.rows.length > 0) {
        const countryAdmin = countryAdminResult.rows[0];
        const features = countryAdmin.features 
          ? countryAdmin.features.split(',').map(f => f.trim()).filter(f => f && f.length > 0)
          : [];
        
        countryAdminData = {
          isCountryAdmin: true,
          features: features,
          country: countryAdmin.country_code,
          countryAdminId: countryAdmin.id,
          status: countryAdmin.status,
          name: countryAdmin.name
        };
      }
    } catch (err) {
      console.error('Error checking country_admin table:', err);
      // Continue with regular admin login if country admin check fails
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        adminId: admin.id,
        email: admin.email,
        role: admin.admin_role,
        isCountryAdmin: countryAdminData ? true : false
      },
      process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Build admin response object
    const adminResponse = {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.admin_role,
      ...(countryAdminData && countryAdminData)
    };

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        admin: adminResponse,
        token
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    next(error);
  }
});

export default router;

