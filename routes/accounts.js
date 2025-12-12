import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { comparePassword, encryptPassword, generateRandomPassword } from '../utils/helpers.js';
import * as mt5Service from '../services/mt5.service.js';
import dotenv from 'dotenv';

dotenv.config();

const MT5_API_URL = process.env.MT5_API_URL || 'http://13.43.216.232:5003/api';

const router = express.Router();

/**
 * GET /api/accounts/groups
 * Get all active MT5 groups
 */
router.get('/groups', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, group_name, dedicated_name, currency, demo_leverage, 
        margin_call, margin_stop_out, trade_flags
       FROM mt5_groups
       WHERE is_active = TRUE
       ORDER BY dedicated_name NULLS LAST, group_name ASC`,
      []
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get MT5 groups error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch MT5 groups',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/accounts/:accountNumber/balance
 * Get real-time balance data from MT5 API for a specific account
 * This route must come before the root '/' route to avoid route conflicts
 */
router.get('/:accountNumber/balance', authenticate, async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const userId = req.user.id;

    // Verify the account belongs to this user
    const accountCheck = await pool.query(
      'SELECT id, account_number, user_id FROM trading_accounts WHERE account_number = $1 AND user_id = $2 AND platform = \'MT5\'',
      [accountNumber, userId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
    }

    // Fetch balance from MT5 API
    try {
      const login = parseInt(accountNumber, 10);
      if (Number.isNaN(login)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid account number'
        });
      }

      const profileResult = await mt5Service.getClientProfile(login);

      if (profileResult.success && profileResult.data && profileResult.data.Success && profileResult.data.Data) {
        const mt5Data = profileResult.data.Data;

        // Update balance in database
        await pool.query(
          `UPDATE trading_accounts 
           SET balance = $1, equity = $2, credit = $3, free_margin = $4, margin = $5, leverage = $6, updated_at = NOW()
           WHERE account_number = $7 AND user_id = $8`,
          [
            parseFloat(mt5Data.Balance || 0),
            parseFloat(mt5Data.Equity || 0),
            parseFloat(mt5Data.Credit || 0),
            parseFloat(mt5Data.MarginFree || 0),
            parseFloat(mt5Data.Margin || 0),
            parseInt(mt5Data.Leverage || 2000),
            accountNumber,
            userId
          ]
        );

        res.json({
          success: true,
          data: {
            leverage: mt5Data.Leverage || 2000,
            equity: parseFloat(mt5Data.Equity || 0),
            balance: parseFloat(mt5Data.Balance || 0),
            margin: parseFloat(mt5Data.Margin || 0),
            credit: parseFloat(mt5Data.Credit || 0),
            marginFree: parseFloat(mt5Data.MarginFree || 0)
          }
        });
      } else {
        throw new Error(profileResult.data?.Message || 'Failed to fetch client profile');
      }
    } catch (mt5Error) {
      console.error('MT5 API error:', mt5Error);
      res.status(500).json({
        success: false,
        error: mt5Error.message || 'Failed to fetch balance from MT5'
      });
    }
  } catch (error) {
    console.error('Get account balance error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch account balance'
    });
  }
});

/**
 * GET /api/accounts
 * Get all trading accounts for logged in user
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    // Check for optional columns
    const colsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'trading_accounts'`
    );
    const existingCols = new Set(colsRes.rows.map((r) => r.column_name));

    // Base columns we always expect
    const baseCols = [
      'id',
      'account_number',
      'platform',
      'account_type',
      'currency',
      'is_swap_free',
      'is_copy_account',
      'leverage',
      'reason_for_account',
      'account_status',
      'is_demo',
      'trading_server',
      'created_at'
    ];

    const optionalCols = [];
    if (existingCols.has('mt5_group_name')) optionalCols.push('mt5_group_name');

    const selectCols = baseCols.concat(optionalCols);

    const result = await pool.query(
      `SELECT ${selectCols.join(', ')}
       FROM trading_accounts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      userId: req.user?.id
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch accounts',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/accounts/activity
 * Get account-related activity for the logged in user (account openings, etc.)
 */
router.get('/activity', authenticate, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    // Total count of accounts for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) AS count
       FROM trading_accounts
       WHERE user_id = $1`,
      [req.user.id]
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Fetch accounts as "activities" (account opening events)
    const result = await pool.query(
      `SELECT 
         id,
         account_number,
         platform,
         account_type,
         currency,
         created_at
       FROM trading_accounts
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const items = result.rows.map((row) => ({
      id: row.id,
      time: row.created_at,
      title: 'New account application',
      status: 'Success',
      accountNumber: row.account_number,
      platform: row.platform,
      accountType: row.account_type,
      currency: row.currency
    }));

    res.json({
      success: true,
      data: {
        items,
        total
      }
    });
  } catch (error) {
    console.error('Get account activity error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch account activity'
    });
  }
});

/**
 * POST /api/accounts/create
 * Create a new trading account via MetaAPI
 */
router.post('/create', authenticate, async (req, res, next) => {
  try {
    const {
      platform,
      mt5GroupId,
      leverage,
      isSwapFree,
      isCopyAccount,
      reasonForAccount,
      masterPassword,
      portalPassword,
      isDemo
    } = req.body;

    // Validation
    if (!platform || !mt5GroupId || !leverage || !portalPassword || !masterPassword) {
      return res.status(400).json({
        success: false,
        message: 'Platform, MT5 group, leverage, master password, and portal password are required'
      });
    }

    // Only MT5 is allowed
    if (platform !== 'MT5') {
      return res.status(400).json({
        success: false,
        message: 'Only MetaTrader 5 is supported'
      });
    }

    // Verify portal password (compare with user's password hash)
    const userResult = await pool.query(
      'SELECT password_hash, email, first_name, last_name, phone_code, phone_number, country FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify password using helper function
    const isPasswordValid = await comparePassword(portalPassword, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid portal password'
      });
    }

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
    let groupName = mt5Group.group_name; // Original group name from DB

    // Normalize backslashes for MT5 API:
    // Collapse ANY run of backslashes into a single backslash so the final
    // value is always like: real\Bbook\Pro\dynamic-2000x-10P
    if (groupName) {
      groupName = groupName.replace(/\\+/g, '\\');
    }
    const currency = mt5Group.currency || 'USD';

    // Use leverage from form, but adjust if swap free
    let finalLeverage = parseInt(leverage);
    if (isSwapFree && finalLeverage > 500) {
      finalLeverage = 500; // Max leverage for swap free accounts
    }

    // Generate passwords
    // Master password: use value provided by user in form
    const masterPasswordValue = masterPassword;
    // Main password (internal only): generate random
    const mainPassword = generateRandomPassword(12);
    // Investor password: fixed prefix + random 3‑digit number, e.g. SolitaireINV@899
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
      group: groupName, // Use group_name from database
      leverage: finalLeverage, // Just the number (50, 100, 200, etc.)
      masterPassword: masterPassword, // Portal password
      investorPassword: investorPassword, // Random + Inv@900
      email: user.email,
      country: country,
      city: '', // Empty string - city not saved in database
      phone: phone,
      comment: reasonForAccount || 'Created via API'
    };

    // Call MT5 Manager API using /Users endpoint
    let mt5Response;
    try {
      const result = await mt5Service.createAccount(accountData);
      mt5Response = result.data;
      console.log('MT5 account created successfully:', JSON.stringify(mt5Response, null, 2));
    } catch (apiError) {
      console.error('MT5 API error:', apiError);
      console.error('Error details:', {
        message: apiError.message,
        stack: apiError.stack
      });
      return res.status(500).json({
        success: false,
        message: apiError.message || 'Failed to create account via MT5 API. Please try again later.'
      });
    }

    // Extract account number (login) from MT5 response – be defensive and scan deeply
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
    // Use the investor password we generated (with Inv@900 suffix)
    const finalInvestorPassword = investorPassword;

    let accountNumber;
    if (mt5Login) {
      // Use real MT5 login as our trading_accounts.account_number
      accountNumber = String(mt5Login);
    } else {
      // Fallback: generate internal account number so DB insert still works
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
    const encryptedMasterPassword = encryptPassword(masterPasswordValue);
    const encryptedMainPassword = encryptPassword(mainPassword);
    const encryptedInvestorPassword = encryptPassword(finalInvestorPassword);

    // Determine trading server
    const tradingServer = isDemo ? 'Solitaire Markets-Demo' : 'Solitaire Markets-Live';

    // Determine account type based on group
    // Use the dedicated name if available, otherwise fall back to group name or 'standard'
    const accountType = mt5Group.dedicated_name || mt5Group.group_name || 'standard';

    // Discover existing columns on trading_accounts to be backward compatible
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

    addField('user_id', req.user.id);
    addField('account_number', accountNumber);
    addField('platform', platform);
    addField('account_type', accountType);
    addField('currency', currency);
    addField('is_swap_free', isSwapFree || false);
    addField('is_copy_account', isCopyAccount || false);
    addField('leverage', finalLeverage);
    addField('reason_for_account', reasonForAccount || null);
    addField('trading_server', tradingServer);
    addField('mt5_group_id', mt5GroupId);
    addField('mt5_group_name', groupName);
    addField('name', accountName);
    addField('master_password', encryptedMasterPassword);
    addField('password', encryptedMainPassword);
    addField('email', user.email);
    addField('country', country);
    addField('city', ''); // city not stored yet
    addField('phone', phone);
    addField('comment', reasonForAccount || '');
    addField('investor_password', encryptedInvestorPassword);
    // Add is_demo flag
    addField('is_demo', !!isDemo);

    const placeholders = insertFields.map((_, idx) => `$${idx + 1}`).join(', ');

    // First insert, returning only id
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
        // Update local DB balance
        await pool.query(
          'UPDATE trading_accounts SET balance = $1, equity = $1 WHERE account_number = $2',
          [depositAmount, accountNumber]
        );
      } catch (depError) {
        console.error('Failed to add demo deposit:', depError);
        // Non-blocking error
      }
    }

    const newId = insertResult.rows[0].id;

    // Fetch a stable view of the new account for the response
    const selectCols = [
      'id',
      'account_number',
      'platform',
      'account_type',
      'currency',
      'is_swap_free',
      'is_copy_account',
      'leverage',
      'trading_server',
      'trading_server',
      'created_at',
      'is_demo'
    ];
    if (existingCols.has('mt5_group_name')) {
      selectCols.push('mt5_group_name');
    }

    const accountResult = await pool.query(
      `SELECT ${selectCols.join(', ')} FROM trading_accounts WHERE id = $1`,
      [newId]
    );

    // Return response with account details (don't include encrypted passwords)
    res.json({
      success: true,
      message: 'Account created successfully',
      data: {
        ...accountResult.rows[0],
        // Include non-sensitive account info from MT5 API response
        mt5Response: mt5Login
      }
    });
  } catch (error) {
    console.error('Create account error:', error);
    next(error);
  }
});

export default router;

