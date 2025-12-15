import express from 'express';
import pool from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/helpers.js';
import { validateLogin } from '../middleware/validate.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import * as mt5Service from '../services/mt5.service.js';
import { createWalletForUser } from '../services/wallet.service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
        success: false,
        message: 'No token provided or invalid format'
      });
    }

    const token = authHeader.substring(7);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'your-secret-key');

    // Check if it's an admin token
    if (!decoded.adminId) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Token verification failed'
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
      'SELECT id, username, email, password_hash, admin_role, is_active, login_attempts, locked_until FROM admin WHERE email = $1',
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
 * Admin Users & Country Admins
 * ============================================
 */

/**
 * GET /api/admin/country-admins
 * List all country admins (used for scoping users list)
 */
router.get('/country-admins', authenticateAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, status, country_code AS country, features, created_at, updated_at
       FROM country_admins
       ORDER BY created_at DESC`
    );
    // Frontend expects a plain array
    res.json(result.rows);
  } catch (error) {
    console.error('Get country admins error:', error);
    next(error);
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

    res.status(201).json({
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

    res.json({
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
 * POST /api/admin/email-templates/preview
 * Return HTML preview for a given template body
 */
router.post('/email-templates/preview', authenticateAdmin, async (req, res) => {
  try {
    const { html_code = '' } = req.body || {};

    // If no HTML provided, return empty preview
    if (!html_code.trim()) {
      return res.json({ ok: true, preview_html: '' });
    }

    // For now, just echo back the HTML for preview purposes.
    // If sanitization is needed, this is the place to add it.
    res.json({
      ok: true,
      preview_html: html_code
    });
  } catch (error) {
    console.error('Email template preview error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to generate preview'
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

    // Update email verification status
    await pool.query(
      'UPDATE users SET is_email_verified = $1 WHERE id = $2',
      [verified, userId]
    );

    res.json({
      ok: true,
      message: `Email ${verified ? 'verified' : 'unverified'} successfully`
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
      // Set KYC as approved
      await pool.query(
        `INSERT INTO kyc_verifications (user_id, status, reviewed_at)
         VALUES ($1, 'approved', NOW())
         ON CONFLICT (user_id) WHERE status = 'pending'
         DO UPDATE SET status = 'approved', reviewed_at = NOW()`,
        [userId]
      );
    } else {
      // Set KYC as pending or remove approval
      await pool.query(
        `UPDATE kyc_verifications 
         SET status = 'pending', reviewed_at = NULL
         WHERE user_id = $1`,
        [userId]
      );
    }

    res.json({
      ok: true,
      message: `KYC ${verified ? 'verified' : 'unverified'} successfully`
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
      verificationStatus: row.verificationStatus || 'Pending',
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
    const kycId = parseInt(req.params.id);
    if (Number.isNaN(kycId)) {
      return res.status(400).json({ ok: false, error: 'Invalid KYC id' });
    }

    const {
      verificationStatus,
      documentReference,
      addressReference
    } = req.body;

    // Check if KYC record exists
    const kycCheck = await pool.query('SELECT id FROM kyc_verifications WHERE id = $1', [kycId]);
    if (kycCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'KYC record not found' });
    }

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
 * DELETE /api/admin/users/:id
 * Delete a user and all related data (cascade deletes)
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

    // MT5 accounts for this user - fail-safe if trading_accounts is missing
    let MT5Account = [];
    try {
      const mt5Result = await pool.query(
        // Use trading_accounts.account_number as the MT5 account/login
        `SELECT account_number, mt5_group_name, created_at
         FROM trading_accounts
         WHERE user_id = $1 AND platform = 'MT5'
         ORDER BY created_at DESC`,
        [userId]
      );

      MT5Account = mt5Result.rows.map(row => ({
        // Admin panel should use the trading account number as MT5 login
        accountId: row.account_number || null,
        group: row.mt5_group_name || null,
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
      MT5Account
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
    let whereClause = '';

    if (typeof is_active === 'string' && is_active !== '') {
      params.push(is_active === 'true');
      whereClause = 'WHERE is_active = $1';
    }

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

    const result = await mt5Service.getUserProfile(login);

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

    res.json({
      ok: true,
      message: 'MT5 account assigned successfully',
      account: tradingAccount
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
        (type, name, type_data, icon_path, qr_code_path, is_active, is_recommended, display_order, instructions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        instructions
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
      details: parsedTypeData.details || null
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
      details: parsedTypeData.details || null
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

    const result = await pool.query(
      `UPDATE manual_payment_gateways 
      SET 
        type = $1,
        name = $2,
        type_data = $3,
        icon_path = $4,
        qr_code_path = $5,
        is_active = $6,
        is_recommended = $7,
        display_order = $8,
        instructions = $9,
        updated_at = NOW()
      WHERE id = $10
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
        id
      ]
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
      details: parsedTypeData.details || null
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
router.get('/deposits', authenticateAdmin, async (req, res) => {
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
router.post('/deposits/:id/approve', authenticateAdmin, async (req, res) => {
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
        // Wallet deposits - skip for now, will be handled later
        console.log(`Wallet deposit #${deposit.id} approved but balance not added yet (will be handled later)`);
      }
    } catch (balanceError) {
      console.error('Error adding balance:', balanceError);
      // Rollback the approval if balance update fails for MT5
      if (deposit.deposit_to_type === 'mt5') {
        await pool.query(
          `UPDATE deposit_requests 
           SET status = 'pending', updated_at = NOW()
           WHERE id = $1`,
          [id]
        );
        return res.status(500).json({
          ok: false,
          error: `Failed to add balance to MT5 account: ${balanceError.message}`
        });
      }
      // For wallet deposits, just log the error but don't rollback
    }

    res.json({
      ok: true,
      message: 'Deposit approved successfully'
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
router.post('/deposits/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

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

    res.json({
      ok: true,
      message: 'Deposit rejected successfully'
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
router.get('/withdrawals', authenticateAdmin, async (req, res) => {
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
router.post('/withdrawals/:id/approve', authenticateAdmin, async (req, res) => {
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

    res.json({
      ok: true,
      message: 'Withdrawal approved successfully'
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
router.post('/withdrawals/:id/reject', authenticateAdmin, async (req, res) => {
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

    res.json({
      ok: true,
      message: 'Withdrawal rejected successfully'
    });
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to reject withdrawal'
    });
  }
});

export default router;

