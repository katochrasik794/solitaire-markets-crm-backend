import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { comparePassword, encryptPassword, generateRandomPassword } from '../utils/helpers.js';
import * as mt5Service from '../services/mt5.service.js';
import dotenv from 'dotenv';

dotenv.config();

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
 * GET /api/accounts
 * Get all trading accounts for logged in user
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        id, account_number, platform, account_type, currency,
        is_swap_free, is_copy_account, leverage, reason_for_account,
        account_status, is_demo, trading_server, api_account_number, 
        mt5_group_name, created_at
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
      portalPassword
    } = req.body;

    // Validation
    if (!platform || !mt5GroupId || !leverage || !portalPassword) {
      return res.status(400).json({
        success: false,
        message: 'Platform, MT5 group, leverage, and portal password are required'
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
    const groupName = mt5Group.group_name; // Use group_name for API
    const currency = mt5Group.currency || 'USD';

    // Use leverage from form, but adjust if swap free
    let finalLeverage = parseInt(leverage);
    if (isSwapFree && finalLeverage > 500) {
      finalLeverage = 500; // Max leverage for swap free accounts
    }

    // Generate passwords
    // Master password: use portal password (custom format - user's portal password)
    const masterPassword = portalPassword;
    // Main password: generate random
    const mainPassword = generateRandomPassword(12);
    // Investor password: generate random + "Inv@900" suffix
    const investorPasswordBase = generateRandomPassword(12);
    const investorPassword = `${investorPasswordBase}Inv@900`;

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

    // Extract account number from MT5 response
    const apiAccountNumber = mt5Response.account || mt5Response.accountNumber || mt5Response.login || mt5Response.Login || null;
    // Use the investor password we generated (with Inv@900 suffix)
    const finalInvestorPassword = investorPassword;

    // Generate unique account number for our database
    const accountNumberResult = await pool.query('SELECT generate_account_number() as account_number');
    const accountNumber = accountNumberResult.rows[0].account_number;

    // Encrypt passwords before storing
    const encryptedMasterPassword = encryptPassword(masterPassword);
    const encryptedMainPassword = encryptPassword(mainPassword);
    const encryptedInvestorPassword = encryptPassword(finalInvestorPassword);

    // Determine trading server
    const tradingServer = 'Solitaire Markets-Live';

    // Determine account type based on group (you can customize this logic)
    // For now, we'll use 'standard' as default, but you can map it based on group_name
    const accountType = groupName.includes('Pro') || groupName.includes('Premier') ? 'premier' : 'standard';

    // Insert new account into database
    const result = await pool.query(
      `INSERT INTO trading_accounts (
        user_id, account_number, platform, account_type, currency,
        is_swap_free, is_copy_account, leverage, reason_for_account,
        trading_server, mt5_group_id, mt5_group_name,
        name, group, master_password, password, email, country, city, phone,
        comment, api_account_number, investor_password
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING id, account_number, platform, account_type, currency,
        is_swap_free, is_copy_account, leverage, trading_server, 
        api_account_number, mt5_group_name, created_at`,
      [
        req.user.id,
        accountNumber,
        platform,
        accountType,
        currency,
        isSwapFree || false,
        isCopyAccount || false,
        finalLeverage,
        reasonForAccount || null,
        tradingServer,
        mt5GroupId,
        groupName,
        accountName,
        groupName,
        encryptedMasterPassword,
        encryptedMainPassword,
        user.email,
        country,
        '', // Empty string - city not saved in database
        phone,
        reasonForAccount || '',
        apiAccountNumber,
        encryptedInvestorPassword
      ]
    );

    // Return response with account details (don't include encrypted passwords)
    res.json({
      success: true,
      message: 'Account created successfully',
      data: {
        ...result.rows[0],
        // Include non-sensitive account info from MT5 API response
        mt5Response: {
          account: apiAccountNumber,
          // Don't expose passwords in response
        }
      }
    });
  } catch (error) {
    console.error('Create account error:', error);
    next(error);
  }
});

export default router;

