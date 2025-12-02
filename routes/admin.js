import express from 'express';
import pool from '../config/database.js';
import { comparePassword } from '../utils/helpers.js';
import { validateLogin } from '../middleware/validate.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import * as mt5Service from '../services/mt5.service.js';

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

/**
 * ============================================
 * MT5 Admin Routes
 * ============================================
 */

/**
 * GET /api/admin/mt5/users
 * Get all MT5 users/accounts
 */
router.get('/mt5/users', authenticateAdmin, async (req, res, next) => {
  try {
    const { limit = 100, offset = 0, search } = req.query;

    let query = `
      SELECT 
        ta.id,
        ta.account_number,
        ta.api_account_number,
        ta.platform,
        ta.account_type,
        ta.currency,
        ta.leverage,
        ta.account_status,
        ta.mt5_group_name,
        ta.created_at,
        u.id as user_id,
        u.email as user_email,
        u.first_name,
        u.last_name
      FROM trading_accounts ta
      INNER JOIN users u ON ta.user_id = u.id
      WHERE ta.platform = 'MT5'
    `;
    const params = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (
        ta.api_account_number::text ILIKE $${paramCount} OR
        u.email ILIKE $${paramCount} OR
        u.first_name ILIKE $${paramCount} OR
        u.last_name ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY ta.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM trading_accounts WHERE platform = 'MT5'`
    );

    res.json({
      success: true,
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get MT5 users error:', error);
    next(error);
  }
});

/**
 * GET /api/admin/mt5/account/:accountId
 * Get MT5 account details
 */
router.get('/mt5/account/:accountId', authenticateAdmin, async (req, res, next) => {
  try {
    const { accountId } = req.params;

    const result = await pool.query(
      `SELECT 
        ta.*,
        u.email as user_email,
        u.first_name,
        u.last_name,
        u.country as user_country
      FROM trading_accounts ta
      INNER JOIN users u ON ta.user_id = u.id
      WHERE ta.api_account_number = $1 OR ta.account_number = $1`,
      [accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get MT5 account error:', error);
    next(error);
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
    const { accountId, email } = req.body;

    if (!accountId || !email) {
      return res.status(400).json({
        success: false,
        message: 'Account ID and email are required'
      });
    }

    // Find user by email
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userId = userResult.rows[0].id;

    // Check if account exists and is not already assigned
    const accountResult = await pool.query(
      'SELECT id, user_id FROM trading_accounts WHERE api_account_number = $1 OR account_number = $1',
      [accountId.toString()]
    );

    if (accountResult.rows.length === 0) {
      // Account doesn't exist in our DB, create it
      const insertResult = await pool.query(
        `INSERT INTO trading_accounts (
          user_id, account_number, platform, account_type, currency,
          api_account_number, account_status, trading_server
        ) VALUES ($1, $2, 'MT5', 'standard', 'USD', $3, 'active', 'Solitaire Markets-Live')
        RETURNING *`,
        [userId, accountId.toString(), accountId.toString()]
      );

      return res.json({
        success: true,
        message: 'Account assigned successfully',
        data: insertResult.rows[0]
      });
    }

    // Update existing account
    const updateResult = await pool.query(
      'UPDATE trading_accounts SET user_id = $1 WHERE id = $2 RETURNING *',
      [userId, accountResult.rows[0].id]
    );

    res.json({
      success: true,
      message: 'Account assigned successfully',
      data: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Assign MT5 account error:', error);
    next(error);
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

export default router;

