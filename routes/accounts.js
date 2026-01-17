import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { comparePassword, encryptPassword, generateRandomPassword } from '../utils/helpers.js';
import * as mt5Service from '../services/mt5.service.js';
import dotenv from 'dotenv';
import { logUserAction } from '../services/logging.service.js';
import { sendMT5AccountCreatedEmail } from '../services/templateEmail.service.js';

dotenv.config();

const MT5_API_URL = process.env.MT5_API_URL || 'http://13.43.216.232:5003/api';

const router = express.Router();

/**
 * GET /api/accounts/groups
 * Get all active MT5 groups
 */
router.get('/groups', authenticate, async (req, res, next) => {
  try {
    // Step 1: Check if user has a commission chain (referral restriction)
    const ibRequestRes = await pool.query(
      `SELECT commission_chain, ib_level, ib_type FROM ib_requests WHERE user_id = $1 AND status = 'approved'`,
      [req.user.id]
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
      [req.user.id, restrictedGroups]
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
      'created_at',
      'balance',
      'equity'
    ];

    const optionalCols = [];
    const hasMt5GroupName = existingCols.has('mt5_group_name');
    const hasMt5GroupId = existingCols.has('mt5_group_id');
    const hasGroup = existingCols.has('group');

    if (hasMt5GroupName) optionalCols.push('mt5_group_name');
    if (hasMt5GroupId) optionalCols.push('mt5_group_id');
    if (hasGroup) optionalCols.push('group');

    const selectCols = baseCols.concat(optionalCols);

    // Build query with LEFT JOIN to mt5_groups to get limits
    // Try to join using ALL possible columns (OR conditions)
    const joinConditions = [];
    if (hasMt5GroupId) {
      // Try ID first (most reliable)
      joinConditions.push('ta.mt5_group_id = mg.id');
    }
    if (hasMt5GroupName) {
      // Try exact match
      joinConditions.push('ta.mt5_group_name = mg.group_name');
      // Try case-insensitive match
      joinConditions.push('LOWER(ta.mt5_group_name) = LOWER(mg.group_name)');
    }
    if (hasGroup) {
      joinConditions.push('ta.group = mg.group_name');
      // Try case-insensitive match
      joinConditions.push('LOWER(ta.group) = LOWER(mg.group_name)');
    }
    // Also try matching account_type with dedicated_name (fallback)
    if (existingCols.has('account_type')) {
      joinConditions.push(`LOWER(ta.account_type) = LOWER(mg.dedicated_name)`);
      // Try matching "Pro" with group names containing "pro"
      joinConditions.push(`LOWER(ta.account_type) = LOWER(SUBSTRING(mg.group_name FROM '[^\\\\]+$'))`);
    }

    // Build query with LEFT JOIN to mt5_groups to get limits
    // Use DISTINCT ON (account_number) to prevent duplicates when multiple JOIN conditions match
    // account_number is UNIQUE, so this ensures one row per account
    let query = `
      SELECT DISTINCT ON (ta.account_number)
        ${selectCols.map(col => `ta.${col}`).join(', ')},
    `;

    // Only add JOIN if we have a way to join, otherwise use NULL for limits
    if (joinConditions.length > 0) {
      // Prioritize JOIN conditions: ID first, then exact matches, then case-insensitive
      const prioritizedConditions = [];
      if (hasMt5GroupId) {
        prioritizedConditions.push('ta.mt5_group_id = mg.id');
      }
      if (hasMt5GroupName) {
        prioritizedConditions.push('ta.mt5_group_name = mg.group_name');
      }
      if (hasGroup) {
        prioritizedConditions.push('ta.group = mg.group_name');
      }
      // Add case-insensitive matches as fallback
      if (hasMt5GroupName) {
        prioritizedConditions.push('LOWER(ta.mt5_group_name) = LOWER(mg.group_name)');
      }
      if (hasGroup) {
        prioritizedConditions.push('LOWER(ta.group) = LOWER(mg.group_name)');
      }
      if (existingCols.has('account_type')) {
        prioritizedConditions.push(`LOWER(ta.account_type) = LOWER(mg.dedicated_name)`);
        prioritizedConditions.push(`LOWER(ta.account_type) = LOWER(SUBSTRING(mg.group_name FROM '[^\\\\]+$'))`);
      }

      const joinCondition = prioritizedConditions.join(' OR ');
      query += `
        COALESCE(mg.minimum_deposit, 0) as minimum_deposit,
        mg.maximum_deposit,
        COALESCE(mg.minimum_withdrawal, 0) as minimum_withdrawal,
        mg.maximum_withdrawal
      FROM trading_accounts ta
      LEFT JOIN mt5_groups mg ON (${joinCondition}) AND mg.is_active = TRUE
      `;
    } else {
      query += `
        0::DECIMAL(15,2) as minimum_deposit,
        NULL::DECIMAL(15,2) as maximum_deposit,
        0::DECIMAL(15,2) as minimum_withdrawal,
        NULL::DECIMAL(15,2) as maximum_withdrawal
      FROM trading_accounts ta
      `;
    }

    query += `
      WHERE ta.user_id = $1
      ORDER BY ta.account_number, ta.created_at DESC
    `;

    const result = await pool.query(query, [req.user.id]);

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
         is_demo,
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
      currency: row.currency,
      isDemo: row.is_demo || false
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

    const responseData = {
      ...accountResult.rows[0],
      // Include non-sensitive account info from MT5 API response
      mt5Response: mt5Login
    };

    // Return response with account details (don't include encrypted passwords)
    res.json({
      success: true,
      message: 'Account created successfully',
      data: responseData
    });

    // Log user action and send email
    setImmediate(async () => {
      await logUserAction({
        userId: req.user.id,
        userEmail: req.user.email,
        actionType: 'mt5_account_create',
        actionCategory: 'mt5',
        targetType: 'mt5_account',
        targetId: newId,
        targetIdentifier: accountResult.rows[0].account_number?.toString() || mt5Login?.toString(),
        description: `Created MT5 account: ${accountResult.rows[0].account_number || mt5Login} (Group: ${mt5Group.group_name}, Leverage: ${finalLeverage})`,
        req,
        res,
        beforeData: null,
        afterData: responseData
      });

      // Send MT5 account created email
      try {
        const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Valued Customer';
        await sendMT5AccountCreatedEmail(
          user.email,
          userName,
          accountType,
          accountNumber, // This is the login (MT5 account number)
          masterPasswordValue // Master password for MT5 login
        );
        console.log(`MT5 account created email sent to ${user.email}`);
      } catch (emailError) {
        console.error('Failed to send MT5 account created email:', emailError);
        // Don't fail account creation if email fails
      }
    });
  } catch (error) {
    console.error('Create account error:', error);
    next(error);
  }
});

/**
 * PUT /api/accounts/:accountNumber/password
 * Change MT5 account password
 */
router.put('/:accountNumber/password', authenticate, async (req, res, next) => {
  try {
    const { accountNumber } = req.params;
    const { password } = req.body;
    const userId = req.user.id;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    // Verify account ownership
    const accountCheck = await pool.query(
      'SELECT id, account_number, user_id FROM trading_accounts WHERE account_number = $1 AND user_id = $2 AND platform = \'MT5\'',
      [accountNumber, userId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Account not found or does not belong to you'
      });
    }

    // Call MT5 Service
    try {
      await mt5Service.changePassword(parseInt(accountNumber, 10), password, 'master');

      // Update local DB
      const encryptedPassword = encryptPassword(password);
      await pool.query(
        'UPDATE trading_accounts SET master_password = $1, updated_at = NOW() WHERE account_number = $2',
        [encryptedPassword, accountNumber]
      );

      // Log action
      await logUserAction({
        userId: req.user.id,
        userEmail: req.user.email,
        actionType: 'mt5_password_change',
        actionCategory: 'mt5',
        targetType: 'mt5_account',
        targetId: accountCheck.rows[0].id,
        targetIdentifier: accountNumber,
        description: `Changed password for MT5 account ${accountNumber}`,
        req,
        res
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (mt5Error) {
      console.error('MT5 Password Change Error:', mt5Error);
      return res.status(400).json({
        success: false,
        message: mt5Error.message || 'Failed to change password on MT5 server'
      });
    }

  } catch (error) {
    console.error('Change password error:', error);
    next(error);
  }
});

/**
 * PUT /api/accounts/:accountNumber/leverage
 * Change MT5 account leverage
 */
router.put('/:accountNumber/leverage', authenticate, async (req, res, next) => {
  try {
    const { accountNumber } = req.params;
    const { leverage } = req.body;
    const userId = req.user.id;

    if (!leverage) {
      return res.status(400).json({
        success: false,
        message: 'Leverage is required'
      });
    }

    const newLeverage = parseInt(leverage, 10);
    if (isNaN(newLeverage) || newLeverage <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid leverage value'
      });
    }

    // Verify account ownership and check checks
    const accountCheck = await pool.query(
      'SELECT id, account_number, user_id, is_swap_free FROM trading_accounts WHERE account_number = $1 AND user_id = $2 AND platform = \'MT5\'',
      [accountNumber, userId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Account not found or does not belong to you'
      });
    }

    const account = accountCheck.rows[0];

    // Enforce swap-free limit
    if (account.is_swap_free && newLeverage > 500) {
      return res.status(400).json({
        success: false,
        message: 'Swap-free accounts cannot have leverage higher than 1:500'
      });
    }

    // Call MT5 Service
    try {
      await mt5Service.updateUser(parseInt(accountNumber, 10), { leverage: newLeverage });

      // Update local DB
      await pool.query(
        'UPDATE trading_accounts SET leverage = $1, updated_at = NOW() WHERE account_number = $2',
        [newLeverage, accountNumber]
      );

      // Log action
      await logUserAction({
        userId: req.user.id,
        userEmail: req.user.email,
        actionType: 'mt5_leverage_change',
        actionCategory: 'mt5',
        targetType: 'mt5_account',
        targetId: account.id,
        targetIdentifier: accountNumber,
        description: `Changed leverage for MT5 account ${accountNumber} to 1:${newLeverage}`,
        req,
        res
      });

      res.json({
        success: true,
        message: 'Leverage changed successfully',
        data: { leverage: newLeverage }
      });

    } catch (mt5Error) {
      console.error('MT5 Leverage Change Error:', mt5Error);
      return res.status(400).json({
        success: false,
        message: mt5Error.message || 'Failed to update leverage on MT5 server'
      });
    }

  } catch (error) {
    console.error('Change leverage error:', error);
    next(error);
  }
});

export default router;

