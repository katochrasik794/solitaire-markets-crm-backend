import express from 'express';
import pool from '../config/database.js';
import { adjustWalletBalance, createWalletForUser } from '../services/wallet.service.js';
import * as mt5Service from '../services/mt5.service.js';
import { hashPassword, comparePassword, generateRandomPassword, encryptPassword } from '../utils/helpers.js';
import { validateLogin } from '../middleware/validate.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';
import { sendOperationEmail, sendEmail, getLogoUrl } from '../services/email.js';
import {
  sendTransactionCompletedEmail,
  sendInternalTransferEmail,
  sendKYCCompletionEmail,
  sendTicketCreatedEmail,
  sendTicketResponseEmail,
  sendMT5AccountCreatedEmail
} from '../services/templateEmail.service.js';
import { logAdminAction } from '../services/logging.service.js';
import { captureResponseData, logAdminActionMiddleware } from '../middleware/logging.middleware.js';
import { requireAdminFeaturePermission } from '../middleware/permissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to get base URL
const getBaseUrl = () => {
  if (process.env.BACKEND_API_URL) {
    return process.env.BACKEND_API_URL.replace('/api', '');
  }
  if (process.env.API_URL) {
    return process.env.API_URL.replace('/api', '');
  }
  return 'http://localhost:5000';
};

// Create uploads directory for payment gateways
const gatewaysUploadsDir = path.join(__dirname, '../uploads/gateways');
if (!fs.existsSync(gatewaysUploadsDir)) {
  fs.mkdirSync(gatewaysUploadsDir, { recursive: true });
}

// Create uploads directory for KYC documents
const kycUploadsDir = path.join(__dirname, '../uploads/kyc');
if (!fs.existsSync(kycUploadsDir)) {
  fs.mkdirSync(kycUploadsDir, { recursive: true });
}

// Configure multer for payment gateway file uploads
const gatewayStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, gatewaysUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `gateway-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Configure multer for KYC document uploads
const kycStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, kycUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `kyc-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const kycUpload = multer({
  storage: kycStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for documents
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf';

    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WEBP) and PDF files are allowed'));
    }
  }
});

const gatewayUpload = multer({
  storage: gatewayStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WEBP, SVG) are allowed'));
    }
  }
});

const router = express.Router();

/**
 * Admin authentication middleware
 */
const authenticateAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        error: 'No token provided or invalid format',
        message: 'No token provided or invalid format'
      });
    }

    const token = authHeader.substring(7);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: 'Access token is required',
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'your-secret-key');

    // Check if it's an admin token
    if (!decoded.adminId) {
      return res.status(403).json({
        ok: false,
        error: 'Admin access required',
        message: 'Admin access required'
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        ok: false,
        error: 'Token has expired',
        message: 'Token has expired'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        ok: false,
        error: 'Invalid token',
        message: 'Invalid token'
      });
    }
    return res.status(500).json({
      ok: false,
      error: 'Token verification failed',
      message: error.message || 'Token verification failed'
    });
  }
};

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
    console.log('🔐 Admin login attempt:', { email: email?.substring(0, 10) + '...', hasPassword: !!password });

    // Check database connection
    try {
      await pool.query('SELECT 1');
    } catch (dbError) {
      console.error('❌ Database connection error:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    // Find admin by email
    const result = await pool.query(
      'SELECT id, username, email, password_hash, admin_role, is_active, login_attempts, locked_until, features, feature_permissions FROM admin WHERE email = $1',
      [email]
    );
    console.log('📋 Admin query result:', { found: result.rows.length > 0 });

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

    // Log successful login attempt with token hash to track current session
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query(
        `INSERT INTO admin_login_log (admin_id, ip_address, user_agent, success, token_hash, created_at)
         VALUES ($1, $2, $3, TRUE, $4, NOW())`,
        [admin.id, req.ip || req.headers['x-forwarded-for'] || 'unknown', req.headers['user-agent'] || 'unknown', tokenHash]
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
      features: admin.features || [],
      feature_permissions: admin.feature_permissions || {},
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
    console.error('❌ Admin login error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      detail: error.detail
    });

    // Return a proper error response instead of passing to error handler
    res.status(500).json({
      success: false,
      message: error.message || 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * ============================================
 * Support / Tickets Dashboard Summary
 * ============================================
 */

/**
 * GET /api/admin/support/summary
 * Return a lightweight summary of support tickets for the admin dashboard
 */
router.get('/support/summary', authenticateAdmin, async (req, res) => {
  try {
    // Count open tickets (status = 'open' or 'opened' – normalized)
    const countResult = await pool.query(
      `SELECT COUNT(*) AS open_count
       FROM support_tickets
       WHERE LOWER(TRIM(status)) = 'open'`
    );

    const openCount = parseInt(countResult.rows[0]?.open_count || '0', 10);

    // Fetch a few latest open tickets with user information
    const latestResult = await pool.query(
      `SELECT t.id, t.subject, t.priority, t.status, t.created_at,
              u.email as user_email, u.first_name || ' ' || u.last_name as user_name
       FROM support_tickets t
       JOIN users u ON t.user_id = u.id
       WHERE LOWER(TRIM(t.status)) = 'open'
       ORDER BY t.created_at DESC
       LIMIT 5`
    );

    res.json({
      ok: true,
      openTickets: openCount,
      latestTickets: latestResult.rows || []
    });
  } catch (error) {
    console.error('Support summary error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to load support summary'
    });
  }
});

/**
 * ============================================
 * Admin Users & Country Admins
 * ============================================
 */

/**
 * GET /api/admin/country-admins
 * List all country admins (used for scoping users list and admin UI)
 */
router.get('/country-admins', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id,
              name,
              email,
              COALESCE(status, 'active')       AS status,
              country_code                     AS country,
              COALESCE(features, '')           AS features,
              created_at,
              updated_at
       FROM country_admins
       ORDER BY created_at DESC`
    );

    const admins = result.rows.map(r => ({
      ...r,
      features: r.features
        ? String(r.features)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
        : []
    }));

    res.json(admins);
  } catch (error) {
    console.error('Get country admins error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to load country admins' });
  }
});

/**
 * POST /api/admin/country-admins
 * Create a new country admin (Assign Country Partner)
 */
router.post('/country-admins', authenticateAdmin, async (req, res) => {
  try {
    const { name, email, password, status = 'active', country, features = [] } = req.body;

    if (!email || !password || !country || !name) {
      return res.status(400).json({ ok: false, error: 'Name, email, password and country are required' });
    }

    const existing = await pool.query(
      'SELECT id FROM admin WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ ok: false, error: 'Admin with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user entry
    const adminRes = await pool.query(
      `INSERT INTO admin (username, email, password_hash, admin_role, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,TRUE,NOW(),NOW())
       RETURNING id`,
      [name, email, passwordHash, 'country_admin']
    );
    const adminId = adminRes.rows[0].id;

    // Create country_admins entry
    const featString = Array.isArray(features) ? features.join(',') : String(features || '');
    const caRes = await pool.query(
      `INSERT INTO country_admins (name, email, status, country_code, features, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
       RETURNING id, name, email, status, country_code AS country, features, created_at, updated_at`,
      [name, email, status, country, featString]
    );

    const ca = caRes.rows[0];
    ca.features = featString
      ? featString.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    res.json({ ok: true, adminId, countryAdmin: ca });
  } catch (error) {
    console.error('Create country admin error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to create country admin' });
  }
});

/**
 * PUT /api/admin/country-admins/:id
 * Update country admin details and features
 */
router.put('/country-admins/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status, country, features = [] } = req.body;

    const featString = Array.isArray(features) ? features.join(',') : String(features || '');

    const result = await pool.query(
      `UPDATE country_admins
       SET name = COALESCE($1,name),
           status = COALESCE($2,status),
           country_code = COALESCE($3,country_code),
           features = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, email, status, country_code AS country, features, created_at, updated_at`,
      [name, status, country, featString, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Country admin not found' });
    }

    const row = result.rows[0];
    row.features = featString
      ? featString.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    res.json({ ok: true, admin: row });
  } catch (error) {
    console.error('Update country admin error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to update country admin' });
  }
});

/**
 * PATCH /api/admin/country-admins/:id/password
 */
router.patch('/country-admins/:id/password', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ ok: false, error: 'Password is required' });

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE admin SET password_hash = $1, updated_at = NOW()
       WHERE email = (SELECT email FROM country_admins WHERE id = $2)`,
      [passwordHash, id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Update country admin password error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to update password' });
  }
});

/**
 * DELETE /api/admin/country-admins/:id
 */
router.delete('/country-admins/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const caRes = await pool.query(
      'DELETE FROM country_admins WHERE id = $1 RETURNING email',
      [id]
    );
    if (caRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Country admin not found' });
    }

    const email = caRes.rows[0].email;
    await pool.query('DELETE FROM admin WHERE email = $1', [email]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete country admin error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to delete country admin' });
  }
});

/**
 * ============================================
 * Admin Profile (self)
 * ============================================
 */

// GET /api/admin/profile - current admin profile
router.get('/profile', authenticateAdmin, async (req, res) => {
  try {
    const adminId = req.admin.adminId || req.admin.id;
    if (!adminId) {
      return res.status(400).json({ ok: false, error: 'Admin id missing in token' });
    }

    const result = await pool.query(
      `SELECT id, username, email, admin_role, is_active, last_login, created_at
       FROM admin
       WHERE id = $1`,
      [adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Admin profile not found' });
    }

    res.json({ ok: true, profile: result.rows[0] });
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to load profile' });
  }
});

// PUT /api/admin/profile - update current admin profile (username/email/password)
router.put('/profile', authenticateAdmin, async (req, res) => {
  try {
    const adminId = req.admin.adminId || req.admin.id;
    const { username, email, currentPassword, newPassword } = req.body;

    const existingRes = await pool.query(
      'SELECT id, password_hash FROM admin WHERE id = $1',
      [adminId]
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    // If changing password, verify currentPassword
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ ok: false, error: 'Current password is required' });
      }
      const ok = await bcrypt.compare(currentPassword, existingRes.rows[0].password_hash);
      if (!ok) {
        return res.status(400).json({ ok: false, error: 'Current password is incorrect' });
      }
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (username) {
      fields.push(`username = $${idx++}`);
      values.push(username);
    }
    if (email) {
      fields.push(`email = $${idx++}`);
      values.push(email);
    }
    if (newPassword) {
      const hash = await bcrypt.hash(newPassword, 10);
      fields.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ ok: false, error: 'Nothing to update' });
    }

    values.push(adminId);

    const updateRes = await pool.query(
      `UPDATE admin SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx}
       RETURNING id, username, email, admin_role, is_active, last_login, created_at`,
      values
    );

    res.json({ ok: true, profile: updateRes.rows[0] });
  } catch (error) {
    console.error('Update admin profile error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to update profile' });
  }
});

// GET /api/admin/login-history - recent login history for current admin
router.get('/login-history', authenticateAdmin, async (req, res) => {
  try {
    const adminId = req.admin.adminId || req.admin.id;
    const currentToken = req.headers.authorization?.substring(7); // Remove 'Bearer ' prefix
    const currentTokenHash = currentToken ? crypto.createHash('sha256').update(currentToken).digest('hex') : null;

    const result = await pool.query(
      `SELECT id,
              ip_address,
              user_agent,
              location,
              device,
              browser,
              os,
              success,
              failure_reason,
              token_hash,
              created_at AT TIME ZONE 'UTC' AS timestamp_utc
       FROM admin_login_log
       WHERE admin_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [adminId]
    );

    const history = result.rows.map((row) => ({
      id: row.id,
      ip_address: row.ip_address,
      location: row.location || null,
      device: row.device || row.browser || row.os || row.user_agent || null,
      user_agent: row.user_agent,
      success: row.success,
      failure_reason: row.failure_reason || null,
      timestamp: row.timestamp_utc, // UTC time; frontend can format to local
      isCurrentSession: currentTokenHash && row.token_hash === currentTokenHash, // Mark current session
    }));

    res.json({ ok: true, history });
  } catch (error) {
    console.error('Get admin login history error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to load login history' });
  }
});

/**
 * POST /api/admin/logout/device
 * Logout from current device (blacklist current token)
 */
router.post('/logout/device', authenticateAdmin, async (req, res) => {
  try {
    const adminId = req.admin.adminId;
    const token = req.headers.authorization?.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(400).json({ ok: false, error: 'No token provided' });
    }

    // Decode token to get expiration
    let decoded;
    try {
      decoded = jwt.decode(token);
    } catch (err) {
      return res.status(400).json({ ok: false, error: 'Invalid token' });
    }

    if (!decoded || !decoded.exp) {
      return res.status(400).json({ ok: false, error: 'Invalid token format' });
    }

    // Hash the token for storage
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(decoded.exp * 1000);

    // Add token to blacklist
    await pool.query(
      `INSERT INTO admin_token_blacklist (admin_id, token_hash, ip_address, user_agent, logout_type, expires_at)
       VALUES ($1, $2, $3, $4, 'device', $5)`,
      [
        adminId,
        tokenHash,
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown',
        expiresAt
      ]
    );

    res.json({ ok: true, message: 'Logged out from this device successfully' });
  } catch (error) {
    console.error('Logout device error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to logout from device' });
  }
});

/**
 * POST /api/admin/logout/all
 * Logout from all devices (blacklist all tokens for this admin)
 */
router.post('/logout/all', authenticateAdmin, async (req, res) => {
  try {
    const adminId = req.admin.adminId;
    const token = req.headers.authorization?.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(400).json({ ok: false, error: 'No token provided' });
    }

    // Decode token to get expiration
    let decoded;
    try {
      decoded = jwt.decode(token);
    } catch (err) {
      return res.status(400).json({ ok: false, error: 'Invalid token' });
    }

    if (!decoded || !decoded.exp) {
      return res.status(400).json({ ok: false, error: 'Invalid token format' });
    }

    // Hash the current token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(decoded.exp * 1000);

    // Get all recent login logs for this admin to blacklist all active sessions
    // We'll use a marker approach: add a "logout_all" entry that marks all tokens as invalid
    await pool.query(
      `INSERT INTO admin_token_blacklist (admin_id, token_hash, ip_address, user_agent, logout_type, expires_at)
       VALUES ($1, $2, $3, $4, 'all', $5)`,
      [
        adminId,
        tokenHash,
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown',
        expiresAt
      ]
    );

    // Also add a special marker entry that indicates "all devices logged out"
    // This will be checked in the middleware
    // Delete any existing "logout all" markers first, then insert new one
    await pool.query(
      `DELETE FROM admin_token_blacklist 
       WHERE admin_id = $1 AND token_hash = $2`,
      [adminId, 'LOGOUT_ALL_' + adminId]
    );

    await pool.query(
      `INSERT INTO admin_token_blacklist (admin_id, token_hash, ip_address, user_agent, logout_type, expires_at)
       VALUES ($1, $2, $3, $4, 'all', $5)`,
      [
        adminId,
        'LOGOUT_ALL_' + adminId, // Special marker
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown',
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
      ]
    );

    res.json({ ok: true, message: 'Logged out from all devices successfully' });
  } catch (error) {
    console.error('Logout all devices error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to logout from all devices' });
  }
});

/**
 * ============================================
 * Admin Roles & Role Assignments
 * ============================================
 */

// Get all roles
router.get('/roles', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, permissions, is_system, created_at, updated_at
       FROM admin_roles
       ORDER BY name ASC`
    );
    res.json({ ok: true, roles: result.rows });
  } catch (error) {
    console.error('Get admin roles error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to fetch roles' });
  }
});

// Create a new role
router.post('/roles', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, permissions, featurePermissions, features } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: 'Role name is required' });

    // Build permissions object with features and feature_permissions
    let permsJson = { features: [] };

    // Handle features (can be passed directly as features array or in permissions object)
    if (Array.isArray(features)) {
      permsJson.features = features;
    } else if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
      permsJson = { ...permissions };
    } else if (Array.isArray(permissions)) {
      permsJson.features = permissions;
    } else if (permissions && typeof permissions === 'object' && permissions.features) {
      permsJson.features = permissions.features;
    }

    // Validate and add feature_permissions if provided
    if (featurePermissions !== undefined) {
      if (typeof featurePermissions !== 'object' || Array.isArray(featurePermissions)) {
        return res.status(400).json({ ok: false, error: 'featurePermissions must be an object' });
      }

      // Validate structure: each feature should have view, add, edit, delete booleans
      for (const [featurePath, perms] of Object.entries(featurePermissions)) {
        if (typeof perms !== 'object' || Array.isArray(perms)) {
          return res.status(400).json({ ok: false, error: `Invalid permissions structure for feature: ${featurePath}` });
        }
        const validActions = ['view', 'add', 'edit', 'delete'];
        for (const action of validActions) {
          if (perms[action] !== undefined && typeof perms[action] !== 'boolean') {
            return res.status(400).json({ ok: false, error: `Permission ${action} for feature ${featurePath} must be a boolean` });
          }
        }
      }
      permsJson.feature_permissions = featurePermissions;
    }

    const result = await pool.query(
      `INSERT INTO admin_roles (name, description, permissions, is_system)
       VALUES ($1,$2,$3,FALSE)
       RETURNING id, name, description, permissions, is_system, created_at, updated_at`,
      [name, description || null, permsJson]
    );

    res.json({ ok: true, role: result.rows[0] });
  } catch (error) {
    console.error('Create admin role error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to create role' });
  }
});

// Update a role
router.put('/roles/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, featurePermissions, features } = req.body;

    // Get existing role to merge with
    const existingRole = await pool.query(
      'SELECT permissions FROM admin_roles WHERE id = $1',
      [id]
    );

    if (existingRole.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Role not found' });
    }

    let permsJson = existingRole.rows[0].permissions || { features: [] };

    // Update features if provided (prioritize direct 'features' field)
    if (Array.isArray(features)) {
      permsJson.features = features;
    } else if (permissions !== undefined) {
      if (Array.isArray(permissions)) {
        permsJson = { ...permsJson, features: permissions };
      } else if (typeof permissions === 'object' && permissions !== null) {
        if (permissions.features) {
          permsJson.features = permissions.features;
        }
        if (permissions.feature_permissions) {
          permsJson.feature_permissions = permissions.feature_permissions;
        }
      }
    }

    // Update feature_permissions if provided separately
    if (featurePermissions !== undefined) {
      if (typeof featurePermissions !== 'object' || Array.isArray(featurePermissions)) {
        return res.status(400).json({ ok: false, error: 'featurePermissions must be an object' });
      }

      // Validate structure: each feature should have view, add, edit, delete booleans
      for (const [featurePath, perms] of Object.entries(featurePermissions)) {
        if (typeof perms !== 'object' || Array.isArray(perms)) {
          return res.status(400).json({ ok: false, error: `Invalid permissions structure for feature: ${featurePath}` });
        }
        const validActions = ['view', 'add', 'edit', 'delete'];
        for (const action of validActions) {
          if (perms[action] !== undefined && typeof perms[action] !== 'boolean') {
            return res.status(400).json({ ok: false, error: `Permission ${action} for feature ${featurePath} must be a boolean` });
          }
        }
      }
      permsJson.feature_permissions = featurePermissions;
    }

    const result = await pool.query(
      `UPDATE admin_roles
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           permissions = COALESCE($3, permissions),
           updated_at = NOW()
       WHERE id = $4 AND is_system = FALSE
       RETURNING id, name, description, permissions, is_system, created_at, updated_at`,
      [name, description, permsJson, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Role not found or system role cannot be edited' });
    }

    res.json({ ok: true, role: result.rows[0] });
  } catch (error) {
    console.error('Update admin role error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to update role' });
  }
});

// Delete a role
router.delete('/roles/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM admin_roles
       WHERE id = $1 AND is_system = FALSE
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Role not found or system role cannot be deleted' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete admin role error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to delete role' });
  }
});

// List admin users for role assignment UI
router.get('/admins', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, admin_role, features, feature_permissions, is_active, last_login
       FROM admin
       ORDER BY id ASC`
    );
    // Ensure features is always an array and feature_permissions is always an object
    const admins = result.rows.map(admin => ({
      ...admin,
      features: admin.features || [],
      feature_permissions: admin.feature_permissions || {}
    }));
    res.json({ ok: true, admins });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to fetch admins' });
  }
});

/**
 * POST /api/admin/admins
 * Create a new admin user
 */
router.post('/admins', authenticateAdmin, async (req, res) => {
  try {
    const { username, email, password, admin_role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Username, email, and password are required' });
    }

    // Check if admin with this email already exists
    const existing = await pool.query(
      'SELECT id FROM admin WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ ok: false, error: 'Admin with this email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Determine role - use provided role or default to 'admin'
    const role = admin_role || 'admin';

    // Get features from request body (optional, defaults to empty array)
    const features = req.body.features || [];
    const featuresJson = Array.isArray(features) ? JSON.stringify(features) : '[]';

    // Insert new admin
    const result = await pool.query(
      `INSERT INTO admin (username, email, password_hash, admin_role, features, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, TRUE, NOW(), NOW())
       RETURNING id, username, email, admin_role, features, is_active, last_login, created_at`,
      [username, email, passwordHash, role, featuresJson]
    );

    const newAdmin = result.rows[0];

    // Ensure features is always an array in response
    const adminResponse = {
      ...newAdmin,
      features: newAdmin.features || []
    };

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'admin_create',
        actionCategory: 'admin_management',
        targetType: 'admin',
        targetId: newAdmin.id,
        targetIdentifier: newAdmin.email,
        description: `Created new admin user: ${newAdmin.username} (${newAdmin.email}) with role: ${role}`,
        req,
        res,
        beforeData: null,
        afterData: { admin: adminResponse }
      });
    });

    res.status(201).json({ ok: true, admin: adminResponse });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to create admin' });
  }
});

/**
 * PUT /api/admin/admins/:id/role
 * Update admin role
 */
router.put('/admins/:id/role', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_role } = req.body;

    if (!admin_role) {
      return res.status(400).json({ ok: false, error: 'Role is required' });
    }

    // Get current admin data for logging
    const currentAdmin = await pool.query(
      'SELECT id, username, email, admin_role, features FROM admin WHERE id = $1',
      [id]
    );

    if (currentAdmin.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    const beforeData = { ...currentAdmin.rows[0] };

    // Update admin role
    const result = await pool.query(
      `UPDATE admin SET admin_role = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, username, email, admin_role, features, is_active, last_login, created_at`,
      [admin_role, id]
    );

    const updatedAdmin = result.rows[0];

    // Ensure features is always an array in response
    const adminResponse = {
      ...updatedAdmin,
      features: updatedAdmin.features || []
    };

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'admin_role_update',
        actionCategory: 'admin_management',
        targetType: 'admin',
        targetId: updatedAdmin.id,
        targetIdentifier: updatedAdmin.email,
        description: `Updated admin role from "${beforeData.admin_role}" to "${admin_role}" for ${updatedAdmin.username}`,
        req,
        res,
        beforeData: { ...beforeData, features: beforeData.features || [] },
        afterData: { admin: adminResponse }
      });
    });

    res.json({ ok: true, admin: adminResponse });
  } catch (error) {
    console.error('Update admin role error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to update admin role' });
  }
});

/**
 * PUT /api/admin/admins/:id/password
 * Update admin password
 */
router.put('/admins/:id/password', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ ok: false, error: 'New password is required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    }

    // Check if admin exists
    const adminCheck = await pool.query(
      'SELECT id FROM admin WHERE id = $1',
      [id]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      `UPDATE admin SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, id]
    );

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'admin_password_update',
        actionCategory: 'admin_management',
        targetType: 'admin',
        targetId: parseInt(id),
        targetIdentifier: null,
        description: `Updated password for admin ID: ${id}`,
        req,
        res,
        beforeData: null,
        afterData: { adminId: parseInt(id) }
      });
    });

    res.json({ ok: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update admin password error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to update password' });
  }
});

/**
 * PUT /api/admin/admins/:id/features
 * Update admin features and feature_permissions (save directly to admin table)
 */
router.put('/admins/:id/features', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { features, featurePermissions } = req.body;

    if (!Array.isArray(features)) {
      return res.status(400).json({ ok: false, error: 'Features must be an array' });
    }

    // Validate featurePermissions if provided
    if (featurePermissions !== undefined) {
      if (typeof featurePermissions !== 'object' || Array.isArray(featurePermissions)) {
        return res.status(400).json({ ok: false, error: 'featurePermissions must be an object' });
      }

      // Validate structure: each feature should have view, add, edit, delete booleans
      for (const [featurePath, perms] of Object.entries(featurePermissions)) {
        if (typeof perms !== 'object' || Array.isArray(perms)) {
          return res.status(400).json({ ok: false, error: `Invalid permissions structure for feature: ${featurePath}` });
        }
        const validActions = ['view', 'add', 'edit', 'delete'];
        for (const action of validActions) {
          if (perms[action] !== undefined && typeof perms[action] !== 'boolean') {
            return res.status(400).json({ ok: false, error: `Permission ${action} for feature ${featurePath} must be a boolean` });
          }
        }
      }
    }

    // Check if admin exists
    const adminCheck = await pool.query(
      'SELECT id, username, email, admin_role, features, feature_permissions FROM admin WHERE id = $1',
      [id]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    const beforeData = { ...adminCheck.rows[0] };

    // Prepare update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    // Update features
    const featuresJson = JSON.stringify(features);
    updates.push(`features = $${paramIndex}::jsonb`);
    values.push(featuresJson);
    paramIndex++;

    // Update feature_permissions if provided
    if (featurePermissions !== undefined) {
      const permissionsJson = JSON.stringify(featurePermissions);
      updates.push(`feature_permissions = $${paramIndex}::jsonb`);
      values.push(permissionsJson);
      paramIndex++;
    }

    // Add updated_at
    updates.push(`updated_at = NOW()`);

    // Add WHERE clause
    values.push(id);

    const result = await pool.query(
      `UPDATE admin SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, username, email, admin_role, features, feature_permissions, is_active, last_login, created_at`,
      values
    );

    const updatedAdmin = result.rows[0];

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'admin_features_update',
        actionCategory: 'admin_management',
        targetType: 'admin',
        targetId: updatedAdmin.id,
        targetIdentifier: updatedAdmin.email,
        description: `Updated features and permissions for admin: ${updatedAdmin.username} (${updatedAdmin.email})`,
        req,
        res,
        beforeData: {
          features: beforeData.features || [],
          feature_permissions: beforeData.feature_permissions || {}
        },
        afterData: {
          features: updatedAdmin.features || [],
          feature_permissions: updatedAdmin.feature_permissions || {}
        }
      });
    });

    res.json({
      ok: true,
      admin: {
        ...updatedAdmin,
        features: updatedAdmin.features || [],
        feature_permissions: updatedAdmin.feature_permissions || {}
      }
    });
  } catch (error) {
    console.error('Update admin features error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to update admin features' });
  }
});

/**
 * DELETE /api/admin/admins/:id
 * Delete an admin user
 */
router.delete('/admins/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get admin data before deletion for logging
    const adminCheck = await pool.query(
      'SELECT id, username, email, admin_role FROM admin WHERE id = $1',
      [id]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    const adminToDelete = adminCheck.rows[0];

    // Prevent deletion of superadmin
    if (adminToDelete.admin_role === 'superadmin' || adminToDelete.admin_role === 'admin') {
      return res.status(403).json({ ok: false, error: 'Cannot delete super admin' });
    }

    // Delete admin
    await pool.query('DELETE FROM admin WHERE id = $1', [id]);

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'admin_delete',
        actionCategory: 'admin_management',
        targetType: 'admin',
        targetId: adminToDelete.id,
        targetIdentifier: adminToDelete.email,
        description: `Deleted admin user: ${adminToDelete.username} (${adminToDelete.email})`,
        req,
        res,
        beforeData: { admin: adminToDelete },
        afterData: null
      });
    });

    res.json({ ok: true, message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to delete admin' });
  }
});


/**
 * GET /api/admin/countries
 * Admin-friendly countries list (used in AddUser.jsx)
 */
router.get('/countries', authenticateAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT name, country_code, phone_code, is_active
       FROM countries
       WHERE is_active = 1
       ORDER BY name ASC`
    );

    const countries = result.rows.map(row => ({
      country: row.name,
      code: row.country_code,
      phoneCode: row.phone_code
    }));

    res.json({
      ok: true,
      countries
    });
  } catch (error) {
    console.error('Admin countries error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to load countries'
    });
  }
});

/**
 * POST /api/admin/users
 * Create a new user from admin panel (mirrors public signup)
 */
router.post('/users', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      country,
      password,
      status,
      emailVerified,
      kycVerified
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: 'Email and password are required'
      });
    }

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({
        ok: false,
        error: 'User with this email already exists'
      });
    }

    // Split full name into first/last
    let firstName = null;
    let lastName = null;
    if (name && typeof name === 'string') {
      const parts = name.trim().split(/\s+/);
      firstName = parts[0] || null;
      lastName =
        parts.length > 1 ? parts.slice(1).join(' ') : null;
    }

    // Parse phone into phone_code + phone_number (very simple split)
    // DB column phone_code is VARCHAR(10), so enforce a max length.
    let phoneCode = null;
    let phoneNumber = null;
    if (phone && typeof phone === 'string') {
      const trimmed = phone.trim();
      const m = trimmed.match(/^\+?(\d+)\s*(.*)$/);
      if (m) {
        // Limit dial code to max 9 digits to stay within VARCHAR(10) including '+'
        const dialDigits = m[1].slice(0, 9);
        phoneCode = `+${dialDigits}`;
        // Anything after the dial code (or remaining digits) goes into phone_number
        const rest = m[2] && m[2].trim().length > 0
          ? m[2].trim()
          : trimmed.replace(/^\+?\d+/, '').trim();
        phoneNumber = rest || null;
      } else {
        phoneNumber = trimmed;
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Insert user; referral_code will be auto-generated by DB trigger
    const userStatus = status && ['active', 'banned', 'inactive'].includes(status) ? status : 'active';
    const userResult = await pool.query(
      `INSERT INTO users (
         email,
         password_hash,
         first_name,
         last_name,
         phone_code,
         phone_number,
         country,
         status,
         is_email_verified
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, email, first_name, last_name, country, status,
                 referral_code, referred_by, is_email_verified,
                 created_at`,
      [
        email,
        passwordHash,
        firstName,
        lastName,
        phoneCode,
        phoneNumber,
        country || null,
        userStatus,
        !!emailVerified
      ]
    );

    const user = userResult.rows[0];

    // Automatically create wallet for this user
    try {
      await createWalletForUser(user.id);
    } catch (walletError) {
      console.error('Admin create user wallet error:', walletError.message);
    }

    // Optionally create a simple KYC record if kycVerified is true
    if (kycVerified) {
      try {
        await pool.query(
          `INSERT INTO kyc_verifications (user_id, status, reviewed_at)
           VALUES ($1, 'approved', NOW())
           ON CONFLICT DO NOTHING`,
          [user.id]
        );
      } catch (e) {
        console.error('Admin create user: KYC insert failed', e.message);
      }
    }

    const responseData = {
      ok: true,
      user: {
        id: user.id,
        clientId: user.id,
        email: user.email,
        name:
          [user.first_name, user.last_name]
            .filter(Boolean)
            .join(' ') || null,
        country: user.country,
        phone: phone || null,
        referralCode: user.referral_code,
        referredBy: user.referred_by,
        emailVerified: !!user.is_email_verified,
        status: user.status || 'active',
        createdAt: user.created_at
      }
    };

    res.status(201).json(responseData);

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'user_create',
        actionCategory: 'user_management',
        targetType: 'user',
        targetId: user.id,
        targetIdentifier: user.email,
        description: `Created user: ${user.email}`,
        req,
        res,
        beforeData: null,
        afterData: responseData.user
      });
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to create user'
    });
  }
});

/**
 * GET /api/admin/users/all
 * List users for admin panel (with optional filters: country, status, emailVerified, kycStatus)
 */
router.get('/users/all', authenticateAdmin, async (req, res, next) => {
  try {
    const { limit = 500, country, status, emailVerified, kycStatus } = req.query;

    const params = [];
    const conditions = [];
    let paramIndex = 1;

    // Build WHERE clause dynamically
    if (country) {
      params.push(String(country).toLowerCase());
      conditions.push(`LOWER(u.country) = $${paramIndex++}`);
    }

    // Filter by status from database
    if (status) {
      params.push(String(status).toLowerCase());
      conditions.push(`LOWER(COALESCE(u.status, 'active')) = $${paramIndex++}`);
    }

    if (emailVerified !== undefined) {
      // Handle both boolean and string values
      const isVerified = emailVerified === 'true' || emailVerified === true || emailVerified === '1' || emailVerified === 1;
      params.push(isVerified);
      conditions.push(`u.is_email_verified = $${paramIndex++}`);
    }

    // For KYC status, get the latest KYC record per user using a correlated subquery in SELECT
    // This ensures ALL users are included, even those without KYC records (kyc_status will be NULL)
    // We filter in memory for all KYC status filters to ensure we get all users first
    const kycSelect = `(
      SELECT status 
      FROM kyc_verifications 
      WHERE user_id = u.id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) AS kyc_status`;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone_code,
        u.phone_number,
        u.country,
        u.status,
        u.is_email_verified,
        u.created_at,
        ${kycSelect}
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex++}
    `;

    params.push(parseInt(limit));
    const result = await pool.query(query, params);

    let items = result.rows.map(row => {
      const nameParts = [];
      if (row.first_name) nameParts.push(row.first_name);
      if (row.last_name) nameParts.push(row.last_name);
      const name = nameParts.join(' ').trim();

      const phone =
        row.phone_code || row.phone_number
          ? `${row.phone_code || ''} ${row.phone_number || ''}`.trim()
          : null;

      const KYC = row.kyc_status
        ? {
          verificationStatus: row.kyc_status,
          isDocumentVerified: row.kyc_status === 'approved',
          isAddressVerified: row.kyc_status === 'approved'
        }
        : null;

      return {
        id: row.id,
        clientId: row.id, // simple client ID based on user id
        name: name || null,
        email: row.email,
        phone,
        country: row.country,
        role: 'user',
        status: row.status || 'active',
        emailVerified: !!row.is_email_verified,
        KYC,
        createdAt: row.created_at,
        lastLoginAt: null
      };
    });

    // Filter by KYC status in memory if needed
    if (kycStatus) {
      const kycStatusLower = String(kycStatus).toLowerCase();
      if (kycStatusLower === 'null' || kycStatusLower === 'none') {
        // Users with no KYC record at all
        items = items.filter(item => !item.KYC || !item.KYC.verificationStatus);
      } else if (kycStatusLower === 'unverified') {
        // Users with no KYC OR KYC that is not approved/verified
        // This includes: null, 'pending', 'rejected', or any other non-approved status
        items = items.filter(item => {
          if (!item.KYC || !item.KYC.verificationStatus) {
            // No KYC record - unverified
            return true;
          }
          const status = String(item.KYC.verificationStatus).toLowerCase();
          // Include if status is not 'approved' or 'verified'
          return status !== 'approved' && status !== 'verified';
        });
      } else if (kycStatusLower === 'pending') {
        // Users with pending KYC status OR users with no KYC (unverified)
        // This includes both pending and unverified users
        items = items.filter(item => {
          if (!item.KYC || !item.KYC.verificationStatus) {
            // No KYC record - include in pending (unverified)
            return true;
          }
          const status = String(item.KYC.verificationStatus).toLowerCase();
          // Include if status is 'pending' or not approved/verified
          return status === 'pending' || (status !== 'approved' && status !== 'verified');
        });
      }
    }

    res.json({
      ok: true,
      items
    });
  } catch (error) {
    console.error('Get admin users/all error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch users'
    });
  }
});

/**
 * GET /api/admin/users/with-balance
 * Get users who have trading accounts with balance > 0
 */
router.get('/users/with-balance', authenticateAdmin, async (req, res, next) => {
  try {
    const { limit = 500 } = req.query;

    // Get all users who have MT5 trading accounts
    const usersWithAccountsResult = await pool.query(
      `SELECT DISTINCT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone_code,
        u.phone_number,
        u.country,
        u.created_at
      FROM users u
      INNER JOIN trading_accounts ta ON ta.user_id = u.id
      WHERE ta.platform = 'MT5'
      ORDER BY u.created_at DESC
      LIMIT $1`,
      [parseInt(limit)]
    );

    if (usersWithAccountsResult.rows.length === 0) {
      return res.json({
        ok: true,
        items: []
      });
    }

    // Get all trading accounts for these users
    const userIds = usersWithAccountsResult.rows.map(u => u.id);
    const accountsResult = await pool.query(
      `SELECT user_id, account_number
       FROM trading_accounts
       WHERE user_id = ANY($1::int[]) AND platform = 'MT5'
       ORDER BY user_id, created_at DESC`,
      [userIds]
    );

    // Group accounts by user_id
    const accountsByUser = {};
    accountsResult.rows.forEach(acc => {
      if (!accountsByUser[acc.user_id]) {
        accountsByUser[acc.user_id] = [];
      }
      const accountId = acc.account_number;
      accountsByUser[acc.user_id].push({
        accountId: accountId,
        accountNumber: acc.account_number
      });
    });

    // Fetch balance for each account and sum per user
    const items = [];
    const { getClientProfile } = await import('../services/mt5.service.js');

    for (const userRow of usersWithAccountsResult.rows) {
      const userId = userRow.id;
      const accounts = accountsByUser[userId] || [];

      if (accounts.length === 0) continue;

      let totalBalance = 0;
      const mt5Accounts = [];

      // Fetch balance for each account
      for (const account of accounts) {
        try {
          const profileResult = await getClientProfile(account.accountId);
          if (profileResult.success && profileResult.data?.Success && profileResult.data?.Data) {
            const balance = parseFloat(profileResult.data.Data.Balance || 0);
            if (balance > 0) {
              totalBalance += balance;
              mt5Accounts.push({
                accountId: account.accountId,
                group: profileResult.data.Data.Group || null,
                createdAt: null // We don't have this in the response
              });
            }
          }
        } catch (error) {
          // Skip accounts that fail to fetch (might be deleted or invalid)
          console.error(`Failed to fetch balance for account ${account.accountId}:`, error.message);
        }
      }

      // Only include users with balance > 0
      if (totalBalance > 0) {
        const nameParts = [];
        if (userRow.first_name) nameParts.push(userRow.first_name);
        if (userRow.last_name) nameParts.push(userRow.last_name);
        const name = nameParts.join(' ').trim() || null;

        const phone =
          userRow.phone_code || userRow.phone_number
            ? `${userRow.phone_code || ''} ${userRow.phone_number || ''}`.trim()
            : null;

        items.push({
          id: userId,
          clientId: userId,
          name: name,
          email: userRow.email,
          phone: phone,
          country: userRow.country || null,
          totalBalance: totalBalance,
          MT5Account: mt5Accounts,
          createdAt: userRow.created_at
        });
      }
    }

    res.json({
      ok: true,
      items: items
    });
  } catch (error) {
    console.error('Get users with balance error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch users with balance'
    });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update basic user details from admin panel (name, phone, country, status)
 * Note: status is currently not persisted separately in DB; this route focuses on profile fields.
 */
router.patch('/users/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user id' });
    }

    const { name, phone, country, status } = req.body || {};

    // Split full name into first/last
    let firstName = null;
    let lastName = null;
    if (name && typeof name === 'string') {
      const parts = name.trim().split(/\s+/);
      firstName = parts[0] || null;
      lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
    }

    // Parse phone into phone_code + phone_number
    let phoneCode = null;
    let phoneNumber = null;
    if (phone && typeof phone === 'string') {
      const trimmed = phone.trim();
      const m = trimmed.match(/^\+?(\d+)\s*(.*)$/);
      if (m) {
        // Limit dial code to max 9 digits to stay within VARCHAR(10) including '+'
        const dialDigits = m[1].slice(0, 9);
        phoneCode = `+${dialDigits}`;
        const rest =
          m[2] && m[2].trim().length > 0
            ? m[2].trim()
            : trimmed.replace(/^\+?\d+/, '').trim();
        phoneNumber = rest || null;
      } else {
        phoneNumber = trimmed;
      }
    }

    // Build dynamic update
    const fields = [];
    const values = [];
    let idx = 1;

    if (firstName !== null) {
      fields.push(`first_name = $${idx++}`);
      values.push(firstName);
    }
    if (lastName !== null) {
      fields.push(`last_name = $${idx++}`);
      values.push(lastName);
    }
    if (phoneCode !== null || phoneNumber !== null) {
      fields.push(`phone_code = $${idx++}`);
      values.push(phoneCode);
      fields.push(`phone_number = $${idx++}`);
      values.push(phoneNumber);
    }
    if (country !== undefined) {
      fields.push(`country = $${idx++}`);
      values.push(country || null);
    }
    if (status !== undefined && ['active', 'banned', 'inactive'].includes(status)) {
      fields.push(`status = $${idx++}`);
      values.push(status);
    }

    if (!fields.length) {
      return res.json({ ok: true, message: 'Nothing to update' });
    }

    fields.push(`updated_at = NOW()`);

    values.push(userId);
    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING id, email, first_name, last_name, phone_code, phone_number, country, status, is_email_verified, created_at, updated_at
    `;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const row = result.rows[0];
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    const phoneOut =
      row.phone_code || row.phone_number
        ? `${row.phone_code || ''} ${row.phone_number || ''}`.trim()
        : null;

    // Get before data for logging
    const beforeResult = await pool.query(
      'SELECT id, email, first_name, last_name, phone_code, phone_number, country, status, is_email_verified FROM users WHERE id = $1',
      [userId]
    );
    const beforeData = beforeResult.rows[0] || null;

    const responseData = {
      ok: true,
      user: {
        id: row.id,
        name: fullName || null,
        email: row.email,
        status: row.status || 'active',
        phone: phoneOut,
        country: row.country,
        emailVerified: !!row.is_email_verified,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    };

    res.json(responseData);

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'user_update',
        actionCategory: 'user_management',
        targetType: 'user',
        targetId: row.id,
        targetIdentifier: row.email,
        description: `Updated user: ${row.email}`,
        req,
        res,
        beforeData,
        afterData: responseData.user
      });
    });
  } catch (error) {
    console.error('Admin PATCH /users/:id error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to update user'
    });
  }
});


/**
 * PATCH /api/admin/users/:id/email-verify
 * Toggle email verification status for a user
 */
router.patch('/users/:id/email-verify', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user id' });
    }

    const { verified } = req.body;
    if (typeof verified !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'verified must be a boolean' });
    }

    // Get before data
    const beforeResult = await pool.query(
      'SELECT id, email, is_email_verified FROM users WHERE id = $1',
      [userId]
    );
    const beforeData = beforeResult.rows[0] || null;

    // Update email verification status
    await pool.query(
      'UPDATE users SET is_email_verified = $1 WHERE id = $2',
      [verified, userId]
    );

    // Get after data
    const afterResult = await pool.query(
      'SELECT id, email, is_email_verified FROM users WHERE id = $1',
      [userId]
    );
    const afterData = afterResult.rows[0] || null;

    res.json({
      ok: true,
      message: `Email ${verified ? 'verified' : 'unverified'} successfully`
    });

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: verified ? 'user_verify' : 'user_unverify',
        actionCategory: 'user_management',
        targetType: 'user',
        targetId: userId,
        targetIdentifier: beforeData?.email,
        description: `${verified ? 'Verified' : 'Unverified'} email for user: ${beforeData?.email || userId}`,
        req,
        res,
        beforeData,
        afterData
      });
    });
  } catch (error) {
    console.error('Toggle email verification error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to update email verification'
    });
  }
});

/**
 * PATCH /api/admin/users/:id/kyc-verify
 * Toggle KYC verification status for a user
 */
router.patch('/users/:id/kyc-verify', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user id' });
    }

    const { verified } = req.body;
    if (typeof verified !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'verified must be a boolean' });
    }

    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Update or insert KYC verification
    if (verified) {
      // Set KYC as approved - use UPSERT to handle both insert and update
      // First check if a record exists
      const existingCheck = await pool.query(
        'SELECT id FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );

      if (existingCheck.rows.length > 0) {
        // Update existing record
        await pool.query(
          `UPDATE kyc_verifications 
           SET status = 'approved', reviewed_at = NOW()
           WHERE user_id = $1`,
          [userId]
        );
      } else {
        // Insert new record
        await pool.query(
          `INSERT INTO kyc_verifications (user_id, status, reviewed_at)
           VALUES ($1, 'approved', NOW())`,
          [userId]
        );
      }
    } else {
      // Set KYC as pending or remove approval
      // Check if record exists
      const existingCheck = await pool.query(
        'SELECT id FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );

      if (existingCheck.rows.length > 0) {
        // Update existing record to pending
        await pool.query(
          `UPDATE kyc_verifications 
         SET status = 'pending', reviewed_at = NULL
         WHERE user_id = $1`,
          [userId]
        );
      } else {
        // Insert new pending record
        await pool.query(
          `INSERT INTO kyc_verifications (user_id, status, reviewed_at)
           VALUES ($1, 'pending', NULL)`,
          [userId]
        );
      }
    }

    // Get user email and name for logging and email
    const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [userId]);
    const userEmail = userResult.rows[0]?.email || null;
    const userName = userResult.rows.length > 0
      ? `${userResult.rows[0].first_name || ''} ${userResult.rows[0].last_name || ''}`.trim() || 'Valued Customer'
      : 'Valued Customer';

    // Get before/after KYC data
    const kycBefore = await pool.query(
      'SELECT status FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    const beforeData = kycBefore.rows[0] || { status: null };

    const kycAfter = await pool.query(
      'SELECT status FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    const afterData = kycAfter.rows[0] || { status: verified ? 'approved' : 'pending' };

    res.json({
      ok: true,
      message: `KYC ${verified ? 'verified' : 'unverified'} successfully`
    });

    // Send KYC completion email if approved
    if (verified && userEmail) {
      setImmediate(async () => {
        try {
          await sendKYCCompletionEmail(userEmail, userName);
          console.log(`KYC completion email sent to ${userEmail}`);
        } catch (emailError) {
          console.error('Failed to send KYC completion email:', emailError);
        }
      });
    }

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: verified ? 'kyc_approve' : 'kyc_reject',
        actionCategory: 'kyc_management',
        targetType: 'user',
        targetId: userId,
        targetIdentifier: userEmail,
        description: `${verified ? 'Approved' : 'Rejected'} KYC for user: ${userEmail || userId}`,
        req,
        res,
        beforeData,
        afterData
      });
    });
  } catch (error) {
    console.error('Toggle KYC verification error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to update KYC verification'
    });
  }
});

/**
 * GET /api/admin/kyc
 * Get all KYC verifications with user information
 */
router.get('/kyc', authenticateAdmin, async (req, res, next) => {
  try {
    const { limit = 500 } = req.query;
    const limitNum = parseInt(limit, 10) || 500;

    const query = `
      SELECT 
        k.id,
        k.user_id as "userId",
        k.status as "verificationStatus",
        k.document_front_path as "documentReference",
        k.document_back_path as "addressReference",
        k.submitted_at as "documentSubmittedAt",
        k.submitted_at as "addressSubmittedAt",
        k.created_at as "createdAt",
        k.reviewed_at as "reviewedAt",
        u.id as "user_id",
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name,
        u.email,
        u.country
      FROM kyc_verifications k
      LEFT JOIN users u ON k.user_id = u.id
      ORDER BY k.created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limitNum]);

    const items = result.rows.map(row => ({
      id: row.id,
      userId: row.userId,
      User: {
        name: row.name?.trim() || '-',
        email: row.email || '-',
        country: row.country || '-'
      },
      isDocumentVerified: row.verificationStatus === 'approved',
      isAddressVerified: row.verificationStatus === 'approved',
      verificationStatus: (row.verificationStatus || 'pending').toLowerCase(),
      documentReference: row.documentReference || null,
      addressReference: row.addressReference || null,
      documentSubmittedAt: row.documentSubmittedAt || null,
      addressSubmittedAt: row.addressSubmittedAt || null,
      createdAt: row.createdAt || null
    }));

    res.json({
      ok: true,
      items
    });
  } catch (error) {
    console.error('Get KYC list error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch KYC verifications'
    });
  }
});

/**
 * PATCH /api/admin/kyc/:id
 * Update a KYC verification record
 */
router.patch('/kyc/:id', authenticateAdmin, async (req, res, next) => {
  try {
    let kycId = null;
    let userId = null;

    // Handle synthetic IDs like "no-kyc-19" where 19 is the user_id
    if (req.params.id.startsWith('no-kyc-')) {
      userId = parseInt(req.params.id.replace('no-kyc-', ''));
      if (Number.isNaN(userId)) {
        return res.status(400).json({ ok: false, error: 'Invalid user id in synthetic KYC id' });
      }

      // Check if user exists
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      // Check if KYC record already exists for this user
      const existingKyc = await pool.query(
        'SELECT id FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );

      if (existingKyc.rows.length > 0) {
        kycId = existingKyc.rows[0].id;
      } else {
        // Create a new KYC record for this user
        // Use the status from the request if provided, otherwise default to 'pending'
        const initialStatus = req.body.verificationStatus
          ? String(req.body.verificationStatus).toLowerCase()
          : 'pending';

        // Validate status
        if (!['pending', 'approved', 'rejected'].includes(initialStatus)) {
          return res.status(400).json({
            ok: false,
            error: 'verificationStatus must be one of: pending, approved, rejected'
          });
        }

        // Set reviewed_at if status is approved or rejected
        const shouldSetReviewedAt = (initialStatus === 'approved' || initialStatus === 'rejected');

        const createResult = await pool.query(
          shouldSetReviewedAt
            ? `INSERT INTO kyc_verifications (user_id, status, submitted_at, reviewed_at, created_at, updated_at)
               VALUES ($1, $2, NOW(), NOW(), NOW(), NOW())
               RETURNING id`
            : `INSERT INTO kyc_verifications (user_id, status, submitted_at, reviewed_at, created_at, updated_at)
               VALUES ($1, $2, NOW(), NULL, NOW(), NOW())
               RETURNING id`,
          [userId, initialStatus]
        );
        kycId = createResult.rows[0].id;
      }
    } else {
      kycId = parseInt(req.params.id);
      if (Number.isNaN(kycId)) {
        return res.status(400).json({ ok: false, error: 'Invalid KYC id' });
      }

      // Check if KYC record exists
      const kycCheck = await pool.query('SELECT id FROM kyc_verifications WHERE id = $1', [kycId]);
      if (kycCheck.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'KYC record not found' });
      }
    }

    const {
      verificationStatus,
      documentReference,
      addressReference
    } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (verificationStatus !== undefined) {
      // Normalize status to lowercase
      const normalizedStatus = String(verificationStatus).toLowerCase();
      if (!['pending', 'approved', 'rejected'].includes(normalizedStatus)) {
        return res.status(400).json({
          ok: false,
          error: 'verificationStatus must be one of: pending, approved, rejected (case insensitive)'
        });
      }
      updates.push(`status = $${paramIndex++}`);
      values.push(normalizedStatus);

      // Set reviewed_at if status is approved or rejected
      if (normalizedStatus === 'approved' || normalizedStatus === 'rejected') {
        updates.push(`reviewed_at = NOW()`);
      } else {
        updates.push(`reviewed_at = NULL`);
      }
    }

    if (documentReference !== undefined) {
      updates.push(`document_front_path = $${paramIndex++}`);
      values.push(documentReference);
    }

    if (addressReference !== undefined) {
      updates.push(`document_back_path = $${paramIndex++}`);
      values.push(addressReference);
    }

    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: 'No fields to update' });
    }

    values.push(kycId);
    const updateQuery = `
      UPDATE kyc_verifications 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, status, document_front_path, document_back_path, reviewed_at
    `;

    const result = await pool.query(updateQuery, values);

    res.json({
      ok: true,
      message: 'KYC record updated successfully',
      data: {
        id: result.rows[0].id,
        verificationStatus: result.rows[0].status,
        documentReference: result.rows[0].document_front_path,
        addressReference: result.rows[0].document_back_path,
        reviewedAt: result.rows[0].reviewed_at
      }
    });
  } catch (error) {
    console.error('Update KYC error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to update KYC record'
    });
  }
});

/**
 * POST /api/admin/uploads
 * Upload KYC documents (document and/or address proof)
 */
router.post('/uploads', authenticateAdmin, kycUpload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'address', maxCount: 1 }
]), async (req, res, next) => {
  try {
    const files = req.files || {};
    const baseUrl = getBaseUrl();
    const fileUrls = {};

    if (files.document && files.document[0]) {
      fileUrls.document = `${baseUrl}/uploads/kyc/${files.document[0].filename}`;
    }

    if (files.address && files.address[0]) {
      fileUrls.address = `${baseUrl}/uploads/kyc/${files.address[0].filename}`;
    }

    if (Object.keys(fileUrls).length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No files uploaded'
      });
    }

    res.json({
      ok: true,
      message: 'Files uploaded successfully',
      files: fileUrls
    });
  } catch (error) {
    console.error('Upload KYC documents error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to upload files'
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user and all related data (cascade deletes)
 * Only allowed if user has 0 funds (wallet balance = 0 and all trading account balances = 0)
 */
router.delete('/users/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user id' });
    }

    // Check if user exists
    const userCheck = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Check wallet balance
    const walletCheck = await pool.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId]
    );

    let walletBalance = 0;
    if (walletCheck.rows.length > 0) {
      walletBalance = parseFloat(walletCheck.rows[0].balance || 0);
    }

    // Check trading account balances (MT5 accounts)
    const accountsCheck = await pool.query(
      `SELECT 
        COALESCE(SUM(balance), 0) as total_balance,
        COALESCE(SUM(equity), 0) as total_equity,
        COALESCE(SUM(credit), 0) as total_credit
       FROM trading_accounts 
       WHERE user_id = $1 AND platform = 'MT5'`,
      [userId]
    );

    const totalBalance = parseFloat(accountsCheck.rows[0]?.total_balance || 0);
    const totalEquity = parseFloat(accountsCheck.rows[0]?.total_equity || 0);
    const totalCredit = parseFloat(accountsCheck.rows[0]?.total_credit || 0);

    // Calculate total funds
    const totalFunds = walletBalance + totalBalance + totalEquity + totalCredit;

    // Only allow deletion if total funds are 0
    if (totalFunds > 0) {
      return res.status(400).json({
        ok: false,
        error: `Cannot delete user with funds. User has: Wallet: $${walletBalance.toFixed(2)}, Trading Accounts: $${(totalBalance + totalEquity + totalCredit).toFixed(2)}. Total: $${totalFunds.toFixed(2)}. Please ensure all funds are withdrawn before deleting.`
      });
    }

    // Delete user (CASCADE will handle related records: trading_accounts, kyc_verifications, etc.)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({
      ok: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to delete user'
    });
  }
});

/**
 * GET /api/admin/users/:id
 * Detailed user view for admin (profile, KYC, MT5 accounts, simple totals)
 */
router.get('/users/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user id' });
    }

    // Basic user info
    const userResult = await pool.query(
      `SELECT id, email, first_name, last_name, phone_code, phone_number, country, is_email_verified, created_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const u = userResult.rows[0];

    // KYC (latest record, if any) - fail-safe if table is missing
    let KYC = null;
    try {
      const kycResult = await pool.query(
        `SELECT status
         FROM kyc_verifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );

      const kycRow = kycResult.rows[0];
      KYC = kycRow
        ? {
          verificationStatus: kycRow.status,
          isDocumentVerified: kycRow.status === 'approved',
          isAddressVerified: kycRow.status === 'approved'
        }
        : null;
    } catch (kycError) {
      console.error('KYC lookup failed for admin users/:id:', kycError.message);
      KYC = null;
    }

    // Wallet balance
    let walletBalance = 0;
    try {
      const walletResult = await pool.query(
        'SELECT balance FROM wallets WHERE user_id = $1',
        [userId]
      );
      if (walletResult.rows.length > 0) {
        walletBalance = parseFloat(walletResult.rows[0].balance || 0);
      }
    } catch (walletError) {
      console.error('Wallet lookup failed for admin users/:id:', walletError.message);
      walletBalance = 0;
    }

    // MT5 accounts for this user - fail-safe if trading_accounts is missing
    let MT5Account = [];
    try {
      const mt5Result = await pool.query(
        // Use trading_accounts.account_number as the MT5 account/login.
        // Include balance, equity, credit, and account_status for filtering
        `SELECT account_number, account_type, balance, equity, credit, account_status, created_at
         FROM trading_accounts
         WHERE user_id = $1 AND platform = 'MT5'
         ORDER BY created_at DESC`,
        [userId]
      );

      MT5Account = mt5Result.rows.map(row => ({
        // Admin panel should use the trading account number as MT5 login
        accountId: row.account_number || null,
        group: row.account_type || null,
        balance: parseFloat(row.balance || 0),
        equity: parseFloat(row.equity || 0),
        credit: parseFloat(row.credit || 0),
        accountStatus: row.account_status || 'active',
        createdAt: row.created_at
      }));
    } catch (mt5Error) {
      console.error('MT5 accounts lookup failed for admin users/:id:', mt5Error.message);
      MT5Account = [];
    }

    const nameParts = [];
    if (u.first_name) nameParts.push(u.first_name);
    if (u.last_name) nameParts.push(u.last_name);
    const name = nameParts.join(' ').trim() || null;

    const phone =
      u.phone_code || u.phone_number
        ? `${u.phone_code || ''} ${u.phone_number || ''}`.trim()
        : null;

    const userPayload = {
      id: u.id,
      email: u.email,
      name,
      phone,
      country: u.country,
      emailVerified: !!u.is_email_verified,
      createdAt: u.created_at,
      lastLoginAt: null, // no user login log table in this schema
      KYC,
      MT5Account,
      walletBalance
    };

    // Simple totals (no deposits/withdrawals tables in this schema yet)
    const totals = {
      deposits: { amount: 0, count: 0 },
      withdrawals: { amount: 0, count: 0 }
    };

    res.json({
      ok: true,
      user: userPayload,
      totals
    });
  } catch (error) {
    console.error('Get admin user detail error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch user'
    });
  }
});

/**
 * GET /api/admin/users/:id/logins
 * Placeholder login activity list for user (no user login log table yet)
 */
router.get('/users/:id/logins', authenticateAdmin, async (req, res, next) => {
  try {
    // When/if you add a user_login_log table, query it here.
    res.json({
      items: []
    });
  } catch (error) {
    console.error('Get user logins error:', error);
    res.status(500).json({
      items: []
    });
  }
});

/**
 * GET /api/admin/users/:id/allowed-groups
 * Get all MT5 groups a specific user is allowed to select
 */
router.get('/users/:id/allowed-groups', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = req.params.id;

    // Step 1: Check if user has a commission chain (referral restriction)
    const ibRequestRes = await pool.query(
      `SELECT commission_chain, ib_level, ib_type FROM ib_requests WHERE user_id = $1 AND status = 'approved'`,
      [userId]
    );

    const request = ibRequestRes.rows[0];
    let restrictedGroups = null;

    if (request?.commission_chain) {
      const { commission_chain, ib_level, ib_type } = request;
      restrictedGroups = Object.entries(commission_chain)
        .filter(([groupId, rates]) => {
          if (!Array.isArray(rates)) return false;

          if (ib_type === 'sub_ib') {
            // Sub-IBs see groups they have a rate for
            return rates[ib_level - 1] > 0;
          } else if (ib_type === 'trader') {
            // Traders see groups their parent (IB) has access to
            // If Trader is L2, Parent is L1 (index 0)
            return rates[ib_level - 2] > 0;
          }
          return false;
        })
        .map(([groupId]) => groupId);
    }

    // Step 2: Build and execute the main query
    const result = await pool.query(
      `SELECT 
        mg.id, 
        mg.group_name, 
        COALESCE(mg.dedicated_name, gcd.display_name, regexp_replace(mg.group_name, '^.*\\\\', '')) as dedicated_name, 
        mg.currency, 
        mg.demo_leverage, 
        mg.margin_call, 
        mg.margin_stop_out, 
        mg.trade_flags, 
        mg.server, 
        mg.company, 
        mg.created_at
       FROM mt5_groups mg
       LEFT JOIN group_commission_distribution gcd ON mg.group_name = gcd.group_path
       WHERE mg.is_active = TRUE
         AND (
           -- Demo Groups: Show if active in mt5_groups
           (LOWER(mg.group_name) LIKE '%demo%')
           OR
           -- Real Groups: Enforce commission distribution and availability rules
           (
             LOWER(mg.group_name) NOT LIKE '%demo%'
             AND gcd.is_active = TRUE
             AND (
               ($2::text[] IS NOT NULL AND mg.id::text = ANY($2::text[]))
               OR
               ($2::text[] IS NULL AND (
                 gcd.availability = 'All Users' OR
                 (gcd.availability = 'Selected Users' AND EXISTS (
                   SELECT 1 FROM group_commission_users gcu 
                   WHERE gcu.distribution_id = gcd.id AND gcu.user_id = $1
                 ))
               ))
             )
           )
         )
       ORDER BY dedicated_name ASC, mg.group_name ASC`,
      [userId, restrictedGroups]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Admin Get MT5 allowed groups error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch allowed MT5 groups',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/users/:id/accounts/create
 * Admin endpoint to create MT5 account for a user (bypasses portal password check)
 */
router.post('/users/:id/accounts/create', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id'
      });
    }

    const {
      mt5GroupId,
      leverage,
      masterPassword,
      isDemo
    } = req.body;

    // Validation
    if (!mt5GroupId || !leverage || !masterPassword) {
      return res.status(400).json({
        success: false,
        message: 'MT5 group, leverage, and master password are required'
      });
    }

    // Get user details
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name, phone_code, phone_number, country FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Get MT5 group details
    const groupResult = await pool.query(
      'SELECT id, group_name, dedicated_name, currency FROM mt5_groups WHERE id = $1 AND is_active = TRUE',
      [mt5GroupId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or inactive MT5 group selected'
      });
    }

    const mt5Group = groupResult.rows[0];
    let groupName = mt5Group.group_name;
    if (groupName) {
      groupName = groupName.replace(/\\+/g, '\\');
    }
    const currency = mt5Group.currency || 'USD';

    // Use leverage from form
    const finalLeverage = parseInt(leverage);

    // Generate passwords
    const mainPassword = generateRandomPassword(12);
    const investorDigits = Math.floor(100 + Math.random() * 900);
    const investorPassword = `SolitaireINV@${investorDigits}`;

    // Prepare user data
    const accountName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'New Client Account';
    const phone = user.phone_code && user.phone_number
      ? `${user.phone_code}-${user.phone_number}`
      : user.phone_number || '';
    const country = user.country || '';

    // Prepare MT5 account creation data
    const accountData = {
      name: accountName,
      group: groupName,
      leverage: finalLeverage,
      masterPassword: masterPassword,
      investorPassword: investorPassword,
      email: user.email,
      country: country,
      city: '',
      phone: phone,
      comment: 'Created by admin'
    };

    // Call MT5 Manager API
    let mt5Response;
    try {
      const result = await mt5Service.createAccount(accountData);
      mt5Response = result.data;
      console.log('MT5 account created successfully by admin:', JSON.stringify(mt5Response, null, 2));
    } catch (apiError) {
      console.error('MT5 API error:', apiError);
      return res.status(500).json({
        success: false,
        message: apiError.message || 'Failed to create account via MT5 API. Please try again later.'
      });
    }

    // Extract account number (login) from MT5 response
    const findLogin = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const [key, value] of Object.entries(obj)) {
        const k = key.toLowerCase();
        if (['login', 'account', 'accountid', 'loginid'].includes(k) && value) {
          return value;
        }
        if (value && typeof value === 'object') {
          const nested = findLogin(value);
          if (nested) return nested;
        }
      }
      return null;
    };

    let mt5Login =
      mt5Response.account ||
      mt5Response.accountNumber ||
      mt5Response.login ||
      mt5Response.Login ||
      findLogin(mt5Response) ||
      null;

    let accountNumber;
    if (mt5Login) {
      accountNumber = String(mt5Login);
    } else {
      const accountNumberResult = await pool.query(
        'SELECT generate_account_number() as account_number'
      );
      accountNumber = accountNumberResult.rows[0].account_number;
      console.warn('MT5 API did not include a login; using internal account number', {
        accountNumber,
        rawResponse: mt5Response
      });
    }

    // Encrypt passwords before storing
    const encryptedMasterPassword = encryptPassword(masterPassword);
    const encryptedMainPassword = encryptPassword(mainPassword);
    const encryptedInvestorPassword = encryptPassword(investorPassword);

    // Determine trading server
    const tradingServer = isDemo ? 'Solitaire Markets-Demo' : 'Solitaire Markets-Live';

    // Determine account type
    const accountType = mt5Group.dedicated_name || mt5Group.group_name || 'standard';

    // Discover existing columns
    const colsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'trading_accounts'`
    );
    const existingCols = new Set(colsRes.rows.map((r) => r.column_name));

    const insertFields = [];
    const insertValues = [];
    const addField = (col, value) => {
      if (existingCols.has(col)) {
        insertFields.push(col);
        insertValues.push(value);
      }
    };

    addField('user_id', userId);
    addField('account_number', accountNumber);
    addField('platform', 'MT5');
    addField('account_type', accountType);
    addField('currency', currency);
    addField('is_swap_free', false);
    addField('is_copy_account', false);
    addField('leverage', finalLeverage);
    addField('reason_for_account', 'Created by admin');
    addField('trading_server', tradingServer);
    addField('mt5_group_id', mt5GroupId);
    addField('mt5_group_name', groupName);
    addField('name', accountName);
    addField('master_password', encryptedMasterPassword);
    addField('password', encryptedMainPassword);
    addField('email', user.email);
    addField('country', country);
    addField('city', '');
    addField('phone', phone);
    addField('comment', 'Created by admin');
    addField('investor_password', encryptedInvestorPassword);
    addField('is_demo', !!isDemo);

    const placeholders = insertFields.map((_, idx) => `$${idx + 1}`).join(', ');

    // Insert account
    const insertResult = await pool.query(
      `INSERT INTO trading_accounts (${insertFields.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      insertValues
    );

    // If Demo account, auto-deposit 10,000
    if (isDemo && mt5Login) {
      try {
        const depositAmount = 10000;
        await mt5Service.addBalance(mt5Login, depositAmount, 'Demo Account Opening Bonus');
        await pool.query(
          'UPDATE trading_accounts SET balance = $1, equity = $1 WHERE account_number = $2',
          [depositAmount, accountNumber]
        );
      } catch (depError) {
        console.error('Failed to add demo deposit:', depError);
      }
    }

    const newId = insertResult.rows[0].id;

    // Fetch the new account
    const selectCols = [
      'id',
      'account_number',
      'platform',
      'account_type',
      'currency',
      'leverage',
      'trading_server',
      'created_at',
      'is_demo'
    ];
    if (existingCols.has('mt5_group_name')) {
      selectCols.push('mt5_group_name');
    }

    // Send MT5 account created email
    setImmediate(async () => {
      try {
        const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Valued Customer';
        await sendMT5AccountCreatedEmail(
          user.email,
          userName,
          accountType,
          accountNumber, // This is the login (MT5 account number)
          masterPassword // Master password for MT5 login
        );
        console.log(`MT5 account created email sent to ${user.email} (admin created)`);
      } catch (emailError) {
        console.error('Failed to send MT5 account created email:', emailError);
      }
    });

    const accountResult = await pool.query(
      `SELECT ${selectCols.join(', ')} FROM trading_accounts WHERE id = $1`,
      [newId]
    );

    res.json({
      success: true,
      message: 'Account created successfully',
      data: {
        ...accountResult.rows[0],
        mt5Response: mt5Login
      }
    });
  } catch (error) {
    console.error('Admin create account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create account'
    });
  }
});

/**
 * PATCH /api/admin/users/:id/password
 * Admin endpoint to change user's CRM password
 */
router.patch('/users/:id/password', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid user id'
      });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        ok: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'User not found'
      });
    }

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // Update password in database
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (admin_id, action, details, created_at)
       VALUES ($1, 'USER_PASSWORD_CHANGE', $2, NOW())`,
      [
        req.admin.id,
        JSON.stringify({
          userId: userId,
          userEmail: userResult.rows[0].email
        })
      ]
    ).catch(err => console.error('Failed to log activity:', err));

    res.json({
      ok: true,
      message: 'User password updated successfully'
    });
  } catch (error) {
    console.error('Change user password error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to change user password'
    });
  }
});

/**
 * POST /api/admin/users/:id/login-as
 * Admin endpoint to login as a user (impersonation)
 */
router.post('/users/:id/login-as', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id'
      });
    }

    // Get user details
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name, country, referral_code, referred_by FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Generate JWT token for the user (same as regular login)
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      success: true,
      message: 'Login as user successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          country: user.country,
          referralCode: user.referral_code,
          referredBy: user.referred_by
        }
      }
    });
  } catch (error) {
    console.error('Admin login as user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to login as user'
    });
  }
});

/**
 * GET /api/admin/payment-details
 * Get all payment details for admin review
 */
router.get('/payment-details', authenticateAdmin, async (req, res, next) => {
  try {
    const { status, limit = 1000 } = req.query;

    let query = `
      SELECT 
        pd.id,
        pd.user_id,
        pd.payment_method,
        pd.payment_details,
        pd.status,
        pd.reviewed_by,
        pd.reviewed_at,
        pd.rejection_reason,
        pd.created_at,
        pd.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_code,
        u.phone_number
      FROM payment_details pd
      INNER JOIN users u ON pd.user_id = u.id
    `;
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` WHERE pd.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY pd.created_at DESC LIMIT $${paramIndex++}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    const items = result.rows.map(row => {
      const nameParts = [];
      if (row.first_name) nameParts.push(row.first_name);
      if (row.last_name) nameParts.push(row.last_name);
      const name = nameParts.join(' ').trim() || null;

      const phone = row.phone_code || row.phone_number
        ? `${row.phone_code || ''} ${row.phone_number || ''}`.trim()
        : null;

      // Parse payment_details JSONB
      let paymentDetails = row.payment_details;
      if (typeof paymentDetails === 'string') {
        try {
          paymentDetails = JSON.parse(paymentDetails);
        } catch (e) {
          console.error('Error parsing payment_details:', e);
          paymentDetails = {};
        }
      }

      return {
        id: row.id,
        userId: row.user_id,
        user: {
          id: row.user_id,
          name,
          email: row.email,
          phone
        },
        paymentMethod: row.payment_method,
        paymentDetails,
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    // Separate pending and approved
    const pending = items.filter(item => item.status === 'pending');
    const approved = items.filter(item => item.status === 'approved');
    const rejected = items.filter(item => item.status === 'rejected');

    res.json({
      ok: true,
      items,
      pending,
      approved,
      rejected
    });
  } catch (error) {
    console.error('Get admin payment details error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch payment details'
    });
  }
});

/**
 * PATCH /api/admin/payment-details/:id/approve
 * Approve a payment detail
 */
router.patch('/payment-details/:id/approve', authenticateAdmin, async (req, res, next) => {
  try {
    const paymentDetailId = parseInt(req.params.id);
    const adminId = req.admin.id;

    if (isNaN(paymentDetailId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid payment detail ID'
      });
    }

    // Check if payment detail exists
    const check = await pool.query(
      'SELECT id, status FROM payment_details WHERE id = $1',
      [paymentDetailId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Payment detail not found'
      });
    }

    // Update status to approved
    await pool.query(
      `UPDATE payment_details 
       SET status = 'approved', 
           reviewed_by = $1, 
           reviewed_at = NOW(),
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [adminId, paymentDetailId]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (admin_id, action, details, created_at)
       VALUES ($1, 'PAYMENT_DETAIL_APPROVED', $2, NOW())`,
      [adminId, JSON.stringify({ paymentDetailId })]
    ).catch(err => console.error('Failed to log activity:', err));

    res.json({
      ok: true,
      message: 'Payment detail approved successfully'
    });
  } catch (error) {
    console.error('Approve payment detail error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to approve payment detail'
    });
  }
});

/**
 * PATCH /api/admin/payment-details/:id/reject
 * Reject a payment detail
 */
router.patch('/payment-details/:id/reject', authenticateAdmin, async (req, res, next) => {
  try {
    const paymentDetailId = parseInt(req.params.id);
    const adminId = req.admin.id;
    const { reason } = req.body;

    if (isNaN(paymentDetailId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid payment detail ID'
      });
    }

    // Check if payment detail exists
    const check = await pool.query(
      'SELECT id, status FROM payment_details WHERE id = $1',
      [paymentDetailId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Payment detail not found'
      });
    }

    // Update status to rejected
    await pool.query(
      `UPDATE payment_details 
       SET status = 'rejected', 
           reviewed_by = $1, 
           reviewed_at = NOW(),
           rejection_reason = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [adminId, reason || null, paymentDetailId]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (admin_id, action, details, created_at)
       VALUES ($1, 'PAYMENT_DETAIL_REJECTED', $2, NOW())`,
      [adminId, JSON.stringify({ paymentDetailId, reason: reason || null })]
    ).catch(err => console.error('Failed to log activity:', err));

    res.json({
      ok: true,
      message: 'Payment detail rejected successfully'
    });
  } catch (error) {
    console.error('Reject payment detail error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to reject payment detail'
    });
  }
});

/**
 * PATCH /api/admin/payment-details/:id/unapprove
 * Unapprove a payment detail (set back to pending)
 */
router.patch('/payment-details/:id/unapprove', authenticateAdmin, async (req, res, next) => {
  try {
    const paymentDetailId = parseInt(req.params.id);
    const adminId = req.admin.id;

    if (isNaN(paymentDetailId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid payment detail ID'
      });
    }

    // Check if payment detail exists
    const check = await pool.query(
      'SELECT id, status FROM payment_details WHERE id = $1',
      [paymentDetailId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Payment detail not found'
      });
    }

    // Update status to pending
    await pool.query(
      `UPDATE payment_details 
       SET status = 'pending', 
           reviewed_by = NULL, 
           reviewed_at = NULL,
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [paymentDetailId]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (admin_id, action, details, created_at)
       VALUES ($1, 'PAYMENT_DETAIL_UNAPPROVED', $2, NOW())`,
      [adminId, JSON.stringify({ paymentDetailId })]
    ).catch(err => console.error('Failed to log activity:', err));

    res.json({
      ok: true,
      message: 'Payment detail unapproved successfully'
    });
  } catch (error) {
    console.error('Unapprove payment detail error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to unapprove payment detail'
    });
  }
});

/**
 * GET /api/admin/users/:id/payment-methods
 * Placeholder payment methods list for user
 */
router.get(
  '/users/:id/payment-methods',
  authenticateAdmin,
  async (req, res, next) => {
    try {
      // When/if you add a payment_methods table, query it here.
      res.json({
        paymentMethods: []
      });
    } catch (error) {
      console.error('Get user payment methods error:', error);
      res.status(500).json({
        paymentMethods: []
      });
    }
  }
);

/**
 * ============================================
 * MT5 Admin Routes
 * ============================================
 */

/**
 * GET /api/admin/mt5/users
 * Get all MT5 trading accounts from trading_accounts table
 * Returns accounts grouped by user
 */
router.get('/mt5/users', authenticateAdmin, async (req, res, next) => {
  try {
    const { limit = 500, country } = req.query;

    // Check which optional columns exist
    let hasMt5GroupName = false;
    try {
      const colCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' 
        AND column_name = 'mt5_group_name'
      `);
      hasMt5GroupName = colCheck.rows.length > 0;
    } catch (e) {
      // If check fails, assume column doesn't exist
      hasMt5GroupName = false;
    }

    // Get all trading accounts with user info
    const apiAccountField = 'ta.account_number as account_number';

    const mt5GroupField = hasMt5GroupName
      ? 'ta.mt5_group_name'
      : 'NULL as mt5_group_name';

    let query = `
      SELECT 
        ta.id,
        ta.account_number,
        ${apiAccountField},
        ta.platform,
        ta.account_type,
        ta.currency,
        ta.leverage,
        ta.account_status,
        ta.balance,
        ta.equity,
        ta.credit,
        ta.free_margin,
        ta.margin,
        ta.is_demo,
        ta.trading_server,
        ${mt5GroupField},
        ta.created_at as account_created_at,
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone_code,
        u.phone_number,
        u.country,
        u.created_at as user_created_at
      FROM trading_accounts ta
      INNER JOIN users u ON ta.user_id = u.id
      WHERE ta.platform = 'MT5'
    `;
    const params = [];
    let paramCount = 1;

    if (country) {
      query += ` AND LOWER(u.country) = $${paramCount}`;
      params.push(String(country).toLowerCase());
      paramCount++;
    }

    query += ` ORDER BY ta.created_at DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    // Group accounts by user
    const usersMap = {};
    result.rows.forEach(row => {
      const userId = row.user_id;
      if (!usersMap[userId]) {
        const nameParts = [];
        if (row.first_name) nameParts.push(row.first_name);
        if (row.last_name) nameParts.push(row.last_name);
        const name = nameParts.join(' ').trim() || null;

        const phone =
          row.phone_code || row.phone_number
            ? `${row.phone_code || ''} ${row.phone_number || ''}`.trim()
            : null;

        usersMap[userId] = {
          id: userId,
          name: name,
          email: row.email,
          phone: phone,
          country: row.country || null,
          totalBalance: 0, // Will be calculated from accounts
          createdAt: row.user_created_at,
          MT5Account: []
        };
      }

      // Calculate balance (use equity if available, otherwise balance)
      const accountBalance = parseFloat(row.equity || row.balance || 0);

      // Add to total balance (only for non-demo accounts)
      if (!row.is_demo) {
        usersMap[userId].totalBalance += accountBalance;
      }

      // Add account to user's MT5Account array
      const accountId = row.account_number;
      usersMap[userId].MT5Account.push({
        accountId: accountId,
        accountNumber: row.account_number,
        group: row.mt5_group_name || null,
        balance: accountBalance,
        equity: parseFloat(row.equity || 0),
        credit: parseFloat(row.credit || 0),
        margin: parseFloat(row.margin || 0),
        freeMargin: parseFloat(row.free_margin || 0),
        leverage: row.leverage || 2000,
        currency: row.currency || 'USD',
        isDemo: row.is_demo || false,
        tradingServer: row.trading_server || null,
        accountStatus: row.account_status || 'active',
        createdAt: row.account_created_at
      });
    });

    const items = Object.values(usersMap);

    res.json({
      ok: true,
      items: items
    });
  } catch (error) {
    console.error('Get MT5 users error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch MT5 users'
    });
  }
});

/**
 * ============================================
 * MT5 Group Management (Admin)
 * ============================================
 */

/**
 * GET /api/admin/group-management
 * List MT5 groups from mt5_groups table
 * Optional query: is_active=true|false
 */
router.get('/group-management', authenticateAdmin, async (req, res, next) => {
  try {
    const { is_active } = req.query;
    const params = [];
    let whereParts = [];

    if (typeof is_active === 'string' && is_active !== '') {
      params.push(is_active === 'true');
      whereParts.push(`is_active = $${params.length}`);
    }

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    const query = `
      SELECT
        id,
        group_name AS "group",
        dedicated_name,
        server,
        company,
        currency,
        currency_digits,
        margin_call,
        margin_stop_out,
        demo_leverage,
        demo_deposit,
        margin_mode,
        trade_flags,
        permissions_flags,
        auth_mode,
        auth_password_min,
        company_email,
        company_support_email,
        company_page,
        company_support_page,
        reports_mode,
        news_mode,
        mail_mode,
        trade_interestrate,
        trade_virtual_credit,
        limit_history,
        limit_orders,
        limit_symbols,
        limit_positions,
        minimum_deposit,
        maximum_deposit,
        minimum_withdrawal,
        maximum_withdrawal,
        is_active,
        updated_at AS synced_at,
        created_at
      FROM mt5_groups
      ${whereClause}
      ORDER BY dedicated_name NULLS LAST, group_name ASC
    `;

    const result = await pool.query(query, params);

    res.json({
      ok: true,
      items: result.rows
    });
  } catch (error) {
    console.error('Get mt5_groups error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch MT5 groups'
    });
  }
});

/**
 * POST /api/admin/group-management/sync
 * Sync groups from MT5 API into mt5_groups table
 *
 * Important: we do NOT use a single transaction here.
 * If one row fails, we still want other groups to be saved.
 */
router.post(
  '/group-management/sync',
  authenticateAdmin,
  async (req, res, next) => {
    try {
      // Load existing mt5_groups columns so we only insert into columns that exist
      const colsRes = await pool.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'mt5_groups'
        `
      );
      const existingCols = new Set(colsRes.rows.map((r) => r.column_name));

      const mt5 = await mt5Service.getGroups();
      const raw = mt5?.data;
      const list = Array.isArray(raw?.Data)
        ? raw.Data
        : Array.isArray(raw)
          ? raw
          : [];

      let created = 0;
      let updated = 0;
      let errors = 0;

      for (const g of list) {
        try {
          const groupName =
            g.Group ||
            g.group_name ||
            g.group ||
            g.Name ||
            null;
          if (!groupName) {
            errors++;
            continue;
          }

          const currency = g.Currency || g.currency || 'USD';
          const marginCall =
            g.MarginCall ??
            g.margin_call ??
            100;
          const marginStopOut =
            g.MarginStopOut ??
            g.margin_stop_out ??
            30;
          const demoLeverage =
            g.DemoLeverage ??
            g.demo_leverage ??
            0;
          const demoDeposit =
            g.DemoDeposit ??
            g.demo_deposit ??
            0;

          // Build INSERT dynamically based on existing columns
          const insertFields = [];
          const insertValues = [];

          const addField = (col, value) => {
            if (existingCols.has(col)) {
              insertFields.push(col);
              insertValues.push(value);
            }
          };

          addField('group_name', groupName);
          addField('dedicated_name', null);
          addField('server', g.Server || g.server || 1);
          addField('permissions_flags', g.PermissionsFlags || g.permissions_flags || 0);
          addField('auth_mode', g.AuthMode || g.auth_mode || 0);
          addField('auth_password_min', g.AuthPasswordMin || g.auth_password_min || 8);
          addField('company', g.Company || g.company || null);
          addField('company_page', g.CompanyPage || g.company_page || null);
          addField('company_email', g.CompanyEmail || g.company_email || null);
          addField(
            'company_support_page',
            g.CompanySupportPage || g.company_support_page || null
          );
          addField(
            'company_support_email',
            g.CompanySupportEmail || g.company_support_email || null
          );
          addField('company_catalog', g.CompanyCatalog || g.company_catalog || null);
          addField('currency', currency);
          addField('currency_digits', g.CurrencyDigits || g.currency_digits || 2);
          addField('reports_mode', g.ReportsMode || g.reports_mode || 0);
          addField('reports_flags', g.ReportsFlags || g.reports_flags || 0);
          addField('reports_smtp', g.ReportsSmtp || g.reports_smtp || null);
          addField(
            'reports_smtp_login',
            g.ReportsSmtpLogin || g.reports_smtp_login || null
          );
          addField('news_mode', g.NewsMode || g.news_mode || 2);
          addField('news_category', g.NewsCategory || g.news_category || null);
          addField('mail_mode', g.MailMode || g.mail_mode || 1);
          addField('trade_flags', g.TradeFlags || g.trade_flags || 0);
          addField(
            'trade_interestrate',
            g.TradeInterestrate || g.trade_interestrate || 0
          );
          addField(
            'trade_virtual_credit',
            g.TradeVirtualCredit || g.trade_virtual_credit || 0
          );
          addField('margin_free_mode', g.MarginFreeMode || g.margin_free_mode || 1);
          addField('margin_so_mode', g.MarginSoMode || g.margin_so_mode || 0);
          addField('margin_call', marginCall);
          addField('margin_stop_out', marginStopOut);
          addField('demo_leverage', demoLeverage);
          addField('demo_deposit', demoDeposit);
          addField('limit_history', g.LimitHistory || g.limit_history || 0);
          addField('limit_orders', g.LimitOrders || g.limit_orders || 0);
          addField('limit_symbols', g.LimitSymbols || g.limit_symbols || 0);
          addField('limit_positions', g.LimitPositions || g.limit_positions || 0);
          addField('margin_mode', g.MarginMode || g.margin_mode || 0);
          addField('margin_flags', g.MarginFlags || g.margin_flags || 0);
          addField(
            'trade_transfer_mode',
            g.TradeTransferMode || g.trade_transfer_mode || 0
          );
          addField('is_active', true);

          const placeholders = insertFields
            .map((_, idx) => `$${idx + 1}`)
            .join(', ');

          // Only update a safe subset of columns on conflict if they exist
          const updatableCols = ['currency', 'margin_call', 'margin_stop_out'].filter(
            (c) => existingCols.has(c)
          );

          let conflictClause = 'DO NOTHING';
          if (updatableCols.length > 0) {
            const assignments = updatableCols
              .map((c) => `${c} = EXCLUDED.${c}`)
              .join(', ');
            conflictClause = `DO UPDATE SET ${assignments}, updated_at = NOW()`;
          }

          const result = await pool.query(
            `INSERT INTO mt5_groups (${insertFields.join(', ')})
             VALUES (${placeholders})
             ON CONFLICT (group_name) ${conflictClause}
             RETURNING id, (xmax = 0) AS inserted`,
            insertValues
          );

          if (result.rows[0]?.inserted) {
            created++;
          } else {
            updated++;
          }
        } catch (e) {
          console.error('Error upserting mt5_group:', e);
          errors++;
        }
      }

      res.json({
        ok: true,
        stats: {
          created,
          updated,
          errors,
          total: list.length
        }
      });
    } catch (error) {
      console.error('Sync mt5_groups error:', error);
      res.status(500).json({
        ok: false,
        error: error.message || 'Failed to sync groups from MT5 API'
      });
    }
  }
);

/**
 * PUT /api/admin/group-management/:id/toggle-active
 * Toggle is_active flag for a group
 */
router.put(
  '/group-management/:id/toggle-active',
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ ok: false, error: 'Invalid id' });
      }

      const { is_active } = req.body;
      const activeFlag = !!is_active;

      const result = await pool.query(
        `UPDATE mt5_groups
         SET is_active = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id`,
        [activeFlag, id]
      );

      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ ok: false, error: 'Group not found' });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Toggle mt5_group active error:', error);
      res.status(500).json({
        ok: false,
        error: error.message || 'Failed to update group status'
      });
    }
  }
);

/**
 * PUT /api/admin/group-management/:id/limits
 * Update deposit and withdrawal limits for a group
 */
router.put(
  '/group-management/:id/limits',
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ ok: false, error: 'Invalid group id' });
      }

      const {
        minimum_deposit,
        maximum_deposit,
        minimum_withdrawal,
        maximum_withdrawal
      } = req.body;

      // Validate all values are non-negative
      if (minimum_deposit !== undefined && minimum_deposit < 0) {
        return res.status(400).json({ ok: false, error: 'Minimum deposit must be >= 0' });
      }
      if (maximum_deposit !== undefined && maximum_deposit !== null && maximum_deposit < 0) {
        return res.status(400).json({ ok: false, error: 'Maximum deposit must be >= 0' });
      }
      if (minimum_withdrawal !== undefined && minimum_withdrawal < 0) {
        return res.status(400).json({ ok: false, error: 'Minimum withdrawal must be >= 0' });
      }
      if (maximum_withdrawal !== undefined && maximum_withdrawal !== null && maximum_withdrawal < 0) {
        return res.status(400).json({ ok: false, error: 'Maximum withdrawal must be >= 0' });
      }

      // Validate min < max (when max is not null)
      if (minimum_deposit !== undefined && maximum_deposit !== undefined && maximum_deposit !== null) {
        if (minimum_deposit > maximum_deposit) {
          return res.status(400).json({ ok: false, error: 'Minimum deposit must be <= maximum deposit' });
        }
      }
      if (minimum_withdrawal !== undefined && maximum_withdrawal !== undefined && maximum_withdrawal !== null) {
        if (minimum_withdrawal > maximum_withdrawal) {
          return res.status(400).json({ ok: false, error: 'Minimum withdrawal must be <= maximum withdrawal' });
        }
      }

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (minimum_deposit !== undefined) {
        updates.push(`minimum_deposit = $${paramIndex++}`);
        values.push(minimum_deposit);
      }
      if (maximum_deposit !== undefined) {
        updates.push(`maximum_deposit = $${paramIndex++}`);
        values.push(maximum_deposit);
      }
      if (minimum_withdrawal !== undefined) {
        updates.push(`minimum_withdrawal = $${paramIndex++}`);
        values.push(minimum_withdrawal);
      }
      if (maximum_withdrawal !== undefined) {
        updates.push(`maximum_withdrawal = $${paramIndex++}`);
        values.push(maximum_withdrawal);
      }

      if (updates.length === 0) {
        return res.status(400).json({ ok: false, error: 'No limit fields to update' });
      }

      values.push(id);
      const updateQuery = `
        UPDATE mt5_groups
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING id, minimum_deposit, maximum_deposit, minimum_withdrawal, maximum_withdrawal
      `;

      const result = await pool.query(updateQuery, values);

      if (result.rowCount === 0) {
        return res.status(404).json({ ok: false, error: 'Group not found' });
      }

      // Log activity
      await pool.query(
        `INSERT INTO activity_logs (admin_id, action, details, created_at)
         VALUES ($1, 'GROUP_LIMITS_UPDATE', $2, NOW())`,
        [req.admin.id, JSON.stringify({ groupId: id, limits: result.rows[0] })]
      ).catch(err => console.error('Failed to log activity:', err));

      res.json({
        ok: true,
        message: 'Group limits updated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Update group limits error:', error);
      res.status(500).json({
        ok: false,
        error: error.message || 'Failed to update group limits'
      });
    }
  }
);

/**
 * PUT /api/admin/group-management/:id/dedicated-name
 * Update dedicated_name for a group
 */
router.put(
  '/group-management/:id/dedicated-name',
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ ok: false, error: 'Invalid id' });
      }

      const { dedicated_name } = req.body;

      const result = await pool.query(
        `UPDATE mt5_groups
         SET dedicated_name = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id`,
        [dedicated_name || null, id]
      );

      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ ok: false, error: 'Group not found' });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Update mt5_group dedicated_name error:', error);
      res.status(500).json({
        ok: false,
        error:
          error.message || 'Failed to update group dedicated name'
      });
    }
  }
);

/**
 * POST /api/admin/group-management/:id/report
 * Generate a comprehensive report for a specific MT5 group
 */
router.post(
  '/group-management/:id/report',
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ ok: false, error: 'Invalid group id' });
      }

      // Get group info
      const groupResult = await pool.query(
        'SELECT id, group_name, dedicated_name FROM mt5_groups WHERE id = $1',
        [id]
      );

      if (groupResult.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Group not found' });
      }

      const group = groupResult.rows[0];
      const groupName = group.group_name || group.dedicated_name || 'Unknown';

      // Build WHERE clause - try multiple column combinations
      // Use a safe approach that tries the most common column first
      let accountsResult;
      let userIds = [];
      let totalUsers = 0;
      let usersWithBalance = 0;
      let usersWithoutBalance = 0;
      let usersInProfit = 0;
      let usersInLoss = 0;

      // Try different column combinations until one works
      const queryAttempts = [
        {
          query: `SELECT DISTINCT ta.user_id, u.id, u.email, u.first_name, u.last_name
                  FROM trading_accounts ta
                  JOIN users u ON ta.user_id = u.id
                  WHERE ta.mt5_group_id = $1 AND ta.platform = 'MT5'`,
          params: [id]
        },
        {
          query: `SELECT DISTINCT ta.user_id, u.id, u.email, u.first_name, u.last_name
                  FROM trading_accounts ta
                  JOIN users u ON ta.user_id = u.id
                  WHERE ta.mt5_group_name = $1 AND ta.platform = 'MT5'`,
          params: [group.group_name]
        },
        {
          query: `SELECT DISTINCT ta.user_id, u.id, u.email, u.first_name, u.last_name
                  FROM trading_accounts ta
                  JOIN users u ON ta.user_id = u.id
                  WHERE ta."group" = $1 AND ta.platform = 'MT5'`,
          params: [group.group_name]
        }
      ];

      let successfulQuery = null;
      for (const attempt of queryAttempts) {
        try {
          accountsResult = await pool.query(attempt.query, attempt.params);
          successfulQuery = attempt;
          break;
        } catch (queryError) {
          // Continue to next attempt
          continue;
        }
      }

      if (!successfulQuery) {
        // No working query found - return empty report
        return res.json({
          ok: true,
          data: {
            groupId: id,
            groupName: groupName,
            totalUsers: 0,
            usersWithBalance: 0,
            usersWithoutBalance: 0,
            usersInProfit: 0,
            usersInLoss: 0,
            totalDeposit: 0,
            totalWithdrawal: 0,
            allClientsDeposit: 0,
            allClientsWithdrawal: 0,
            allClientsPnL: 0,
            generatedAt: new Date().toISOString()
          }
        });
      }

      userIds = accountsResult.rows.map(r => r.user_id);
      totalUsers = userIds.length;

      // Use the same WHERE pattern for subsequent queries
      const baseWhere = successfulQuery.query.includes('mt5_group_id')
        ? 'ta.mt5_group_id = $1'
        : successfulQuery.query.includes('mt5_group_name')
          ? 'ta.mt5_group_name = $1'
          : 'ta."group" = $1';
      const baseParams = successfulQuery.params;


      // Get users with balance > 0
      try {
        const usersWithBalanceResult = await pool.query(
          `SELECT DISTINCT ta.user_id
           FROM trading_accounts ta
           WHERE ${baseWhere}
           AND ta.platform = 'MT5'
           AND (COALESCE(ta.balance, 0) > 0 OR COALESCE(ta.equity, 0) > 0)`,
          baseParams
        );
        usersWithBalance = usersWithBalanceResult.rows.length;
        usersWithoutBalance = totalUsers - usersWithBalance;
      } catch (e) {
        console.error('Error fetching users with balance:', e);
      }

      // Get users in profit (equity > balance + credit)
      try {
        const usersInProfitResult = await pool.query(
          `SELECT DISTINCT ta.user_id
           FROM trading_accounts ta
           WHERE ${baseWhere}
           AND ta.platform = 'MT5'
           AND COALESCE(ta.equity, 0) > (COALESCE(ta.balance, 0) + COALESCE(ta.credit, 0))`,
          baseParams
        );
        usersInProfit = usersInProfitResult.rows.length;
      } catch (e) {
        console.error('Error fetching users in profit:', e);
      }

      // Get users in loss (equity < balance + credit)
      try {
        const usersInLossResult = await pool.query(
          `SELECT DISTINCT ta.user_id
           FROM trading_accounts ta
           WHERE ${baseWhere}
           AND ta.platform = 'MT5'
           AND COALESCE(ta.equity, 0) < (COALESCE(ta.balance, 0) + COALESCE(ta.credit, 0))`,
          baseParams
        );
        usersInLoss = usersInLossResult.rows.length;
      } catch (e) {
        console.error('Error fetching users in loss:', e);
      }

      // Get total deposits for this group
      let totalDeposit = 0;
      if (userIds.length > 0) {
        try {
          const depositsResult = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as total
             FROM deposit_requests
             WHERE status = 'approved'
             AND user_id = ANY($1::int[])`,
            [userIds]
          );
          totalDeposit = parseFloat(depositsResult.rows[0]?.total || 0);
        } catch (e) {
          console.error('Error fetching deposits:', e);
        }
      }

      // Get total withdrawals for this group
      let totalWithdrawal = 0;
      if (userIds.length > 0) {
        try {
          const withdrawalsResult = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as total
             FROM withdrawals
             WHERE status = 'approved'
             AND user_id = ANY($1::int[])`,
            [userIds]
          );
          totalWithdrawal = parseFloat(withdrawalsResult.rows[0]?.total || 0);
        } catch (e) {
          console.error('Error fetching withdrawals:', e);
        }
      }

      // Get all clients overall deposit (all users, not just this group)
      let allClientsDeposit = 0;
      try {
        const allDepositsResult = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) as total
           FROM deposit_requests
           WHERE status = 'approved'`
        );
        allClientsDeposit = parseFloat(allDepositsResult.rows[0]?.total || 0);
      } catch (e) {
        console.error('Error fetching all clients deposits:', e);
      }

      // Get all clients overall withdrawal
      let allClientsWithdrawal = 0;
      try {
        const allWithdrawalsResult = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) as total
           FROM withdrawals
           WHERE status = 'approved'`
        );
        allClientsWithdrawal = parseFloat(allWithdrawalsResult.rows[0]?.total || 0);
      } catch (e) {
        console.error('Error fetching all clients withdrawals:', e);
      }

      // Calculate overall P&L (Profit and Loss) - difference between equity and (balance + credit) for all accounts
      let allClientsPnL = 0;
      try {
        const pnlResult = await pool.query(
          `SELECT 
            COALESCE(SUM(ta.equity - (COALESCE(ta.balance, 0) + COALESCE(ta.credit, 0))), 0) as total_pnl
           FROM trading_accounts ta
           WHERE ta.platform = 'MT5'`
        );
        allClientsPnL = parseFloat(pnlResult.rows[0]?.total_pnl || 0);
      } catch (e) {
        console.error('Error calculating P&L:', e);
      }

      const report = {
        groupId: id,
        groupName: groupName,
        totalUsers,
        usersWithBalance,
        usersWithoutBalance,
        usersInProfit,
        usersInLoss,
        totalDeposit,
        totalWithdrawal,
        allClientsDeposit,
        allClientsWithdrawal,
        allClientsPnL,
        generatedAt: new Date().toISOString()
      };

      res.json({
        ok: true,
        data: report
      });
    } catch (error) {
      console.error('Generate group report error:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint
      });
      res.status(500).json({
        ok: false,
        error: error.message || 'Failed to generate group report',
        details: process.env.NODE_ENV === 'development' ? {
          code: error.code,
          detail: error.detail,
          hint: error.hint
        } : undefined
      });
    }
  }
);

/**
 * GET /api/admin/mt5/groups
 * Get all MT5 groups from MT5 API
 */
router.get('/mt5/groups', authenticateAdmin, async (req, res) => {
  try {
    // Fetch groups from MT5 API
    const result = await mt5Service.getGroups();

    if (!result.success || !result.data) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch groups from MT5'
      });
    }

    // Transform MT5 groups data to match expected format
    const groups = Array.isArray(result.data) ? result.data.map(group => ({
      id: group.Group || group.name,
      name: group.Group || group.name,
      status: 'active' // All groups from MT5 are considered active
    })) : [];

    res.json({
      ok: true,
      groups: groups
    });
  } catch (error) {
    console.error('Get MT5 groups error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch MT5 groups'
    });
  }
});

/**
 * GET /api/admin/mt5/account/:accountId
 * Get MT5 account details from MT5 API
 */
router.get('/mt5/account/:accountId', authenticateAdmin, async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const login = parseInt(accountId);

    if (isNaN(login)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid account ID'
      });
    }

    // Fetch account info from MT5 API
    const result = await mt5Service.getClientProfile(login);

    if (!result.success || !result.data) {
      return res.status(404).json({
        ok: false,
        error: 'Account not found in MT5'
      });
    }

    // Return MT5 account data
    res.json({
      ok: true,
      account: result.data
    });
  } catch (error) {
    console.error('Get MT5 account error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch account info from MT5'
    });
  }
});

/**
 * PUT /api/admin/mt5/account/:accountId
 * Update MT5 account (leverage, group, etc.)
 */
router.put('/mt5/account/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { leverage, group } = req.body;
    const login = parseInt(accountId);

    if (isNaN(login)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid account ID'
      });
    }

    // Prepare update data
    const updateData = {};
    if (leverage !== undefined) {
      updateData.leverage = parseInt(leverage);
    }
    if (group !== undefined) {
      updateData.group = group;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No update data provided'
      });
    }

    // Update MT5 account via MT5 service
    const result = await mt5Service.updateUser(login, updateData);

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to update MT5 account'
      });
    }

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (admin_id, action, details, created_at)
       VALUES ($1, 'MT5_UPDATE', $2, NOW())`,
      [
        req.admin.id,
        JSON.stringify({
          accountId: login,
          updates: updateData
        })
      ]
    ).catch(err => console.error('Failed to log activity:', err));

    res.json({
      ok: true,
      message: 'MT5 account updated successfully',
      data: result.data
    });
  } catch (error) {
    console.error('Update MT5 account error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to update MT5 account'
    });
  }
});

/**
 * PATCH /api/admin/mt5/account/:accountId/status
 * Update MT5 account status in database
 */
router.patch('/mt5/account/:accountId/status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { account_status } = req.body;

    if (!account_status || !['active', 'inactive', 'suspended'].includes(account_status)) {
      return res.status(400).json({
        success: false,
        error: 'Valid account_status (active, inactive, suspended) is required'
      });
    }

    // Try updating by account_number first (most common)
    let result = await pool.query(
      'UPDATE trading_accounts SET account_status = $1, updated_at = NOW() WHERE account_number = $2 RETURNING account_number, account_status, user_id',
      [account_status, accountId]
    );

    // If not found by account_number, try by id
    if (result.rows.length === 0) {
      result = await pool.query(
        'UPDATE trading_accounts SET account_status = $1, updated_at = NOW() WHERE id = $2 RETURNING account_number, account_status, user_id',
        [account_status, accountId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    console.log(`Account ${accountId} status updated to ${account_status} in database`);

    res.json({
      success: true,
      message: 'Account status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update account status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update account status'
    });
  }
});

/**
 * PUT /api/admin/mt5/account/:accountId/password
 * Change MT5 account password (updates MT5 API first, then database)
 */
router.put('/mt5/account/:accountId/password', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { newPassword } = req.body;
    const login = parseInt(accountId);

    if (isNaN(login)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid account ID'
      });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        ok: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    // Step 1: Update password in MT5 API first using the correct endpoint
    // PUT /Security/users/{login}/password/change?passwordType=main
    let mt5Result;
    try {
      console.log(`[MT5 Password Change] Attempting to change password for account ${login}`);
      mt5Result = await mt5Service.changePassword(login, newPassword, 'master');

      // Check if the API call was successful
      if (!mt5Result || !mt5Result.success) {
        const errorMsg = mt5Result?.error || mt5Result?.message || 'Failed to update password in MT5 API';
        console.error(`[MT5 Password Change] API call failed:`, errorMsg);
        throw new Error(errorMsg);
      }

      console.log(`[MT5 Password Change] Successfully changed password in MT5 for account ${login}`);
    } catch (mt5Error) {
      console.error('[MT5 Password Change] MT5 API error:', {
        accountId: login,
        error: mt5Error.message,
        stack: mt5Error.stack
      });
      // Return error without updating database
      return res.status(500).json({
        ok: false,
        error: mt5Error.message || 'Failed to update password in MT5. Please check the password and try again.'
      });
    }

    // Step 2: Only update database if MT5 API call succeeded
    try {
      const { encryptPassword } = await import('../utils/helpers.js');
      const encryptedPassword = encryptPassword(newPassword);

      // Update master_password in trading_accounts
      await pool.query(
        `UPDATE trading_accounts 
         SET master_password = $1, updated_at = NOW()
         WHERE account_number = $2`,
        [encryptedPassword, accountId.toString()]
      );

      // Log activity
      await pool.query(
        `INSERT INTO activity_logs (admin_id, action, details, created_at)
         VALUES ($1, 'MT5_PASSWORD_CHANGE', $2, NOW())`,
        [
          req.admin.id,
          JSON.stringify({
            accountId: login
          })
        ]
      ).catch(err => console.error('Failed to log activity:', err));

      res.json({
        ok: true,
        message: 'MT5 password updated successfully in both MT5 and database'
      });
    } catch (dbError) {
      console.error('Database update error after MT5 success:', dbError);
      // Even if DB update fails, password was changed in MT5, so we should inform admin
      res.status(500).json({
        ok: false,
        error: 'Password changed in MT5 but failed to update database. Please contact support.',
        warning: true
      });
    }
  } catch (error) {
    console.error('Change MT5 password error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to change MT5 password'
    });
  }
});

/**
 * GET /api/admin/mt5/proxy/:accountId/getClientProfile
 * Proxy request to get MT5 client profile
 */
router.get('/mt5/proxy/:accountId/getClientProfile', authenticateAdmin, async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const login = parseInt(accountId);

    if (isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account ID'
      });
    }

    const result = await mt5Service.getClientProfile(login);

    res.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('Get MT5 client profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get client profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/mt5/proxy/:accountId/getClientBalance
 * Proxy request to get MT5 client balance (all balances info for a login)
 */
router.get('/mt5/proxy/:accountId/getClientBalance', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    const login = parseInt(accountId);

    if (isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account ID'
      });
    }

    const result = await mt5Service.getClientBalance(login);

    res.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('Get MT5 client balance error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get client balance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/mt5/deposit
 * Add balance to MT5 account
 */
router.post('/mt5/deposit', authenticateAdmin, async (req, res, next) => {
  try {
    const { mt5_login, amount, comment } = req.body;

    if (!mt5_login || !amount) {
      return res.status(400).json({
        success: false,
        message: 'MT5 login and amount are required'
      });
    }

    const login = parseInt(mt5_login);
    if (isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MT5 login'
      });
    }

    const balance = parseFloat(amount);
    if (isNaN(balance) || balance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    const result = await mt5Service.addBalance(
      login,
      balance,
      comment || `Deposit by admin ${req.admin.email}`
    );

    res.json({
      success: true,
      message: 'Deposit successful',
      data: result.data
    });
  } catch (error) {
    console.error('MT5 deposit error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process deposit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/mt5/withdraw
 * Deduct balance from MT5 account
 */
router.post('/mt5/withdraw', authenticateAdmin, async (req, res, next) => {
  try {
    const { mt5_login, amount, comment } = req.body;

    if (!mt5_login || !amount) {
      return res.status(400).json({
        success: false,
        message: 'MT5 login and amount are required'
      });
    }

    const login = parseInt(mt5_login);
    if (isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MT5 login'
      });
    }

    const balance = parseFloat(amount);
    if (isNaN(balance) || balance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    const result = await mt5Service.deductBalance(
      login,
      balance,
      comment || `Withdrawal by admin ${req.admin.email}`
    );

    res.json({
      success: true,
      message: 'Withdrawal successful',
      data: result.data
    });
  } catch (error) {
    console.error('MT5 withdraw error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process withdrawal',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/mt5/account/:accountId/enable
 * Enable MT5 account
 */
router.post('/mt5/account/:accountId/enable', authenticateAdmin, async (req, res, next) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required'
      });
    }

    const login = parseInt(accountId);
    if (isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account ID'
      });
    }

    const result = await mt5Service.enableAccount(login);

    res.json({
      success: true,
      message: 'Account enabled successfully',
      data: result.data
    });
  } catch (error) {
    console.error('MT5 enable account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to enable account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/mt5/account/:accountId/disable
 * Disable MT5 account
 */
router.post('/mt5/account/:accountId/disable', authenticateAdmin, async (req, res, next) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required'
      });
    }

    const login = parseInt(accountId);
    if (isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account ID'
      });
    }

    const result = await mt5Service.disableAccount(login);

    res.json({
      success: true,
      message: 'Account disabled successfully',
      data: result.data
    });
  } catch (error) {
    console.error('MT5 disable account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to disable account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/mt5/credit
 * Add credit/bonus to MT5 account (alias for deposit)
 */
router.post('/mt5/credit', authenticateAdmin, async (req, res, next) => {
  try {
    const { mt5_login, amount, currency, status, comment, operation_type } = req.body;

    if (!mt5_login || !amount) {
      return res.status(400).json({
        success: false,
        message: 'MT5 login and amount are required'
      });
    }

    const login = parseInt(mt5_login);
    if (isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MT5 login'
      });
    }

    const balance = parseFloat(amount);
    if (isNaN(balance) || balance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    const result = await mt5Service.addBalance(
      login,
      balance,
      comment || `Credit by admin ${req.admin.email}`
    );

    res.json({
      success: true,
      message: 'Credit added successfully',
      data: result.data
    });
  } catch (error) {
    console.error('MT5 credit error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add credit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/mt5/credit/deduct
 * Deduct credit/bonus from MT5 account (alias for withdraw)
 */
router.post('/mt5/credit/deduct', authenticateAdmin, async (req, res, next) => {
  try {
    const { mt5_login, amount, currency, status, comment, operation_type } = req.body;

    if (!mt5_login || !amount) {
      return res.status(400).json({
        success: false,
        message: 'MT5 login and amount are required'
      });
    }

    const login = parseInt(mt5_login);
    if (isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MT5 login'
      });
    }

    const balance = parseFloat(amount);
    if (isNaN(balance) || balance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    const result = await mt5Service.deductBalance(
      login,
      balance,
      comment || `Credit deduction by admin ${req.admin.email}`
    );

    res.json({
      success: true,
      message: 'Credit deducted successfully',
      data: result.data
    });
  } catch (error) {
    console.error('MT5 credit deduct error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to deduct credit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/mt5/balance-history
 * Get balance history (placeholder - implement based on your needs)
 */
router.get('/mt5/balance-history', authenticateAdmin, async (req, res, next) => {
  try {
    const { operation_type, limit = 500 } = req.query;

    // This is a placeholder - implement based on your transaction history table
    // For now, return empty array
    res.json({
      success: true,
      items: [],
      total: 0
    });
  } catch (error) {
    console.error('Get MT5 balance history error:', error);
    next(error);
  }
});

/**
 * POST /api/admin/mt5/assign
 * Assign MT5 account to user
 */
router.post('/mt5/assign', authenticateAdmin, async (req, res, next) => {
  try {
    const { userId, accountId, password, name, leverage, package: packageName } = req.body;

    if (!userId || !accountId || !password) {
      return res.status(400).json({
        ok: false,
        error: 'User ID, Account ID, and password are required'
      });
    }

    // Verify user exists
    const userResult = await pool.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Check if this MT5 account is already assigned to another user
    const existingAssignment = await pool.query(
      'SELECT id, user_id FROM trading_accounts WHERE account_number = $1',
      [accountId.toString()]
    );

    if (existingAssignment.rows.length > 0 && existingAssignment.rows[0].user_id !== userId) {
      return res.status(409).json({
        ok: false,
        error: 'This MT5 account is already assigned to another user'
      });
    }

    // Update MT5 account password using MT5 service
    try {
      await mt5Service.changePassword(parseInt(accountId), password);
    } catch (error) {
      console.error('Failed to update MT5 password detailing:', error);
      // We log but continue, or you could choose to fail hard if password update is critical
      // For now, fail hard as requested "new password should also be set"
      return res.status(500).json({
        ok: false,
        error: 'Failed to update MT5 account password: ' + (error.message || 'Unknown error')
      });
    }

    // Insert or update trading account in database
    let tradingAccount;
    try {
      if (existingAssignment.rows.length === 0) {
        // Create new trading account record
        // Schema check revealed: No 'package' column. 'account_type' can store group/package.
        // Added 'master_password' and 'name' as they exist in schema.
        const insertResult = await pool.query(
          `INSERT INTO trading_accounts (
            user_id, account_number, platform, account_type, currency,
            leverage, account_status, trading_server, master_password, name, created_at
          ) VALUES ($1, $2, 'MT5', $3, 'USD', $4, 'active', 'Solitaire Markets-Live', $5, $6, NOW())
          RETURNING *`,
          [
            userId,
            accountId.toString(),
            packageName || 'standard', // Store group/package in account_type
            leverage || 100,
            password,
            name || ''
          ]
        );
        tradingAccount = insertResult.rows[0];
      } else {
        // Update existing trading account
        const updateResult = await pool.query(
          `UPDATE trading_accounts 
           SET user_id = $1, leverage = $2, account_type = $3, master_password = $4, name = $5, updated_at = NOW()
           WHERE account_number = $6
           RETURNING *`,
          [
            userId,
            leverage || 100,
            packageName || 'standard',
            password,
            name || '',
            accountId.toString()
          ]
        );
        tradingAccount = updateResult.rows[0];
      }
    } catch (dbError) {
      console.error('Database error during assignment:', dbError);
      return res.status(500).json({
        ok: false,
        error: 'Database error: ' + dbError.message
      });
    }

    // Log the assignment (Non-blocking)
    pool.query(
      `INSERT INTO activity_logs (admin_id, action, details, created_at)
       VALUES ($1, 'MT5_ASSIGN', $2, NOW())`,
      [
        req.admin.id,
        JSON.stringify({
          accountId,
          userId,
          userEmail: user.email,
          leverage,
          package: packageName
        })
      ]
    ).catch(err => console.error('Failed to log activity (non-fatal):', err));

    const responseData = {
      ok: true,
      message: 'MT5 account assigned successfully',
      account: tradingAccount
    };

    res.json(responseData);

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'mt5_account_assign',
        actionCategory: 'mt5_management',
        targetType: 'mt5_account',
        targetId: parseInt(accountId),
        targetIdentifier: accountId.toString(),
        description: `Assigned MT5 account ${accountId} to user: ${user.email}`,
        req,
        res,
        beforeData: existingAssignment.rows[0] || null,
        afterData: tradingAccount
      });
    });
  } catch (error) {
    console.error('Assign MT5 account error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to assign MT5 account'
    });
  }
});

/**
 * PUT /api/admin/mt5/user/:login
 * Update MT5 user profile
 */
router.put('/mt5/user/:login', authenticateAdmin, async (req, res, next) => {
  try {
    const { login } = req.params;
    const updateData = req.body;

    const loginNum = parseInt(login);
    if (isNaN(loginNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid login number'
      });
    }

    const result = await mt5Service.updateUser(loginNum, updateData);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: result.data
    });
  } catch (error) {
    console.error('Update MT5 user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUT /api/admin/mt5/user/:login/password
 * Change MT5 user password
 */
router.put('/mt5/user/:login/password', authenticateAdmin, async (req, res, next) => {
  try {
    const { login } = req.params;
    const { newPassword, passwordType = 'main' } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password is required'
      });
    }

    const loginNum = parseInt(login);
    if (isNaN(loginNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid login number'
      });
    }

    const result = await mt5Service.changePassword(loginNum, newPassword, passwordType);

    res.json({
      success: true,
      message: 'Password changed successfully',
      data: result.data
    });
  } catch (error) {
    console.error('Change MT5 password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to change password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/activity-logs
 * Get all activity logs (account openings, user registrations, etc.)
 */
router.get('/activity-logs', authenticateAdmin, async (req, res, next) => {
  try {
    const { limit = 500 } = req.query;

    const items = [];

    // 1. Get account openings from trading_accounts
    try {
      const accountsResult = await pool.query(
        `SELECT 
          ta.id,
          ta.account_number,
          ta.account_number as account_number,
          ta.platform,
          ta.account_type,
          ta.account_status,
          ta.created_at,
          u.id as user_id,
          u.email,
          u.first_name,
          u.last_name
        FROM trading_accounts ta
        INNER JOIN users u ON ta.user_id = u.id
        WHERE ta.platform = 'MT5'
        ORDER BY ta.created_at DESC
        LIMIT $1`,
        [parseInt(limit)]
      );

      accountsResult.rows.forEach(row => {
        const nameParts = [];
        if (row.first_name) nameParts.push(row.first_name);
        if (row.last_name) nameParts.push(row.last_name);
        const name = nameParts.join(' ').trim() || row.email;

        items.push({
          id: `account-${row.id}`,
          type: 'Account',
          time: row.created_at,
          user: name,
          email: row.email,
          accountId: row.account_number,
          amount: null,
          status: row.account_status === 'active' ? 'Opened' : row.account_status,
          details: `${row.platform} ${row.account_type} account`
        });
      });
    } catch (e) {
      console.error('Error fetching account activities:', e.message);
    }

    // 2. Get user registrations from users table
    try {
      const usersResult = await pool.query(
        `SELECT id, email, first_name, last_name, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT $1`,
        [parseInt(limit)]
      );

      usersResult.rows.forEach(row => {
        const nameParts = [];
        if (row.first_name) nameParts.push(row.first_name);
        if (row.last_name) nameParts.push(row.last_name);
        const name = nameParts.join(' ').trim() || row.email;

        items.push({
          id: `user-${row.id}`,
          type: 'Registration',
          time: row.created_at,
          user: name,
          email: row.email,
          accountId: null,
          amount: null,
          status: 'Active',
          details: 'User registered'
        });
      });
    } catch (e) {
      console.error('Error fetching user registrations:', e.message);
    }
    // 3. Get deposits from deposit_requests
    try {
      const depositsResult = await pool.query(
        `SELECT 
          dr.id,
          dr.amount,
          dr.status,
          dr.created_at,
          dr.mt5_account_id,
          dr.cregis_order_id,
          u.email,
          u.first_name,
          u.last_name
        FROM deposit_requests dr
        INNER JOIN users u ON dr.user_id = u.id
        ORDER BY dr.created_at DESC
        LIMIT $1`,
        [parseInt(limit)]
      );

      depositsResult.rows.forEach(row => {
        const nameParts = [];
        if (row.first_name) nameParts.push(row.first_name);
        if (row.last_name) nameParts.push(row.last_name);
        const name = nameParts.join(' ').trim() || row.email;

        items.push({
          id: `deposit-${row.id}`,
          type: 'Deposit',
          time: row.created_at,
          user: name,
          email: row.email,
          accountId: row.mt5_account_id,
          amount: row.amount,
          status: row.status.charAt(0).toUpperCase() + row.status.slice(1),
          details: row.cregis_order_id || 'Manual Deposit'
        });
      });
    } catch (e) {
      console.error('Error fetching deposit activities:', e.message);
    }

    // 4. Get withdrawals from withdrawals
    try {
      const withdrawalsResult = await pool.query(
        `SELECT 
          w.id,
          w.amount,
          w.status,
          w.created_at,
          w.mt5_account_id,
          w.external_transaction_id,
          u.email,
          u.first_name,
          u.last_name
        FROM withdrawals w
        INNER JOIN users u ON w.user_id = u.id
        ORDER BY w.created_at DESC
        LIMIT $1`,
        [parseInt(limit)]
      );

      withdrawalsResult.rows.forEach(row => {
        const nameParts = [];
        if (row.first_name) nameParts.push(row.first_name);
        if (row.last_name) nameParts.push(row.last_name);
        const name = nameParts.join(' ').trim() || row.email;

        items.push({
          id: `withdrawal-${row.id}`,
          type: 'Withdrawal',
          time: row.created_at,
          user: name,
          email: row.email,
          accountId: row.mt5_account_id,
          amount: row.amount,
          status: row.status.charAt(0).toUpperCase() + row.status.slice(1),
          details: row.external_transaction_id || 'Manual Withdrawal'
        });
      });
    } catch (e) {
      console.error('Error fetching withdrawal activities:', e.message);
    }

    // Sort all items by time (newest first)
    items.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Limit to requested limit
    const limitedItems = items.slice(0, parseInt(limit));

    res.json({
      ok: true,
      items: limitedItems
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch activity logs'
    });
  }
});

/**
 * GET /api/admin/manual-gateways
 * Get all manual payment gateways
 */
router.get('/manual-gateways', authenticateAdmin, async (req, res, next) => {
  try {
    // Check if table exists first
    const tableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'manual_payment_gateways'
      )`
    );

    if (!tableCheck.rows[0].exists) {
      return res.json({
        success: true,
        gateways: [],
        message: 'Table not found. Please run the migration SQL file.'
      });
    }

    const result = await pool.query(
      `SELECT 
        id,
        type,
        name,
        type_data,
        icon_path,
        qr_code_path,
        is_active,
        COALESCE(is_recommended, false) as is_recommended,
        display_order,
        instructions,
        COALESCE(is_deposit_enabled, TRUE) as is_deposit_enabled,
        COALESCE(is_withdrawal_enabled, FALSE) as is_withdrawal_enabled,
        created_at,
        updated_at,
        -- Extract type-specific fields from type_data JSONB
        CASE 
          WHEN type = 'UPI' THEN type_data->>'vpa'
          WHEN type IN ('USDT_TRC20', 'USDT_ERC20', 'USDT_BEP20', 'Bitcoin', 'Ethereum', 'Other_Crypto') THEN type_data->>'address'
          ELSE NULL
        END as vpa_address,
        CASE 
          WHEN type IN ('USDT_TRC20', 'USDT_ERC20', 'USDT_BEP20', 'Bitcoin', 'Ethereum', 'Other_Crypto') THEN type_data->>'address'
          ELSE NULL
        END as crypto_address,
        CASE 
          WHEN type = 'Bank_Transfer' THEN type_data->>'bank_name'
          ELSE NULL
        END as bank_name,
        CASE 
          WHEN type = 'Bank_Transfer' THEN type_data->>'account_name'
          ELSE NULL
        END as account_name,
        CASE 
          WHEN type = 'Bank_Transfer' THEN type_data->>'account_number'
          ELSE NULL
        END as account_number,
        CASE 
          WHEN type = 'Bank_Transfer' THEN COALESCE(type_data->>'ifsc', type_data->>'swift')
          ELSE NULL
        END as ifsc_code,
        CASE 
          WHEN type = 'Bank_Transfer' THEN type_data->>'swift'
          ELSE NULL
        END as swift_code,
        CASE 
          WHEN type = 'Bank_Transfer' THEN type_data->>'account_type'
          ELSE NULL
        END as account_type,
        CASE 
          WHEN type = 'Bank_Transfer' THEN type_data->>'country_code'
          ELSE NULL
        END as country_code,
        CASE 
          WHEN type = 'Other' THEN type_data->>'details'
          ELSE NULL
        END as details,
        -- Construct file URLs
        CASE 
          WHEN icon_path IS NOT NULL THEN icon_path
          ELSE NULL
        END as icon_url,
        CASE 
          WHEN qr_code_path IS NOT NULL THEN qr_code_path
          ELSE NULL
        END as qr_code_url
      FROM manual_payment_gateways
      ORDER BY display_order ASC, created_at DESC`
    );

    // Map backend types to frontend types
    const typeMapping = {
      'UPI': 'upi',
      'Bank_Transfer': 'wire',
      'USDT_TRC20': 'crypto',
      'USDT_ERC20': 'crypto',
      'USDT_BEP20': 'crypto',
      'Bitcoin': 'crypto',
      'Ethereum': 'crypto',
      'Other_Crypto': 'crypto',
      'Other': 'local'
    };

    const mappedGateways = result.rows.map(row => ({
      ...row,
      type: typeMapping[row.type] || row.type.toLowerCase(),
      is_recommended: row.is_recommended || false
    }));

    res.json({
      success: true,
      gateways: mappedGateways || []
    });
  } catch (error) {
    console.error('Get manual gateways error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch manual gateways',
      gateways: []
    });
  }
});

/**
 * POST /api/admin/manual-gateways
 * Create a new manual payment gateway
 */
router.post('/manual-gateways', authenticateAdmin, gatewayUpload.fields([
  { name: 'icon', maxCount: 1 },
  { name: 'qr_code', maxCount: 1 }
]), async (req, res, next) => {
  try {
    // Extract form data from req.body (multer puts text fields here)
    const type = req.body.type;
    const name = req.body.name;
    const is_active = req.body.is_active === 'true' || req.body.is_active === true;
    const is_recommended = req.body.is_recommended === 'true' || req.body.is_recommended === true;
    const display_order = parseInt(req.body.display_order) || 0;
    const instructions = req.body.instructions || null;
    const is_deposit_enabled = req.body.is_deposit_enabled === 'true' || req.body.is_deposit_enabled === true || req.body.is_deposit_enabled === undefined;
    const is_withdrawal_enabled = req.body.is_withdrawal_enabled === 'true' || req.body.is_withdrawal_enabled === true;

    if (!type || !name) {
      return res.status(400).json({
        success: false,
        error: 'Type and name are required'
      });
    }

    // Build type_data JSONB based on type
    let typeData = {};

    if (type === 'UPI' || type === 'upi') {
      typeData = { vpa: req.body.vpa_address || '' };
    } else if (['USDT_TRC20', 'USDT_ERC20', 'USDT_BEP20', 'Bitcoin', 'Ethereum', 'Other_Crypto', 'crypto'].includes(type)) {
      const network = type === 'crypto' ? 'TRC20' : type.replace('USDT_', '').replace('Bitcoin', 'BTC').replace('Ethereum', 'ETH');
      typeData = {
        address: req.body.crypto_address || '',
        network: network
      };
    } else if (type === 'Bank_Transfer' || type === 'wire') {
      typeData = {
        bank_name: req.body.bank_name || '',
        account_name: req.body.account_name || '',
        account_number: req.body.account_number || '',
        ifsc: req.body.ifsc_code || '',
        swift: req.body.swift_code || '',
        account_type: req.body.account_type || '',
        country_code: req.body.country_code || ''
      };
    } else if (type === 'Other' || type === 'local') {
      typeData = { details: req.body.details || '' };
    }

    // Normalize type
    const normalizedType = type === 'upi' ? 'UPI'
      : type === 'crypto' ? 'USDT_TRC20'
        : type === 'wire' ? 'Bank_Transfer'
          : type === 'local' ? 'Other'
            : type.toUpperCase();

    // Handle file uploads
    let iconPath = null;
    let qrCodePath = null;

    if (req.files && req.files.icon && req.files.icon[0]) {
      iconPath = `/uploads/gateways/${req.files.icon[0].filename}`;
    }

    if (req.files && req.files.qr_code && req.files.qr_code[0]) {
      qrCodePath = `/uploads/gateways/${req.files.qr_code[0].filename}`;
    }

    const result = await pool.query(
      `INSERT INTO manual_payment_gateways 
        (type, name, type_data, icon_path, qr_code_path, is_active, is_recommended, display_order, instructions, is_deposit_enabled, is_withdrawal_enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        normalizedType,
        name,
        JSON.stringify(typeData),
        iconPath,
        qrCodePath,
        is_active,
        is_recommended,
        display_order,
        instructions,
        is_deposit_enabled,
        is_withdrawal_enabled
      ]
    );

    const gateway = result.rows[0];

    // Parse type_data for response
    const parsedTypeData = typeof gateway.type_data === 'string'
      ? JSON.parse(gateway.type_data)
      : gateway.type_data;

    // Map backend type to frontend type
    const typeMapping = {
      'UPI': 'upi',
      'Bank_Transfer': 'wire',
      'USDT_TRC20': 'crypto',
      'USDT_ERC20': 'crypto',
      'USDT_BEP20': 'crypto',
      'Bitcoin': 'crypto',
      'Ethereum': 'crypto',
      'Other_Crypto': 'crypto',
      'Other': 'local'
    };

    // Format response to match frontend expectations
    const formattedGateway = {
      id: gateway.id,
      type: typeMapping[gateway.type] || gateway.type.toLowerCase(),
      name: gateway.name,
      is_active: gateway.is_active,
      is_recommended: gateway.is_recommended || false,
      icon_url: gateway.icon_path,
      qr_code_url: gateway.qr_code_path,
      vpa_address: parsedTypeData.vpa || null,
      crypto_address: parsedTypeData.address || null,
      bank_name: parsedTypeData.bank_name || null,
      account_name: parsedTypeData.account_name || null,
      account_number: parsedTypeData.account_number || null,
      ifsc_code: parsedTypeData.ifsc || null,
      swift_code: parsedTypeData.swift || null,
      account_type: parsedTypeData.account_type || null,
      country_code: parsedTypeData.country_code || null,
      details: parsedTypeData.details || null,
      is_deposit_enabled: gateway.is_deposit_enabled !== undefined ? gateway.is_deposit_enabled : true,
      is_withdrawal_enabled: gateway.is_withdrawal_enabled !== undefined ? gateway.is_withdrawal_enabled : false
    };

    res.json({
      success: true,
      gateway: formattedGateway
    });
  } catch (error) {
    console.error('Create manual gateway error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create manual gateway'
    });
  }
});

/**
 * PATCH /api/admin/manual-gateways/:id/toggle-status
 * Toggle gateway active/inactive status
 */
router.patch('/manual-gateways/:id/toggle-status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid gateway ID'
      });
    }

    // Get current status
    const currentResult = await pool.query(
      'SELECT is_active FROM manual_payment_gateways WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Gateway not found'
      });
    }

    const newStatus = !currentResult.rows[0].is_active;

    // Update status
    const result = await pool.query(
      'UPDATE manual_payment_gateways SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [newStatus, id]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update gateway status'
      });
    }

    const gateway = result.rows[0];

    // Safely parse type_data
    let parsedTypeData = {};
    try {
      if (gateway.type_data) {
        parsedTypeData = typeof gateway.type_data === 'string'
          ? JSON.parse(gateway.type_data)
          : gateway.type_data;
      }
    } catch (parseError) {
      console.warn('Error parsing type_data for gateway', id, parseError);
      parsedTypeData = {};
    }

    // Map backend type to frontend type
    const typeMapping = {
      'UPI': 'upi',
      'Bank_Transfer': 'wire',
      'USDT_TRC20': 'crypto',
      'USDT_ERC20': 'crypto',
      'USDT_BEP20': 'crypto',
      'Bitcoin': 'crypto',
      'Ethereum': 'crypto',
      'Other_Crypto': 'crypto',
      'Other': 'local'
    };

    const formattedGateway = {
      id: gateway.id,
      type: typeMapping[gateway.type] || (gateway.type ? gateway.type.toLowerCase() : 'other'),
      name: gateway.name,
      is_active: gateway.is_active,
      is_recommended: gateway.is_recommended || false,
      icon_url: gateway.icon_path || null,
      qr_code_url: gateway.qr_code_path || null,
      vpa_address: parsedTypeData.vpa || null,
      crypto_address: parsedTypeData.address || null,
      bank_name: parsedTypeData.bank_name || null,
      account_name: parsedTypeData.account_name || null,
      account_number: parsedTypeData.account_number || null,
      ifsc_code: parsedTypeData.ifsc || null,
      swift_code: parsedTypeData.swift || null,
      account_type: parsedTypeData.account_type || null,
      country_code: parsedTypeData.country_code || null,
      details: parsedTypeData.details || null,
      is_deposit_enabled: gateway.is_deposit_enabled !== undefined ? gateway.is_deposit_enabled : true,
      is_withdrawal_enabled: gateway.is_withdrawal_enabled !== undefined ? gateway.is_withdrawal_enabled : false
    };

    res.json({
      success: true,
      gateway: formattedGateway
    });
  } catch (error) {
    console.error('Error toggling gateway status:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to toggle gateway status'
    });
  }
});

/**
 * PUT /api/admin/manual-gateways/:id
 * Update a manual payment gateway
 */
router.put('/manual-gateways/:id', authenticateAdmin, gatewayUpload.fields([
  { name: 'icon', maxCount: 1 },
  { name: 'qr_code', maxCount: 1 }
]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const type = req.body.type;
    const name = req.body.name;
    const is_active = req.body.is_active === 'true' || req.body.is_active === true;
    const display_order = parseInt(req.body.display_order) || 0;
    const instructions = req.body.instructions || null;
    const is_recommended = req.body.is_recommended === 'true' || req.body.is_recommended === true;
    const is_deposit_enabled = req.body.is_deposit_enabled !== undefined
      ? (req.body.is_deposit_enabled === 'true' || req.body.is_deposit_enabled === true)
      : null;
    const is_withdrawal_enabled = req.body.is_withdrawal_enabled !== undefined
      ? (req.body.is_withdrawal_enabled === 'true' || req.body.is_withdrawal_enabled === true)
      : null;

    if (!type || !name) {
      return res.status(400).json({
        success: false,
        error: 'Type and name are required'
      });
    }

    // Build type_data JSONB
    let typeData = {};

    if (type === 'UPI' || type === 'upi') {
      typeData = { vpa: req.body.vpa_address || '' };
    } else if (['USDT_TRC20', 'USDT_ERC20', 'USDT_BEP20', 'Bitcoin', 'Ethereum', 'Other_Crypto', 'crypto'].includes(type)) {
      const network = type === 'crypto' ? 'TRC20' : type.replace('USDT_', '').replace('Bitcoin', 'BTC').replace('Ethereum', 'ETH');
      typeData = {
        address: req.body.crypto_address || '',
        network: network
      };
    } else if (type === 'Bank_Transfer' || type === 'wire') {
      typeData = {
        bank_name: req.body.bank_name || '',
        account_name: req.body.account_name || '',
        account_number: req.body.account_number || '',
        ifsc: req.body.ifsc_code || '',
        swift: req.body.swift_code || '',
        account_type: req.body.account_type || '',
        country_code: req.body.country_code || ''
      };
    } else if (type === 'Other' || type === 'local') {
      typeData = { details: req.body.details || '' };
    }

    const normalizedType = type === 'upi' ? 'UPI'
      : type === 'crypto' ? 'USDT_TRC20'
        : type === 'wire' ? 'Bank_Transfer'
          : type === 'local' ? 'Other'
            : type.toUpperCase();

    // Get existing gateway to preserve file paths if new files aren't uploaded
    const existingResult = await pool.query(
      'SELECT icon_path, qr_code_path FROM manual_payment_gateways WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Gateway not found'
      });
    }

    let iconPath = existingResult.rows[0].icon_path;
    let qrCodePath = existingResult.rows[0].qr_code_path;

    // Update file paths if new files are uploaded
    if (req.files && req.files.icon && req.files.icon[0]) {
      iconPath = `/uploads/gateways/${req.files.icon[0].filename}`;
    }

    if (req.files && req.files.qr_code && req.files.qr_code[0]) {
      qrCodePath = `/uploads/gateways/${req.files.qr_code[0].filename}`;
    }

    // Build update query with optional deposit/withdrawal fields
    const updateFields = [
      'type = $1',
      'name = $2',
      'type_data = $3',
      'icon_path = $4',
      'qr_code_path = $5',
      'is_active = $6',
      'is_recommended = $7',
      'display_order = $8',
      'instructions = $9'
    ];
    const updateValues = [
      normalizedType,
      name,
      JSON.stringify(typeData),
      iconPath,
      qrCodePath,
      is_active,
      is_recommended,
      display_order,
      instructions
    ];

    let paramIndex = updateValues.length + 1;

    if (is_deposit_enabled !== null) {
      updateFields.push(`is_deposit_enabled = $${paramIndex}`);
      updateValues.push(is_deposit_enabled);
      paramIndex++;
    }

    if (is_withdrawal_enabled !== null) {
      updateFields.push(`is_withdrawal_enabled = $${paramIndex}`);
      updateValues.push(is_withdrawal_enabled);
      paramIndex++;
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    const result = await pool.query(
      `UPDATE manual_payment_gateways 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *`,
      updateValues
    );

    const gateway = result.rows[0];
    const parsedTypeData = typeof gateway.type_data === 'string'
      ? JSON.parse(gateway.type_data)
      : gateway.type_data;

    // Map backend type to frontend type
    const typeMapping = {
      'UPI': 'upi',
      'Bank_Transfer': 'wire',
      'USDT_TRC20': 'crypto',
      'USDT_ERC20': 'crypto',
      'USDT_BEP20': 'crypto',
      'Bitcoin': 'crypto',
      'Ethereum': 'crypto',
      'Other_Crypto': 'crypto',
      'Other': 'local'
    };

    const formattedGateway = {
      id: gateway.id,
      type: typeMapping[gateway.type] || gateway.type.toLowerCase(),
      name: gateway.name,
      is_active: gateway.is_active,
      is_recommended: gateway.is_recommended || false,
      icon_url: gateway.icon_path,
      qr_code_url: gateway.qr_code_path,
      vpa_address: parsedTypeData.vpa || null,
      crypto_address: parsedTypeData.address || null,
      bank_name: parsedTypeData.bank_name || null,
      account_name: parsedTypeData.account_name || null,
      account_number: parsedTypeData.account_number || null,
      ifsc_code: parsedTypeData.ifsc || null,
      swift_code: parsedTypeData.swift || null,
      account_type: parsedTypeData.account_type || null,
      country_code: parsedTypeData.country_code || null,
      details: parsedTypeData.details || null,
      is_deposit_enabled: gateway.is_deposit_enabled !== undefined ? gateway.is_deposit_enabled : true,
      is_withdrawal_enabled: gateway.is_withdrawal_enabled !== undefined ? gateway.is_withdrawal_enabled : false
    };

    res.json({
      success: true,
      gateway: formattedGateway
    });
  } catch (error) {
    console.error('Update manual gateway error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update manual gateway'
    });
  }
});

/**
 * PATCH /api/admin/manual-gateways/:id/toggle-recommended
 * Toggle gateway recommended status
 */
router.patch('/manual-gateways/:id/toggle-recommended', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid gateway ID'
      });
    }

    // Get current status
    const currentResult = await pool.query(
      'SELECT COALESCE(is_recommended, false) as is_recommended FROM manual_payment_gateways WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Gateway not found'
      });
    }

    const newStatus = !currentResult.rows[0].is_recommended;

    // Update status
    const result = await pool.query(
      'UPDATE manual_payment_gateways SET is_recommended = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [newStatus, id]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update gateway recommended status'
      });
    }

    const gateway = result.rows[0];

    // Safely parse type_data
    let parsedTypeData = {};
    try {
      if (gateway.type_data) {
        parsedTypeData = typeof gateway.type_data === 'string'
          ? JSON.parse(gateway.type_data)
          : gateway.type_data;
      }
    } catch (parseError) {
      console.warn('Error parsing type_data for gateway', id, parseError);
      parsedTypeData = {};
    }

    // Map backend type to frontend type
    const typeMapping = {
      'UPI': 'upi',
      'Bank_Transfer': 'wire',
      'USDT_TRC20': 'crypto',
      'USDT_ERC20': 'crypto',
      'USDT_BEP20': 'crypto',
      'Bitcoin': 'crypto',
      'Ethereum': 'crypto',
      'Other_Crypto': 'crypto',
      'Other': 'local'
    };

    const formattedGateway = {
      id: gateway.id,
      type: typeMapping[gateway.type] || (gateway.type ? gateway.type.toLowerCase() : 'other'),
      name: gateway.name,
      is_active: gateway.is_active,
      is_recommended: gateway.is_recommended || false,
      icon_url: gateway.icon_path || null,
      qr_code_url: gateway.qr_code_path || null,
      vpa_address: parsedTypeData.vpa || null,
      crypto_address: parsedTypeData.address || null,
      bank_name: parsedTypeData.bank_name || null,
      account_name: parsedTypeData.account_name || null,
      account_number: parsedTypeData.account_number || null,
      ifsc_code: parsedTypeData.ifsc || null,
      swift_code: parsedTypeData.swift || null,
      account_type: parsedTypeData.account_type || null,
      country_code: parsedTypeData.country_code || null,
      details: parsedTypeData.details || null
    };

    res.json({
      success: true,
      gateway: formattedGateway
    });
  } catch (error) {
    console.error('Error toggling gateway recommended status:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to toggle gateway recommended status'
    });
  }
});

/**
 * DELETE /api/admin/manual-gateways/:id
 * Delete a manual payment gateway
 */
router.delete('/manual-gateways/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM manual_payment_gateways WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Gateway not found'
      });
    }

    res.json({
      success: true,
      message: 'Gateway deleted successfully'
    });
  } catch (error) {
    console.error('Delete manual gateway error:', error);
    next(error);
  }
});

/**
 * GET /api/admin/deposits
 * Get all deposit requests with filtering
 */
router.get('/deposits', authenticateAdmin, requireAdminFeaturePermission('deposits', 'view'), async (req, res) => {
  try {
    const { status, limit = 500, offset = 0 } = req.query;

    let query = `
      SELECT 
        dr.id,
        dr.user_id as "userId",
        dr.gateway_id,
        dr.amount,
        dr.currency,
        dr.converted_amount,
        dr.converted_currency,
        dr.transaction_hash,
        dr.proof_path,
        dr.deposit_to_type,
        dr.mt5_account_id,
        dr.wallet_id,
        dr.wallet_number,
        dr.status,
        dr.admin_notes,
        dr.created_at as "createdAt",
        dr.updated_at as "updatedAt",
        u.email,
        u.first_name,
        u.last_name,
        mg.name as gateway_name,
        mg.type as gateway_type
      FROM deposit_requests dr
      LEFT JOIN users u ON dr.user_id = u.id
      LEFT JOIN manual_payment_gateways mg ON dr.gateway_id = mg.id
    `;

    const params = [];
    const conditions = [];

    if (status && status !== 'all') {
      conditions.push(`dr.status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY dr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count and sum for pagination
    let countQuery = `SELECT COUNT(*), COALESCE(SUM(amount), 0) as total_sum FROM deposit_requests dr`;
    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
    }
    const countParams = status && status !== 'all' ? [status] : [];
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    const totalSum = parseFloat(countResult.rows[0].total_sum || 0);

    const items = result.rows.map(row => {
      // Ensure wallet_id is properly converted to integer or null
      const walletId = row.wallet_id ? parseInt(row.wallet_id) : null;

      console.log('Deposit row:', {
        id: row.id,
        deposit_to_type: row.deposit_to_type,
        wallet_id: row.wallet_id,
        walletId: walletId,
        wallet_number: row.wallet_number,
        mt5_account_id: row.mt5_account_id
      });

      return {
        id: row.id,
        userId: row.userId,
        User: {
          email: row.email || '-',
          name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-'
        },
        MT5Account: {
          accountId: row.mt5_account_id || null
        },
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        method: row.gateway_type || 'manual',
        paymentMethod: row.gateway_name || 'Manual Gateway',
        bankDetails: null, // Can be populated from gateway type_data if needed
        cryptoAddress: row.transaction_hash || null,
        depositAddress: row.transaction_hash || null,
        depositTo: row.deposit_to_type || 'wallet',
        mt5AccountId: row.mt5_account_id || null,
        walletId: walletId,
        walletNumber: row.wallet_number || null, // Now comes directly from deposit_requests table
        status: row.status,
        rejectionReason: row.status === 'rejected' ? row.admin_notes : null,
        approvedAt: row.status === 'approved' ? row.updated_at : null,
        rejectedAt: row.status === 'rejected' ? row.updated_at : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      };
    });

    res.json({
      ok: true,
      items,
      total,
      totalSum,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch deposits'
    });
  }
});

/**
 * POST /api/admin/deposits/:id/approve
 * Approve a deposit request
 */
router.post('/deposits/:id/approve', authenticateAdmin, requireAdminFeaturePermission('deposits', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE deposit_requests 
       SET status = 'approved', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Deposit request not found or already processed'
      });
    }

    const deposit = result.rows[0];

    // Add balance based on deposit destination
    // Only handle MT5 deposits for now - wallet deposits will be handled later
    try {
      if (deposit.deposit_to_type === 'mt5' && deposit.mt5_account_id) {
        // Add to MT5 account using /Users/{login}/AddClientBalance API
        const mt5Service = await import('../services/mt5.service.js');
        const login = parseInt(deposit.mt5_account_id, 10);

        if (Number.isNaN(login)) {
          throw new Error(`Invalid MT5 account ID: ${deposit.mt5_account_id}`);
        }

        console.log(`Adding balance to MT5 account ${login}: ${deposit.amount} ${deposit.currency || 'USD'}`);

        await mt5Service.addBalance(
          login,
          parseFloat(deposit.amount),
          `Deposit #${deposit.id} approved`
        );

        console.log(`Successfully added balance to MT5 account ${login}`);
      } else if (deposit.deposit_to_type === 'wallet') {
        // Add balance to wallet
        if (!deposit.wallet_id) {
          // If wallet_id is not set, fetch it from user_id
          const walletResult = await pool.query(
            'SELECT id FROM wallets WHERE user_id = $1 LIMIT 1',
            [deposit.user_id]
          );

          if (walletResult.rows.length === 0) {
            throw new Error(`No wallet found for user ${deposit.user_id}`);
          }

          deposit.wallet_id = walletResult.rows[0].id;
        }

        console.log(`Adding balance to wallet ${deposit.wallet_id}: ${deposit.amount} ${deposit.currency || 'USD'}`);

        await adjustWalletBalance(
          {
            walletId: deposit.wallet_id,
            amount: parseFloat(deposit.amount),
            type: 'deposit',
            source: 'wallet',
            target: 'wallet',
            currency: deposit.currency || 'USD',
            reference: `Deposit #${deposit.id} approved`
          }
        );

        console.log(`Successfully added balance to wallet ${deposit.wallet_id}`);
      }
    } catch (balanceError) {
      console.error('Error adding balance:', balanceError);
      // Rollback the approval if balance update fails
      await pool.query(
        `UPDATE deposit_requests 
           SET status = 'pending', updated_at = NOW()
           WHERE id = $1`,
        [id]
      );
      return res.status(500).json({
        ok: false,
        error: `Failed to add balance: ${balanceError.message}`
      });
    }

    // Get user email and name for logging and email
    const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [deposit.user_id]);
    const userEmail = userResult.rows[0]?.email || null;
    const userName = userResult.rows.length > 0
      ? `${userResult.rows[0].first_name || ''} ${userResult.rows[0].last_name || ''}`.trim() || 'Valued Customer'
      : 'Valued Customer';

    // Get before data
    const beforeData = {
      id: deposit.id,
      status: 'pending',
      amount: deposit.amount,
      currency: deposit.currency
    };

    // Get after data
    const afterResult = await pool.query(
      'SELECT id, status, amount, currency FROM deposit_requests WHERE id = $1',
      [id]
    );
    const afterData = afterResult.rows[0] || deposit;

    res.json({
      ok: true,
      message: 'Deposit approved successfully'
    });

    // Send transaction completed email
    setImmediate(async () => {
      try {
        if (userEmail) {
          const accountLogin = deposit.mt5_account_id || deposit.wallet_id || 'N/A';
          await sendTransactionCompletedEmail(
            userEmail,
            userName,
            'Deposit',
            accountLogin,
            `${deposit.amount} ${deposit.currency || 'USD'}`,
            new Date().toLocaleDateString()
          );
          console.log(`Deposit approved email sent to ${userEmail}`);
        }
      } catch (emailError) {
        console.error('Failed to send deposit approved email:', emailError);
      }
    });

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'deposit_approve',
        actionCategory: 'deposit_management',
        targetType: 'deposit',
        targetId: parseInt(id),
        targetIdentifier: `Deposit #${id}`,
        description: `Approved deposit #${id} of $${deposit.amount} for user: ${userEmail || deposit.user_id}`,
        req,
        res,
        beforeData,
        afterData
      });
    });
  } catch (error) {
    console.error('Approve deposit error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to approve deposit'
    });
  }
});

/**
 * POST /api/admin/deposits/:id/reject
 * Reject a deposit request
 */
router.post('/deposits/:id/reject', authenticateAdmin, requireAdminFeaturePermission('deposits', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Get before data
    const beforeResult = await pool.query(
      'SELECT * FROM deposit_requests WHERE id = $1',
      [id]
    );
    if (beforeResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Deposit request not found'
      });
    }
    const beforeData = beforeResult.rows[0];

    // Get user email
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [beforeData.user_id]);
    const userEmail = userResult.rows[0]?.email || null;

    const result = await pool.query(
      `UPDATE deposit_requests 
       SET status = 'rejected', admin_notes = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [reason || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Deposit request not found or already processed'
      });
    }

    const afterData = result.rows[0];

    res.json({
      ok: true,
      message: 'Deposit rejected successfully'
    });

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'deposit_reject',
        actionCategory: 'deposit_management',
        targetType: 'deposit',
        targetId: parseInt(id),
        targetIdentifier: `Deposit #${id}`,
        description: `Rejected deposit #${id} of $${beforeData.amount} for user: ${userEmail || beforeData.user_id}. Reason: ${reason || 'No reason provided'}`,
        req,
        res,
        beforeData,
        afterData
      });
    });
  } catch (error) {
    console.error('Reject deposit error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to reject deposit'
    });
  }
});

/**
 * ============================================
 * Admin MT5 / Wallet Internal Transfers
 * ============================================
 */

router.post('/mt5/transfer', authenticateAdmin, async (req, res) => {
  try {
    const { from, to, amount, comment } = req.body;
    const adminId = req.admin.id;

    const numericAmount = Number(amount);
    if (!from || !to || !numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'From, To and positive amount are required'
      });
    }
    if (from === to) {
      return res.status(400).json({
        success: false,
        message: 'From and To must be different'
      });
    }

    const [fromType, fromRef] = String(from).split(':');
    const [toType, toRef] = String(to).split(':');

    if (!['wallet', 'mt5'].includes(fromType) || !['wallet', 'mt5'].includes(toType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid from/to types'
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Handle wallet side using wallet.service helper
      async function applyWalletChange(walletId, direction, mt5Login, reference) {
        const type = direction === 'out' ? 'transfer_out' : 'transfer_in';
        const source = direction === 'out' ? 'wallet' : 'mt5';
        const target = direction === 'out' ? 'mt5' : 'wallet';
        await adjustWalletBalance(
          {
            walletId,
            amount: numericAmount,
            type,
            source,
            target,
            mt5AccountNumber: mt5Login ? String(mt5Login) : null,
            reference
          },
          client
        );
      }

      // Resolve wallet/mt5 records
      let fromWalletId = null;
      let toWalletId = null;
      let fromMt5Login = null;
      let toMt5Login = null;

      if (fromType === 'wallet') {
        const w = await client.query(
          'SELECT id, wallet_number FROM wallets WHERE id = $1',
          [fromRef]
        );
        if (w.rows.length === 0) throw new Error('From wallet not found');
        fromWalletId = w.rows[0].id;
      }
      if (toType === 'wallet') {
        const w = await client.query(
          'SELECT id, wallet_number FROM wallets WHERE id = $1',
          [toRef]
        );
        if (w.rows.length === 0) throw new Error('To wallet not found');
        toWalletId = w.rows[0].id;
      }
      if (fromType === 'mt5') {
        fromMt5Login = parseInt(fromRef, 10);
        if (Number.isNaN(fromMt5Login)) throw new Error('Invalid from MT5 login');
      }
      if (toType === 'mt5') {
        toMt5Login = parseInt(toRef, 10);
        if (Number.isNaN(toMt5Login)) throw new Error('Invalid to MT5 login');
      }

      const refComment = comment || `Admin transfer ${from} → ${to}`;

      // Apply MT5 changes
      if (fromMt5Login) {
        await mt5Service.deductBalance(fromMt5Login, numericAmount, refComment);
      }
      if (toMt5Login) {
        await mt5Service.addBalance(toMt5Login, numericAmount, refComment);
      }

      // Apply wallet changes
      if (fromWalletId) {
        await applyWalletChange(fromWalletId, 'out', toMt5Login || fromMt5Login, refComment);
      }
      if (toWalletId) {
        await applyWalletChange(toWalletId, 'in', fromMt5Login || toMt5Login, refComment);
      }

      await client.query(
        `INSERT INTO admin_transfers_mt5
         (admin_id, from_type, from_ref, to_type, to_ref, amount, currency, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          adminId,
          fromType,
          fromRef,
          toType,
          toRef,
          numericAmount,
          'USD',
          refComment
        ]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Transfer completed'
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Admin mt5 transfer error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Transfer failed'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Admin mt5 transfer outer error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Transfer failed'
    });
  }
});

router.get('/mt5/transfers', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const offset = parseInt(req.query.offset, 10) || 0;

    const result = await pool.query(
      `SELECT t.id, t.from_type, t.from_ref, t.to_type, t.to_ref,
              t.amount, t.currency, t.comment, t.created_at,
              a.email AS admin_email
       FROM admin_transfers_mt5 t
       LEFT JOIN admin a ON t.admin_id = a.id
       ORDER BY t.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      ok: true,
      items: result.rows
    });
  } catch (error) {
    console.error('Admin mt5 transfers list error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to load transfers'
    });
  }
});

/**
 * ============================================
 * AUTOMATIC PAYMENT GATEWAYS (auto_gateway)
 * ============================================
 */

/**
 * GET /api/admin/payment-gateways
 * Get all automatic payment gateways
 */
router.get('/payment-gateways', authenticateAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        wallet_name,
        gateway_type,
        deposit_wallet_address,
        api_key,
        secret_key,
        project_id,
        gateway_url,
        webhook_secret,
        description,
        is_active,
        display_order,
        created_at,
        updated_at
      FROM auto_gateway
      ORDER BY display_order ASC, created_at DESC`
    );

    res.json({
      success: true,
      gateways: result.rows
    });
  } catch (error) {
    console.error('Get automatic payment gateways error:', error);
    next(error);
  }
});

/**
 * POST /api/admin/payment-gateways
 * Create a new automatic payment gateway
 */
router.post('/payment-gateways', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      wallet_name,
      gateway_type,
      deposit_wallet_address,
      api_key,
      secret_key,
      project_id,
      gateway_url,
      webhook_secret,
      description,
      is_active = true,
      display_order = 0
    } = req.body;

    // Validate required fields
    if (!wallet_name || !gateway_type || !api_key || !secret_key) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_name, gateway_type, api_key, secret_key'
      });
    }

    const result = await pool.query(
      `INSERT INTO auto_gateway 
        (wallet_name, gateway_type, deposit_wallet_address, api_key, secret_key, 
         project_id, gateway_url, webhook_secret, description, is_active, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        wallet_name,
        gateway_type,
        deposit_wallet_address || null,
        api_key,
        secret_key,
        project_id || null,
        gateway_url || null,
        webhook_secret || null,
        description || null,
        is_active,
        display_order
      ]
    );

    res.json({
      success: true,
      gateway: result.rows[0]
    });
  } catch (error) {
    console.error('Create automatic payment gateway error:', error);
    next(error);
  }
});

/**
 * PUT /api/admin/payment-gateways/:id
 * Update an automatic payment gateway
 */
router.put('/payment-gateways/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      wallet_name,
      gateway_type,
      deposit_wallet_address,
      api_key,
      secret_key,
      project_id,
      gateway_url,
      webhook_secret,
      description,
      is_active,
      display_order
    } = req.body;

    // Check if gateway exists
    const checkResult = await pool.query(
      'SELECT id FROM auto_gateway WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment gateway not found'
      });
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (wallet_name !== undefined) {
      updateFields.push(`wallet_name = $${paramIndex++}`);
      updateValues.push(wallet_name);
    }
    if (gateway_type !== undefined) {
      updateFields.push(`gateway_type = $${paramIndex++}`);
      updateValues.push(gateway_type);
    }
    if (deposit_wallet_address !== undefined) {
      updateFields.push(`deposit_wallet_address = $${paramIndex++}`);
      updateValues.push(deposit_wallet_address);
    }
    if (api_key !== undefined) {
      updateFields.push(`api_key = $${paramIndex++}`);
      updateValues.push(api_key);
    }
    if (secret_key !== undefined) {
      updateFields.push(`secret_key = $${paramIndex++}`);
      updateValues.push(secret_key);
    }
    if (project_id !== undefined) {
      updateFields.push(`project_id = $${paramIndex++}`);
      updateValues.push(project_id);
    }
    if (gateway_url !== undefined) {
      updateFields.push(`gateway_url = $${paramIndex++}`);
      updateValues.push(gateway_url);
    }
    if (webhook_secret !== undefined) {
      updateFields.push(`webhook_secret = $${paramIndex++}`);
      updateValues.push(webhook_secret);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(description);
    }
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateValues.push(is_active);
    }
    if (display_order !== undefined) {
      updateFields.push(`display_order = $${paramIndex++}`);
      updateValues.push(display_order);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    const result = await pool.query(
      `UPDATE auto_gateway 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      updateValues
    );

    res.json({
      success: true,
      gateway: result.rows[0]
    });
  } catch (error) {
    console.error('Update automatic payment gateway error:', error);
    next(error);
  }
});

/**
 * DELETE /api/admin/payment-gateways/:id
 * Delete an automatic payment gateway
 */
router.delete('/payment-gateways/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM auto_gateway WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment gateway not found'
      });
    }

    res.json({
      success: true,
      message: 'Payment gateway deleted successfully'
    });
  } catch (error) {
    console.error('Delete automatic payment gateway error:', error);
    next(error);
  }
});

/**
 * GET /api/admin/withdrawals
 * List all withdrawal requests
 */
router.get('/withdrawals', authenticateAdmin, requireAdminFeaturePermission('withdrawals', 'view'), async (req, res) => {
  try {
    const { status, limit = 500 } = req.query;

    let query = `
      SELECT 
        w.*,
        json_build_object(
          'id', u.id,
          'email', u.email,
          'name', COALESCE(u.first_name || ' ' || u.last_name, u.email)
        ) as "User"
      FROM withdrawals w
      LEFT JOIN users u ON w.user_id = u.id
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ` WHERE w.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY w.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      ok: true,
      items: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get admin withdrawals error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch withdrawals'
    });
  }
});

/**
 * POST /api/admin/withdrawals/:id/approve
 * Approve a withdrawal request
 */
router.post('/withdrawals/:id/approve', authenticateAdmin, requireAdminFeaturePermission('withdrawals', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { externalTransactionId } = req.body;

    if (!externalTransactionId || !externalTransactionId.trim()) {
      return res.status(400).json({
        ok: false,
        error: 'External transaction ID is required'
      });
    }

    // Get withdrawal details
    const withdrawalResult = await pool.query(
      'SELECT * FROM withdrawals WHERE id = $1',
      [id]
    );

    if (withdrawalResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Withdrawal not found'
      });
    }

    const withdrawal = withdrawalResult.rows[0];

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: `Withdrawal is already ${withdrawal.status}`
      });
    }

    // Deduct balance from MT5 account
    try {
      await mt5Service.deductBalance(
        parseInt(withdrawal.mt5_account_id),
        withdrawal.amount,
        `Withdrawal approved - TX: ${externalTransactionId.substring(0, 20)}`
      );
    } catch (error) {
      console.error('Failed to deduct MT5 balance:', error);
      return res.status(500).json({
        ok: false,
        error: 'Failed to deduct balance from MT5 account: ' + error.message
      });
    }

    // Update withdrawal status
    await pool.query(
      `UPDATE withdrawals 
       SET status = 'approved', 
           external_transaction_id = $1,
           approved_by = $2,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [externalTransactionId.trim(), req.admin.id, id]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (admin_id, action, details, created_at)
       VALUES ($1, 'WITHDRAWAL_APPROVE', $2, NOW())`,
      [
        req.admin.id,
        JSON.stringify({
          withdrawalId: id,
          amount: withdrawal.amount,
          userId: withdrawal.user_id,
          mt5AccountId: withdrawal.mt5_account_id,
          externalTransactionId: externalTransactionId.trim()
        })
      ]
    ).catch(err => console.error('Failed to log activity:', err));

    // TODO: Send email notification to user

    // Get user email for logging
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [withdrawal.user_id]);
    const userEmail = userResult.rows[0]?.email || null;

    // Get after data
    const afterResult = await pool.query(
      'SELECT * FROM withdrawals WHERE id = $1',
      [id]
    );
    const afterData = afterResult.rows[0] || withdrawal;

    res.json({
      ok: true,
      message: 'Withdrawal approved successfully'
    });

    // Send transaction completed email
    setImmediate(async () => {
      try {
        if (userEmail) {
          await sendTransactionCompletedEmail(
            userEmail,
            userName,
            'Withdrawal',
            withdrawal.mt5_account_id || 'N/A',
            `${withdrawal.amount} ${withdrawal.currency || 'USD'}`,
            new Date().toLocaleDateString()
          );
          console.log(`Withdrawal approved email sent to ${userEmail}`);
        }
      } catch (emailError) {
        console.error('Failed to send withdrawal approved email:', emailError);
      }
    });

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'withdrawal_approve',
        actionCategory: 'withdrawal_management',
        targetType: 'withdrawal',
        targetId: parseInt(id),
        targetIdentifier: `Withdrawal #${id}`,
        description: `Approved withdrawal #${id} of $${withdrawal.amount} for user: ${userEmail || withdrawal.user_id}. External TX: ${externalTransactionId.trim()}`,
        req,
        res,
        beforeData: withdrawal,
        afterData
      });
    });
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to approve withdrawal'
    });
  }
});

/**
 * POST /api/admin/withdrawals/:id/reject
 * Reject a withdrawal request
 */
router.post('/withdrawals/:id/reject', authenticateAdmin, requireAdminFeaturePermission('withdrawals', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Get withdrawal details
    const withdrawalResult = await pool.query(
      'SELECT * FROM withdrawals WHERE id = $1',
      [id]
    );

    if (withdrawalResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Withdrawal not found'
      });
    }

    const withdrawal = withdrawalResult.rows[0];

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: `Withdrawal is already ${withdrawal.status}`
      });
    }

    // Update withdrawal status
    await pool.query(
      `UPDATE withdrawals 
       SET status = 'rejected', 
           rejection_reason = $1,
           rejected_by = $2,
           rejected_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [reason || 'No reason provided', req.admin.id, id]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (admin_id, action, details, created_at)
       VALUES ($1, 'WITHDRAWAL_REJECT', $2, NOW())`,
      [
        req.admin.id,
        JSON.stringify({
          withdrawalId: id,
          amount: withdrawal.amount,
          userId: withdrawal.user_id,
          mt5AccountId: withdrawal.mt5_account_id,
          reason: reason || 'No reason provided'
        })
      ]
    ).catch(err => console.error('Failed to log activity:', err));

    // TODO: Send email notification to user

    // Get user email for logging
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [withdrawal.user_id]);
    const userEmail = userResult.rows[0]?.email || null;

    // Get after data
    const afterResult = await pool.query(
      'SELECT * FROM withdrawals WHERE id = $1',
      [id]
    );
    const afterData = afterResult.rows[0] || withdrawal;

    res.json({
      ok: true,
      message: 'Withdrawal rejected successfully'
    });

    // Log admin action
    setImmediate(async () => {
      await logAdminAction({
        adminId: req.admin?.adminId || req.admin?.id,
        adminEmail: req.admin?.email,
        actionType: 'withdrawal_reject',
        actionCategory: 'withdrawal_management',
        targetType: 'withdrawal',
        targetId: parseInt(id),
        targetIdentifier: `Withdrawal #${id}`,
        description: `Rejected withdrawal #${id} of $${withdrawal.amount} for user: ${userEmail || withdrawal.user_id}. Reason: ${reason || 'No reason provided'}`,
        req,
        res,
        beforeData: withdrawal,
        afterData
      });
    });
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to reject withdrawal'
    });
  }
});

/**
 * GET /api/admin/internal-transfers
 * Get all internal transfers for admin report
 */
router.get('/internal-transfers', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 500;
    const offset = parseInt(req.query.offset) || 0;

    // Fetch internal transfers with user information
    const result = await pool.query(
      `SELECT 
        it.id,
        it.user_id,
        it.from_type,
        it.from_account,
        it.to_type,
        it.to_account,
        it.amount,
        it.currency,
        it.mt5_account_number,
        it.status,
        it.reference AS reference_text,
        it.created_at,
        it.updated_at,
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        -- Get from account details
        CASE 
          WHEN it.from_type = 'mt5' THEN ta_from.account_number
          WHEN it.from_type = 'wallet' THEN w_from.wallet_number
          ELSE it.from_account
        END AS from_account_display,
        -- Get to account details
        CASE 
          WHEN it.to_type = 'mt5' THEN ta_to.account_number
          WHEN it.to_type = 'wallet' THEN w_to.wallet_number
          ELSE it.to_account
        END AS to_account_display
      FROM internal_transfers it
      LEFT JOIN users u ON it.user_id = u.id
      LEFT JOIN trading_accounts ta_from ON it.from_type = 'mt5' AND it.from_account = ta_from.account_number::text
      LEFT JOIN trading_accounts ta_to ON it.to_type = 'mt5' AND it.to_account = ta_to.account_number::text
      LEFT JOIN wallets w_from ON it.from_type = 'wallet' AND it.from_account = w_from.wallet_number
      LEFT JOIN wallets w_to ON it.to_type = 'wallet' AND it.to_account = w_to.wallet_number
      ORDER BY it.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Format the data to match frontend expectations
    const items = result.rows.map(row => {
      const userName = row.first_name && row.last_name
        ? `${row.first_name} ${row.last_name}`.trim()
        : row.first_name || row.last_name || '-';

      return {
        id: row.id,
        createdAt: row.created_at,
        amount: parseFloat(row.amount || 0),
        currency: row.currency || 'USD',
        status: row.status || 'completed',
        description: row.reference_text || '-',
        from: row.from_type === 'mt5' ? {
          mt5Login: row.from_account_display || row.from_account,
          user: {
            name: userName,
            email: row.email || '-'
          }
        } : row.from_type === 'wallet' ? {
          mt5Login: row.from_account_display || row.from_account,
          user: {
            name: userName,
            email: row.email || '-'
          }
        } : null,
        to: row.to_type === 'mt5' ? {
          mt5Login: row.to_account_display || row.to_account,
          user: {
            name: userName,
            email: row.email || '-'
          }
        } : row.to_type === 'wallet' ? {
          mt5Login: row.to_account_display || row.to_account,
          user: {
            name: userName,
            email: row.email || '-'
          }
        } : null
      };
    });

    res.json({
      ok: true,
      items: items,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get internal transfers error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to load internal transfers'
    });
  }
});

/**
 * GET /api/admin/wallet-transactions
 * Admin wallet transactions report (from wallet_transactions table)
 */
router.get('/wallet-transactions', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 1000;
    const offset = parseInt(req.query.offset, 10) || 0;

    const result = await pool.query(
      `SELECT
        wt.id,
        wt.wallet_id,
        wt.type,
        wt.source,
        wt.target,
        wt.amount,
        wt.currency,
        wt.mt5_account_number,
        wt.reference,
        wt.created_at,
        w.wallet_number,
        w.currency AS wallet_currency,
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email
      FROM wallet_transactions wt
      INNER JOIN wallets w ON wt.wallet_id = w.id
      INNER JOIN users u ON w.user_id = u.id
      ORDER BY wt.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const items = result.rows.map((row) => {
      const userName = row.first_name && row.last_name
        ? `${row.first_name} ${row.last_name}`.trim()
        : row.first_name || row.last_name || '-';

      return {
        id: row.id,
        createdAt: row.created_at,
        userId: row.user_id,
        userEmail: row.email || '-',
        userName,
        mt5AccountId: row.mt5_account_number || null,
        walletId: row.wallet_number,
        walletLabel: row.wallet_number
          ? `${row.wallet_number} (${row.wallet_currency || row.currency || 'USD'})`
          : null,
        type: row.type,
        source: row.source,
        target: row.target,
        amount: parseFloat(row.amount || 0),
        currency: row.currency || row.wallet_currency || 'USD',
        status: 'completed',
        description: row.reference || '-',
        withdrawalId: null,
      };
    });

    res.json({
      ok: true,
      items,
      total: items.length,
    });
  } catch (error) {
    console.error('Get wallet transactions error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to load wallet transactions',
    });
  }
});

/**
 * ============================================
 * Send Emails Management
 * ============================================
 */

// GET /api/admin/send-emails/search-users
router.get('/send-emails/search-users', authenticateAdmin, async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ ok: true, users: [] });
    }

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, is_email_verified, status 
       FROM users 
       WHERE email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [`%${q}%`, limit]
    );

    const users = result.rows.map(u => ({
      id: u.id,
      email: u.email,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      emailVerified: u.is_email_verified,
      status: u.status
    }));

    res.json({ ok: true, users });
  } catch (err) {
    console.error('GET /admin/send-emails/search-users failed:', err);
    res.status(500).json({ ok: false, error: 'Failed to search users' });
  }
});

// Helper to build user query
const buildUserQuery = (recipientType, specificUsers = [], startParamIndex = 1) => {
  let whereClause = '';
  let params = [];

  switch (recipientType) {
    case 'all':
      whereClause = '1=1';
      break;
    case 'verified':
      whereClause = 'is_email_verified = true';
      break;
    case 'unverified':
      whereClause = 'is_email_verified = false';
      break;
    case 'active':
      whereClause = "status = 'active'";
      break;
    case 'banned':
      whereClause = "status = 'banned'";
      break;
    case 'inactive':
      whereClause = "status != 'active'";
      break;
    case 'kyc_verified':
      whereClause = "kyc_status = 'approved'";
      break;
    case 'kyc_unverified':
      whereClause = "(kyc_status IS NULL OR kyc_status != 'approved')";
      break;
    case 'specific':
      if (specificUsers && specificUsers.length > 0) {
        // specificUsers can be IDs or emails.
        // If specificUsers is array of objects {id, email}, map to IDs
        let ids = [];
        let emails = [];

        specificUsers.forEach(u => {
          if (typeof u === 'object') {
            if (u.id) ids.push(u.id);
            else if (u.email) emails.push(u.email);
          } else if (String(u).includes('@')) {
            emails.push(u);
          } else {
            ids.push(u);
          }
        });

        if (ids.length > 0) {
          whereClause = `id = ANY($${startParamIndex})`;
          params.push(ids);
        } else if (emails.length > 0) {
          whereClause = `email = ANY($${startParamIndex})`;
          params.push(emails);
        } else {
          whereClause = '1=0';
        }
      } else {
        whereClause = '1=0';
      }
      break;
    case 'zero_balance':
      // Users who have trading accounts but with 0 balance (or no balance > 0)
      // This means users who either:
      // 1. Have no trading accounts at all, OR
      // 2. Have trading accounts but all have balance = 0 or NULL
      whereClause = `id IN (
        SELECT DISTINCT u.id
        FROM users u
        WHERE NOT EXISTS (
          SELECT 1
          FROM trading_accounts ta
          WHERE ta.user_id = u.id
          AND ta.platform = 'MT5'
          AND (COALESCE(ta.balance, 0) > 0 OR COALESCE(ta.equity, 0) > 0)
        )
      )`;
      break;
    case 'no_account':
      // Users who have no MT5 trading accounts at all
      whereClause = `id NOT IN (
        SELECT DISTINCT user_id
        FROM trading_accounts
        WHERE platform = 'MT5'
      )`;
      break;
    default:
      whereClause = '1=0';
  }
  return { whereClause, params };
};

// POST /api/admin/send-emails/preview
router.post('/send-emails/preview', authenticateAdmin, async (req, res) => {
  try {
    const { recipientType, specificUsers = [] } = req.body || {};

    if (!recipientType) {
      return res.status(400).json({ ok: false, error: 'Recipient type is required' });
    }

    const { whereClause, params } = buildUserQuery(recipientType, specificUsers);

    // Get count
    const countRes = await pool.query(`SELECT COUNT(*) FROM users WHERE ${whereClause}`, params);
    const count = parseInt(countRes.rows[0].count);

    // Get sample users
    const sampleRes = await pool.query(
      `SELECT id, email, first_name, last_name, is_email_verified, status 
       FROM users 
       WHERE ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT 10`,
      params
    );

    const sampleUsers = sampleRes.rows.map(u => ({
      id: u.id,
      email: u.email,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      emailVerified: u.is_email_verified,
      status: u.status
    }));

    res.json({
      ok: true,
      count,
      sampleUsers,
    });
  } catch (err) {
    console.error('POST /admin/send-emails/preview failed:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to preview recipients' });
  }
});

// POST /api/admin/send-emails
router.post('/send-emails', authenticateAdmin, async (req, res) => {
  try {
    const { recipientType, specificUsers = [], subject, body, isHtml = true, imageUrl, attachments = [], templateId, templateVariables = {} } = req.body || {};
    const adminId = req.admin.adminId;

    if (!recipientType) {
      return res.status(400).json({ ok: false, error: 'Recipient type is required' });
    }

    // If template is selected, subject and body are not required (template has its own)
    if (!templateId) {
      if (!subject || !body) {
        return res.status(400).json({ ok: false, error: 'Subject and body are required when no template is selected' });
      }
    }

    const { whereClause, params } = buildUserQuery(recipientType, specificUsers);

    // Fetch users
    const usersRes = await pool.query(
      `SELECT id, email, first_name, last_name 
       FROM users 
       WHERE ${whereClause}`,
      params
    );

    const users = usersRes.rows;

    if (users.length === 0) {
      return res.status(404).json({ ok: false, error: 'No users found matching criteria' });
    }

    // Get template if selected
    let selectedTemplate = null;
    if (templateId) {
      const tmplRes = await pool.query('SELECT * FROM email_templates WHERE id = $1', [templateId]);
      if (tmplRes.rows.length > 0) {
        selectedTemplate = tmplRes.rows[0];
      }
    }

    // Determine final subject
    let finalSubject = subject;
    if (selectedTemplate && !finalSubject) {
      finalSubject = selectedTemplate.name; // Fallback to template name
      // Try to extract title from HTML? Maybe overkill for now.
    }

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    // Send emails
    for (const user of users) {
      try {
        const recipientName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Valued Customer';
        let htmlContent = body;

        if (selectedTemplate) {
          htmlContent = selectedTemplate.html_code;

          // Replace standard variables
          // Get logo URL - use actual URL for email templates
          const logoUrl = getLogoUrl(); // Returns: https://portal.solitairemarkets.com/logo.svg

          // Get frontend URL - use live URL as default
          const frontendUrl = process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com';
          const dashboardUrl = `${frontendUrl}/user/dashboard`;
          const supportUrl = `${frontendUrl}/user/support`; // Correct support URL

          const vars = {
            ...templateVariables,
            recipientName,
            recipientEmail: user.email,
            subject: finalSubject,
            content: body || '',
            currentYear: new Date().getFullYear(),
            companyName: 'Solitaire Markets',
            companyEmail: 'support@solitairemarkets.me',
            dashboardUrl: dashboardUrl,
            supportUrl: supportUrl, // Support page URL
            frontendUrl: frontendUrl,
            logoUrl: logoUrl // Use actual URL: https://portal.solitairemarkets.com/logo.svg
          };

          // Replace all variables (handle both {{key}} and {{ key }} formats, case-insensitive)
          Object.keys(vars).forEach(key => {
            // Match {{key}} or {{ key }} with optional spaces, case-insensitive
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
            htmlContent = htmlContent.replace(regex, String(vars[key] || ''));
          });

          // Force replace any remaining logoUrl variables (case-insensitive, handle all variations)
          // Use actual URL
          htmlContent = htmlContent.replace(/\{\{\s*logoUrl\s*\}\}/gi, logoUrl);
          htmlContent = htmlContent.replace(/\{\{\s*logo_url\s*\}\}/gi, logoUrl);
          htmlContent = htmlContent.replace(/\{\{\s*LOGO_URL\s*\}\}/gi, logoUrl);

          // Replace any CID references with actual URL
          htmlContent = htmlContent.replace(/cid:solitaire-logo/gi, logoUrl);

          // Replace any base64 logo URLs with actual URL
          const base64Pattern = /data:image\/svg\+xml;base64,[^"'\s>]+/gi;
          htmlContent = htmlContent.replace(base64Pattern, logoUrl);

          // Fix common issue: replace companyEmail in href attributes with dashboardUrl
          htmlContent = htmlContent.replace(/href=["']\{\{\s*companyEmail\s*\}\}["']/gi, `href="${dashboardUrl}"`);
          htmlContent = htmlContent.replace(/href=["']\{\{companyEmail\}\}["']/gi, `href="${dashboardUrl}"`);

          // Also replace dashboardUrl variations
          htmlContent = htmlContent.replace(/\{\{\s*dashboardUrl\s*\}\}/gi, dashboardUrl);
          htmlContent = htmlContent.replace(/\{\{\s*dashboard_url\s*\}\}/gi, dashboardUrl);
          htmlContent = htmlContent.replace(/\{\{\s*DASHBOARD_URL\s*\}\}/gi, dashboardUrl);

          // CRITICAL: Replace all hardcoded wrong URLs with correct dashboard URL
          // Replace any solitairemarkets.me URLs (wrong domain) with correct dashboard URL
          htmlContent = htmlContent.replace(/https?:\/\/solitairemarkets\.me\/[^"'\s>]*/gi, dashboardUrl);
          htmlContent = htmlContent.replace(/https?:\/\/www\.solitairemarkets\.me\/[^"'\s>]*/gi, dashboardUrl);

          // Replace any "View Dashboard" or similar links that might have wrong URLs
          htmlContent = htmlContent.replace(/href=["']https?:\/\/solitairemarkets\.me[^"']*["']/gi, `href="${dashboardUrl}"`);
          htmlContent = htmlContent.replace(/href=["']https?:\/\/www\.solitairemarkets\.me[^"']*["']/gi, `href="${dashboardUrl}"`);

          // Also replace any localhost URLs that might be in templates
          htmlContent = htmlContent.replace(/href=["']https?:\/\/localhost[^"']*["']/gi, `href="${dashboardUrl}"`);

          // Replace any href attributes that contain "dashboard" but have wrong domain
          htmlContent = htmlContent.replace(/href=["']([^"']*solitairemarkets\.me[^"']*dashboard[^"']*)["']/gi, `href="${dashboardUrl}"`);

          // CRITICAL: Fix incorrect support URLs (should be /user/support, not /user/dashboard/support)
          htmlContent = htmlContent.replace(/\/user\/dashboard\/support/gi, supportUrl);
          htmlContent = htmlContent.replace(/\/user\/dashboar\/support/gi, supportUrl); // Fix typo "dashboar"
          htmlContent = htmlContent.replace(/\{\{dashboardUrl\}\}\/support/gi, supportUrl);
          htmlContent = htmlContent.replace(/\{\{dashboard_url\}\}\/support/gi, supportUrl);
          htmlContent = htmlContent.replace(/\{\{DASHBOARD_URL\}\}\/support/gi, supportUrl);

          // Replace supportUrl variable
          htmlContent = htmlContent.replace(/\{\{\s*supportUrl\s*\}\}/gi, supportUrl);
          htmlContent = htmlContent.replace(/\{\{\s*support_url\s*\}\}/gi, supportUrl);
          htmlContent = htmlContent.replace(/\{\{\s*SUPPORT_URL\s*\}\}/gi, supportUrl);

          // Replace "View Ticket" links to use correct support URL
          htmlContent = htmlContent.replace(/<a[^>]*>[\s]*View[\s]+Ticket[\s]*<\/a>/gi, `<a href="${supportUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">View Ticket</a>`);
          htmlContent = htmlContent.replace(/<a[^>]*>[\s]*View[\s]*&[\s]*Reply[\s]+to[\s]+Ticket[\s]*<\/a>/gi, `<a href="${supportUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">View & Reply to Ticket</a>`);

          // Ensure logo is always present - check if logo image exists in HTML
          const hasLogoImg = /<img[^>]*src[^>]*>/i.test(htmlContent) &&
            (htmlContent.toLowerCase().includes('logo') || htmlContent.toLowerCase().includes('solitaire') || htmlContent.includes(logoUrl));

          if (!hasLogoImg) {
            console.log('📧 Adding logo to template that doesn\'t have one:', selectedTemplate.name);
            // Try to inject logo after <body> tag or at the beginning
            const bodyMatch = htmlContent.match(/<body[^>]*>/i);
            if (bodyMatch) {
              const logoHtml = `<div style="text-align: center; margin: 20px 0; padding: 20px 0;">
                <img src="${logoUrl}" alt="Solitaire Markets" style="height: 50px; max-width: 200px; display: block; margin: 0 auto;" />
              </div>`;
              htmlContent = htmlContent.replace(bodyMatch[0], bodyMatch[0] + logoHtml);
            } else {
              // If no body tag, add at the very beginning
              htmlContent = `<div style="text-align: center; margin: 20px 0; padding: 20px 0;">
                <img src="${logoUrl}" alt="Solitaire Markets" style="height: 50px; max-width: 200px; display: block; margin: 0 auto;" />
              </div>` + htmlContent;
            }
          }
        } else {
          // Wrap body in basic template if no template selected
          const logoUrl = getLogoUrl();
          if (isHtml && !body.includes('<html')) {
            htmlContent = `
                        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                            <div style="text-align: center; margin-bottom: 20px;">
                              <img src="${logoUrl}" alt="Solitaire Markets" style="height: 50px; margin-bottom: 10px;" />
                            </div>
                            ${body}
                            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                            <p style="font-size: 12px; color: #666; text-align: center;">
                              © ${new Date().getFullYear()} Solitaire Markets. All rights reserved.
                            </p>
                        </div>
                    `;
          }
        }

        // Send email with logo attachment
        await sendEmail({
          to: user.email,
          subject: finalSubject,
          html: htmlContent,
          attachments: attachments, // Pass attachments if any
          includeLogo: true // Include logo as CID attachment
        });

        // Log success
        await pool.query(
          `INSERT INTO sent_emails 
                 (recipient_email, recipient_name, subject, content_body, is_html, recipient_type, status, sent_at, admin_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'sent', NOW(), $7)`,
          [user.email, recipientName, finalSubject, htmlContent, true, recipientType, adminId]
        );

        successCount++;
        results.push({ email: user.email, status: 'success' });

      } catch (err) {
        console.error(`Failed to send email to ${user.email}:`, err);
        failureCount++;
        results.push({ email: user.email, status: 'failed', error: err.message });

        // Log failure
        await pool.query(
          `INSERT INTO sent_emails 
                 (recipient_email, recipient_name, subject, content_body, is_html, recipient_type, status, error_message, admin_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'failed', $7, $8)`,
          [user.email, `${user.first_name || ''} ${user.last_name || ''}`, finalSubject, body || '', true, recipientType, err.message, adminId]
        );
      }
    }

    res.json({
      ok: true,
      message: `Emails sent: ${successCount} successful, ${failureCount} failed`,
      recipientsCount: users.length,
      successCount,
      failureCount,
      results: results.slice(0, 50)
    });

  } catch (err) {
    console.error('POST /admin/send-emails failed:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to send emails' });
  }
});

/**
 * ============================================
 * Email Templates & Sent Emails
 * ============================================
 */

// GET /api/admin/email-templates
router.get('/email-templates', authenticateAdmin, async (req, res) => {
  try {
    // Check if table exists first
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'email_templates'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      // Table doesn't exist, create it
      console.log('email_templates table not found, creating...');

      // Create the update function first (if it doesn't exist)
      await pool.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql';
      `);

      // Create the table
      await pool.query(`
        CREATE TABLE email_templates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          html_code TEXT NOT NULL,
          variables JSONB DEFAULT '[]'::jsonb,
          is_default BOOLEAN DEFAULT FALSE,
          from_email VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
        );
      `);

      // Create index
      await pool.query(`
        CREATE INDEX idx_email_templates_name ON email_templates(name);
      `);

      // Create trigger
      await pool.query(`
        CREATE TRIGGER update_email_templates_updated_at 
          BEFORE UPDATE ON email_templates
          FOR EACH ROW 
          EXECUTE FUNCTION update_updated_at_column();
      `);

      console.log('email_templates table created successfully');
    }

    const result = await pool.query(
      'SELECT * FROM email_templates ORDER BY created_at DESC'
    );
    res.json({ ok: true, templates: result.rows });
  } catch (error) {
    console.error('Get email templates error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to load templates',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/admin/email-templates/actions
 * Get list of available actions from unified_actions that can be assigned templates
 * IMPORTANT: This route must come BEFORE /email-templates/:id to avoid route conflicts
 */
router.get('/email-templates/actions', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ua.id,
        ua.action_name,
        ua.system_type,
        ua.template_id,
        et.name as assigned_template_name
      FROM unified_actions ua
      LEFT JOIN email_templates et ON ua.template_id = et.id
      ORDER BY ua.system_type, ua.action_name
    `);

    res.json({
      ok: true,
      actions: result.rows
    });
  } catch (error) {
    console.error('Get email template actions error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch actions'
    });
  }
});

/**
 * PUT /api/admin/email-templates/assign-action
 * Assign a template to an action in unified_actions
 * IMPORTANT: This route must come BEFORE /email-templates/:id to avoid route conflicts
 * Accepts either action_id (preferred) or action_type (for backward compatibility)
 */
router.put('/email-templates/assign-action', authenticateAdmin, async (req, res) => {
  try {
    console.log('📧 Assign-action route hit!', {
      body: req.body,
      hasAuth: !!req.headers.authorization,
      action_id: req.body?.action_id,
      template_id: req.body?.template_id
    });
    const { action_id, action_type, template_id } = req.body;

    let finalActionId = action_id;

    // If action_type is provided instead of action_id, look it up
    if (!finalActionId && action_type) {
      // Map common action_types to action_names for backward compatibility
      const actionTypeMap = {
        'account_creation': 'Welcome Email - Create Account',
        'mt5_account_created': 'MT5 Account Creation Email - on New MT5 Account',
        'deposit_request': 'Deposit Request Email - on Deposit Request',
        'withdrawal_request': 'Withdrawal Request Email - on Withdrawal Request',
        'transaction_completed': 'Transaction Completed Email',
        'internal_transfer': 'Internal Transfer Email - on Internal Transfer',
        'otp_verification': 'OTP Verification Email - on OTP Request',
        'kyc_completed': 'KYC Completion Email - on KYC Approval',
        'ticket_created': 'Ticket Email - on Ticket Creation',
        'ticket_response': 'Ticket Response Email - on Ticket Response',
        'password_reset': 'Forgot Password Email - on Forgot Password'
      };

      const mappedName = actionTypeMap[action_type];
      if (mappedName) {
        const mappedLookup = await pool.query(
          'SELECT id FROM unified_actions WHERE action_name = $1 LIMIT 1',
          [mappedName]
        );
        if (mappedLookup.rows.length > 0) {
          finalActionId = mappedLookup.rows[0].id;
        }
      }
    }

    if (!finalActionId) {
      return res.status(400).json({
        ok: false,
        error: 'action_id or action_type is required'
      });
    }

    // Verify action exists
    const actionCheck = await pool.query(
      'SELECT id, action_name FROM unified_actions WHERE id = $1',
      [finalActionId]
    );
    if (actionCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Action not found' });
    }

    // Verify template exists if provided
    if (template_id) {
      const templateCheck = await pool.query(
        'SELECT id FROM email_templates WHERE id = $1',
        [template_id]
      );
      if (templateCheck.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Template not found' });
      }
    }

    // Update unified_actions with template
    const result = await pool.query(
      `UPDATE unified_actions 
       SET template_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, action_name, system_type, template_id`,
      [template_id || null, finalActionId]
    );

    res.json({
      ok: true,
      message: template_id ? 'Template assigned successfully' : 'Template unassigned successfully',
      action: result.rows[0]
    });
  } catch (error) {
    console.error('Assign template to action error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to assign template',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/admin/email-templates/:id
router.get('/email-templates/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM email_templates WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }

    res.json({ ok: true, template: result.rows[0] });
  } catch (error) {
    console.error('Get email template error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/admin/email-templates
router.post('/email-templates', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, html_code, variables, is_default, from_email, action_type } = req.body;

    const result = await pool.query(
      `INSERT INTO email_templates 
       (name, description, html_code, variables, is_default, from_email, action_type, created_at, updated_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8)
       RETURNING *`,
      [
        name,
        description,
        html_code,
        JSON.stringify(variables || []),
        is_default || false,
        from_email,
        action_type || null,
        req.admin.adminId
      ]
    );

    res.json({ ok: true, template: result.rows[0] });
  } catch (error) {
    console.error('Create email template error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/admin/email-templates/:id
router.put('/email-templates/:id', authenticateAdmin, async (req, res) => {
  try {
    // Check if this is actually the assign-action route being matched incorrectly
    if (req.params.id === 'assign-action') {
      console.error('⚠️ Route conflict detected: /email-templates/:id matched "assign-action"');
      return res.status(500).json({
        ok: false,
        error: 'Route conflict: assign-action route should be defined before :id route'
      });
    }

    const { id } = req.params;
    const { name, description, html_code, variables, is_default, from_email, action_type } = req.body;

    const result = await pool.query(
      `UPDATE email_templates 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           html_code = COALESCE($3, html_code),
           variables = COALESCE($4, variables),
           is_default = COALESCE($5, is_default),
           from_email = COALESCE($6, from_email),
           action_type = COALESCE($7, action_type),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        name,
        description,
        html_code,
        variables ? JSON.stringify(variables) : null,
        is_default,
        from_email,
        action_type !== undefined ? action_type : null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }

    res.json({ ok: true, template: result.rows[0] });
  } catch (error) {
    console.error('Update email template error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/admin/email-templates/:id
router.delete('/email-templates/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM email_templates WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete email template error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/admin/email-templates/:id/send-test
router.post('/email-templates/:id/send-test', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, variables } = req.body;

    // Fetch template
    const tmplRes = await pool.query('SELECT * FROM email_templates WHERE id = $1', [id]);
    if (tmplRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    const template = tmplRes.rows[0];

    // Send email
    let htmlContent = template.html_code;

    // Replace variables
    if (variables && typeof variables === 'object') {
      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        htmlContent = htmlContent.replace(regex, variables[key]);
      });
    }

    // Also replace standard variables if not provided
    const logoUrl = getLogoUrl(); // Returns: https://portal.solitairemarkets.com/logo.svg
    const frontendUrl = process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com';
    const dashboardUrl = `${frontendUrl}/user/dashboard`;

    const standardVars = {
      logoUrl: logoUrl, // Use actual URL: https://portal.solitairemarkets.com/logo.svg
      companyEmail: 'support@solitairemarkets.me',
      dashboardUrl: dashboardUrl,
      frontendUrl: frontendUrl,
      currentYear: new Date().getFullYear(),
      recipientName: 'Test User'
    };

    Object.keys(standardVars).forEach(key => {
      if (!variables || !variables[key]) {
        // Match {{key}} or {{ key }} with optional spaces, case-insensitive
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        htmlContent = htmlContent.replace(regex, String(standardVars[key] || ''));
      }
    });

    // Force replace any remaining logoUrl variables (case-insensitive) - use actual URL
    htmlContent = htmlContent.replace(/\{\{\s*logoUrl\s*\}\}/gi, logoUrl);
    htmlContent = htmlContent.replace(/\{\{\s*logo_url\s*\}\}/gi, logoUrl);
    htmlContent = htmlContent.replace(/\{\{\s*LOGO_URL\s*\}\}/gi, logoUrl);

    // Replace any CID references with actual URL
    htmlContent = htmlContent.replace(/cid:solitaire-logo/gi, logoUrl);

    // Replace any base64 logo URLs with actual URL
    const base64Pattern = /data:image\/svg\+xml;base64,[^"'\s>]+/gi;
    htmlContent = htmlContent.replace(base64Pattern, logoUrl);
    console.log('📧 Replaced base64/CID logos with actual URL in test email');

    // Also replace dashboardUrl variations
    htmlContent = htmlContent.replace(/\{\{\s*dashboardUrl\s*\}\}/gi, dashboardUrl);
    htmlContent = htmlContent.replace(/\{\{\s*dashboard_url\s*\}\}/gi, dashboardUrl);
    htmlContent = htmlContent.replace(/\{\{\s*DASHBOARD_URL\s*\}\}/gi, dashboardUrl);

    // Ensure logo is always present in test emails
    const hasLogoImg = /<img[^>]*src[^>]*>/i.test(htmlContent) &&
      (htmlContent.toLowerCase().includes('logo') || htmlContent.toLowerCase().includes('solitaire') || htmlContent.includes(logoUrl));

    if (!hasLogoImg) {
      const bodyMatch = htmlContent.match(/<body[^>]*>/i);
      if (bodyMatch) {
        const logoHtml = `<div style="text-align: center; margin: 20px 0; padding: 20px 0;">
          <img src="${logoUrl}" alt="Solitaire Markets" style="height: 50px; max-width: 200px; display: block; margin: 0 auto;" />
        </div>`;
        htmlContent = htmlContent.replace(bodyMatch[0], bodyMatch[0] + logoHtml);
      }
    }

    await sendEmail({
      to: email,
      subject: `Test: ${template.name}`,
      html: htmlContent,
      includeLogo: true
    });

    // Log to sent_emails
    await pool.query(
      `INSERT INTO sent_emails 
       (recipient_email, recipient_name, subject, content_body, is_html, recipient_type, status, sent_at, admin_id)
       VALUES ($1, $2, $3, $4, TRUE, 'test', 'sent', NOW(), $5)`,
      [email, variables?.recipientName || 'Test User', `Test: ${template.name}`, htmlContent, req.admin.adminId]
    );

    res.json({ ok: true, message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/admin/sent-emails
router.get('/sent-emails', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    const result = await pool.query(
      `SELECT * FROM sent_emails ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countRes = await pool.query('SELECT COUNT(*) FROM sent_emails');

    res.json({
      ok: true,
      items: result.rows,
      total: parseInt(countRes.rows[0].count, 10)
    });
  } catch (error) {
    console.error('Get sent emails error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/admin/email-templates/preview
router.post('/email-templates/preview', authenticateAdmin, async (req, res) => {
  try {
    const { html_code, variables } = req.body;
    let previewHtml = html_code;

    // Default variables for preview
    const logoUrl = getLogoUrl();

    const defaultVars = {
      recipientName: 'John Doe',
      recipientEmail: 'john@example.com',
      subject: 'Email Subject',
      content: 'This is a sample content for preview.',
      currentYear: new Date().getFullYear(),
      companyName: 'Solitaire Markets',
      companyEmail: 'support@solitairemarkets.me',
      logoUrl: logoUrl,
      login: '123456',
      accountLogin: '123456',
      password: 'password123',
      accountType: 'Standard',
      amount: '1000.00',
      date: new Date().toLocaleDateString(),
      transactionType: 'Deposit',
      fromAccount: '123456',
      toAccount: '654321',
      otp: '123456',
      verificationMessage: 'Please verify your email address.',
      ...variables // Override with provided variables
    };

    console.log('🔍 Preview Request:', {
      hasHtml: !!html_code,
      variablesKeys: Object.keys(variables || {}),
      defaultVarsKeys: Object.keys(defaultVars)
    });

    // Replace variables (handle both {{key}} and {{ key }} formats, case-insensitive)
    Object.keys(defaultVars).forEach(key => {
      // Match {{key}} or {{ key }} with optional spaces, case-insensitive
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      previewHtml = previewHtml.replace(regex, String(defaultVars[key] || ''));
    });

    // Force replace any remaining logoUrl variables (case-insensitive)
    previewHtml = previewHtml.replace(/\{\{\s*logoUrl\s*\}\}/gi, logoUrl);
    previewHtml = previewHtml.replace(/\{\{\s*logo_url\s*\}\}/gi, logoUrl);
    previewHtml = previewHtml.replace(/\{\{\s*LOGO_URL\s*\}\}/gi, logoUrl);

    // Ensure logo is always present in preview
    const hasLogoImg = /<img[^>]*src[^>]*>/i.test(previewHtml) &&
      (previewHtml.includes('logo') || previewHtml.includes('Logo') || previewHtml.includes(logoUrl));

    if (!hasLogoImg) {
      // Try to inject logo after <body> tag
      const bodyMatch = previewHtml.match(/<body[^>]*>/i);
      if (bodyMatch) {
        const logoHtml = `<div style="text-align: center; margin: 20px 0; padding: 20px 0;">
          <img src="${logoUrl}" alt="Solitaire Markets" style="height: 50px; max-width: 200px; display: block; margin: 0 auto;" />
        </div>`;
        previewHtml = previewHtml.replace(bodyMatch[0], bodyMatch[0] + logoHtml);
      }
    }

    res.json({ ok: true, preview_html: previewHtml });
  } catch (error) {
    console.error('Preview template error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * ============================================
 * Admin and User Logs API Endpoints
 * ============================================
 */

/**
 * GET /api/admin/logs/admin
 * List all admin logs with filters
 */
router.get('/logs/admin', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      adminId,
      adminEmail,
      actionType,
      actionCategory,
      targetType,
      targetId,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
      search
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (adminId) {
      whereConditions.push(`admin_id = $${paramIndex}`);
      params.push(parseInt(adminId));
      paramIndex++;
    }

    if (adminEmail) {
      whereConditions.push(`admin_email ILIKE $${paramIndex}`);
      params.push(`%${adminEmail}%`);
      paramIndex++;
    }

    if (actionType) {
      whereConditions.push(`action_type = $${paramIndex}`);
      params.push(actionType);
      paramIndex++;
    }

    if (actionCategory) {
      whereConditions.push(`action_category = $${paramIndex}`);
      params.push(actionCategory);
      paramIndex++;
    }

    if (targetType) {
      whereConditions.push(`target_type = $${paramIndex}`);
      params.push(targetType);
      paramIndex++;
    }

    if (targetId) {
      whereConditions.push(`target_id = $${paramIndex}`);
      params.push(parseInt(targetId));
      paramIndex++;
    }

    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(description ILIKE $${paramIndex} OR admin_email ILIKE $${paramIndex} OR target_identifier ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM logs_of_admin ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get logs
    const logsResult = await pool.query(
      `SELECT 
        id, admin_id, admin_email, action_type, action_category, target_type, 
        target_id, target_identifier, description, request_method, request_path,
        response_status, ip_address, user_agent, created_at
       FROM logs_of_admin
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      ok: true,
      logs: logsResult.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get admin logs error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch admin logs'
    });
  }
});

/**
 * GET /api/admin/logs/admin/:adminId
 * Get logs for specific admin
 */
router.get('/logs/admin/:adminId', authenticateAdmin, async (req, res, next) => {
  try {
    const adminId = parseInt(req.params.adminId);
    const { limit = 100, offset = 0 } = req.query;

    if (isNaN(adminId)) {
      return res.status(400).json({ ok: false, error: 'Invalid admin ID' });
    }

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM logs_of_admin WHERE admin_id = $1',
      [adminId]
    );
    const total = parseInt(countResult.rows[0].total);

    const logsResult = await pool.query(
      `SELECT 
        id, admin_id, admin_email, action_type, action_category, target_type,
        target_id, target_identifier, description, request_method, request_path,
        response_status, ip_address, user_agent, created_at
       FROM logs_of_admin
       WHERE admin_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [adminId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      ok: true,
      logs: logsResult.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get admin logs by admin ID error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch admin logs'
    });
  }
});

/**
 * GET /api/admin/logs/admin/detail/:logId
 * Get detailed log entry for admin
 */
router.get('/logs/admin/detail/:logId', authenticateAdmin, async (req, res, next) => {
  try {
    const logId = parseInt(req.params.logId);

    if (isNaN(logId)) {
      return res.status(400).json({ ok: false, error: 'Invalid log ID' });
    }

    const result = await pool.query(
      `SELECT * FROM logs_of_admin WHERE id = $1`,
      [logId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Log not found' });
    }

    const log = result.rows[0];

    // Parse JSONB fields
    if (log.request_body) {
      try {
        log.request_body = typeof log.request_body === 'string'
          ? JSON.parse(log.request_body)
          : log.request_body;
      } catch (e) {
        log.request_body = null;
      }
    }

    if (log.response_body) {
      try {
        log.response_body = typeof log.response_body === 'string'
          ? JSON.parse(log.response_body)
          : log.response_body;
      } catch (e) {
        log.response_body = null;
      }
    }

    if (log.before_data) {
      try {
        log.before_data = typeof log.before_data === 'string'
          ? JSON.parse(log.before_data)
          : log.before_data;
      } catch (e) {
        log.before_data = null;
      }
    }

    if (log.after_data) {
      try {
        log.after_data = typeof log.after_data === 'string'
          ? JSON.parse(log.after_data)
          : log.after_data;
      } catch (e) {
        log.after_data = null;
      }
    }

    res.json({
      ok: true,
      log
    });
  } catch (error) {
    console.error('Get admin log detail error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch log detail'
    });
  }
});

/**
 * GET /api/admin/logs/user
 * List all user logs with filters
 */
router.get('/logs/user', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      userId,
      userEmail,
      actionType,
      actionCategory,
      targetType,
      targetId,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
      search
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (userId) {
      whereConditions.push(`user_id = $${paramIndex}`);
      params.push(parseInt(userId));
      paramIndex++;
    }

    if (userEmail) {
      whereConditions.push(`user_email ILIKE $${paramIndex}`);
      params.push(`%${userEmail}%`);
      paramIndex++;
    }

    if (actionType) {
      whereConditions.push(`action_type = $${paramIndex}`);
      params.push(actionType);
      paramIndex++;
    }

    if (actionCategory) {
      whereConditions.push(`action_category = $${paramIndex}`);
      params.push(actionCategory);
      paramIndex++;
    }

    if (targetType) {
      whereConditions.push(`target_type = $${paramIndex}`);
      params.push(targetType);
      paramIndex++;
    }

    if (targetId) {
      whereConditions.push(`target_id = $${paramIndex}`);
      params.push(parseInt(targetId));
      paramIndex++;
    }

    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(description ILIKE $${paramIndex} OR user_email ILIKE $${paramIndex} OR target_identifier ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM logs_of_users ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get logs
    const logsResult = await pool.query(
      `SELECT 
        id, user_id, user_email, action_type, action_category, target_type,
        target_id, target_identifier, description, request_method, request_path,
        response_status, ip_address, user_agent, created_at
       FROM logs_of_users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      ok: true,
      logs: logsResult.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get user logs error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch user logs'
    });
  }
});

/**
 * GET /api/admin/logs/user/:userId
 * Get logs for specific user
 */
router.get('/logs/user/:userId', authenticateAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const { limit = 100, offset = 0 } = req.query;

    if (isNaN(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM logs_of_users WHERE user_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0].total);

    const logsResult = await pool.query(
      `SELECT 
        id, user_id, user_email, action_type, action_category, target_type,
        target_id, target_identifier, description, request_method, request_path,
        response_status, ip_address, user_agent, created_at
       FROM logs_of_users
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      ok: true,
      logs: logsResult.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get user logs by user ID error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch user logs'
    });
  }
});

/**
 * GET /api/admin/logs/user/detail/:logId
 * Get detailed log entry for user
 */
router.get('/logs/user/detail/:logId', authenticateAdmin, async (req, res, next) => {
  try {
    const logId = parseInt(req.params.logId);

    if (isNaN(logId)) {
      return res.status(400).json({ ok: false, error: 'Invalid log ID' });
    }

    const result = await pool.query(
      `SELECT * FROM logs_of_users WHERE id = $1`,
      [logId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Log not found' });
    }

    const log = result.rows[0];

    // Parse JSONB fields
    if (log.request_body) {
      try {
        log.request_body = typeof log.request_body === 'string'
          ? JSON.parse(log.request_body)
          : log.request_body;
      } catch (e) {
        log.request_body = null;
      }
    }

    if (log.response_body) {
      try {
        log.response_body = typeof log.response_body === 'string'
          ? JSON.parse(log.response_body)
          : log.response_body;
      } catch (e) {
        log.response_body = null;
      }
    }

    if (log.before_data) {
      try {
        log.before_data = typeof log.before_data === 'string'
          ? JSON.parse(log.before_data)
          : log.before_data;
      } catch (e) {
        log.before_data = null;
      }
    }

    if (log.after_data) {
      try {
        log.after_data = typeof log.after_data === 'string'
          ? JSON.parse(log.after_data)
          : log.after_data;
      } catch (e) {
        log.after_data = null;
      }
    }

    res.json({
      ok: true,
      log
    });
  } catch (error) {
    console.error('Get user log detail error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch log detail'
    });
  }
});

/**
 * ============================================
 * IB Requests Integration
 * ============================================
 */

/**
 * GET /api/admin/ib-requests/pending
 * Fetch pending IB requests from IB database
 */
router.get('/ib-requests/pending', authenticateAdmin, async (req, res) => {
  try {
    // Try to connect to IB database using IB_DATABASE_URL or same database
    const ibDatabaseUrl = process.env.IB_DATABASE_URL || process.env.DATABASE_URL;

    if (!ibDatabaseUrl) {
      return res.status(500).json({
        ok: false,
        error: 'IB database connection not configured'
      });
    }

    // Create a temporary pool for IB database connection
    const { Pool } = await import('pg');
    const ibPool = new Pool({
      connectionString: ibDatabaseUrl,
      ssl: process.env.NODE_ENV === 'production' || ibDatabaseUrl.includes('render.com')
        ? { rejectUnauthorized: false }
        : false
    });

    try {
      // Query pending IB requests
      const result = await ibPool.query(
        `SELECT 
          id,
          full_name,
          email,
          status,
          ib_type,
          country,
          referral_code,
          submitted_at,
          created_at,
          admin_comments
        FROM ib_requests
        WHERE status = 'pending'
        ORDER BY submitted_at DESC, created_at DESC
        LIMIT 100`
      );

      await ibPool.end();

      res.json({
        ok: true,
        requests: result.rows || []
      });
    } catch (dbError) {
      await ibPool.end();
      throw dbError;
    }
  } catch (error) {
    console.error('Error fetching pending IB requests:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch pending IB requests'
    });
  }
});

/**
 * POST /api/admin/ib-requests/cross-login
 * Generate a cross-login token for IB admin if credentials match
 */
router.post('/ib-requests/cross-login', authenticateAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    const adminEmail = req.admin?.email || email;

    if (!adminEmail) {
      return res.status(400).json({
        ok: false,
        error: 'Email is required'
      });
    }

    // Try to connect to IB database to find matching admin
    const ibDatabaseUrl = process.env.IB_DATABASE_URL || process.env.DATABASE_URL;

    if (!ibDatabaseUrl) {
      return res.status(500).json({
        ok: false,
        error: 'IB database connection not configured'
      });
    }

    const { Pool } = await import('pg');
    const ibPool = new Pool({
      connectionString: ibDatabaseUrl,
      ssl: process.env.NODE_ENV === 'production' || ibDatabaseUrl.includes('render.com')
        ? { rejectUnauthorized: false }
        : false
    });

    try {
      // Check if admin exists in IB admin table
      const adminResult = await ibPool.query(
        `SELECT id, email, full_name, is_active 
         FROM ib_admins 
         WHERE email = $1 AND is_active = true`,
        [adminEmail.toLowerCase()]
      );

      await ibPool.end();

      if (adminResult.rows.length === 0) {
        return res.json({
          ok: false,
          error: 'No matching IB admin found with the same email'
        });
      }

      // Generate a JWT token for IB admin (using IB's JWT secret if available)
      const jwt = await import('jsonwebtoken');
      const ibJwtSecret = process.env.IB_JWT_SECRET || process.env.JWT_SECRET || 'dev-secret';

      const ibAdmin = adminResult.rows[0];
      const ibToken = jwt.default.sign(
        {
          id: ibAdmin.id,
          email: ibAdmin.email,
          role: 'admin'
        },
        ibJwtSecret,
        { expiresIn: '1h' }
      );

      res.json({
        ok: true,
        ibToken,
        admin: {
          id: ibAdmin.id,
          email: ibAdmin.email,
          full_name: ibAdmin.full_name
        }
      });
    } catch (dbError) {
      await ibPool.end();
      throw dbError;
    }
  } catch (error) {
    console.error('Error generating cross-login token:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to generate cross-login token'
    });
  }
});

export default router;

