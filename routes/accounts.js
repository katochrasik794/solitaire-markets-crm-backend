import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { comparePassword, encryptPassword, generateRandomPassword } from '../utils/helpers.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://metaapi.zuperior.com';

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
    next(error);
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
        account_status, is_demo, trading_server, api_account_number, created_at
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
    next(error);
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

    // Prepare MetaAPI request
    const metaApiPayload = {
      name: accountName,
      group: groupName, // Use group_name from database
      leverage: finalLeverage, // Just the number (50, 100, 200, etc.)
      masterPassword: masterPassword, // Portal password
      investorPassword: investorPassword, // Random + Inv@900
      password: mainPassword, // Main password
      email: user.email,
      country: country,
      city: '', // Empty string - city not saved in database
      phone: phone,
      comment: reasonForAccount || 'Created via API'
    };

    // Call MetaAPI
    let metaApiResponse;
    try {
      const metaApiUrl = `${METAAPI_BASE_URL}/api/User/create`;
      const metaApiOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.METAAPI_API_KEY && { 'Authorization': `Bearer ${process.env.METAAPI_API_KEY}` }),
          ...(process.env.METAAPI_TOKEN && { 'X-API-Token': process.env.METAAPI_TOKEN })
        },
        body: JSON.stringify(metaApiPayload)
      };

      console.log('Calling MetaAPI:', metaApiUrl);
      console.log('Request payload:', JSON.stringify(metaApiPayload, null, 2));
      console.log('Request headers:', JSON.stringify(metaApiOptions.headers, null, 2));

      const metaApiRes = await fetch(metaApiUrl, metaApiOptions);
      const responseText = await metaApiRes.text();
      
      console.log('MetaAPI Status:', metaApiRes.status, metaApiRes.statusText);
      console.log('MetaAPI Raw Response:', responseText);
      
      // Check if response is empty
      if (!responseText || responseText.trim() === '') {
        throw new Error(`MetaAPI returned empty response. Status: ${metaApiRes.status}`);
      }
      
      // Try to parse as JSON
      try {
        metaApiResponse = JSON.parse(responseText);
      } catch (parseError) {
        console.error('MetaAPI response is not JSON. Full response:', responseText);
        console.error('Response length:', responseText.length);
        console.error('Response type:', typeof responseText);
        throw new Error(`Invalid response from MetaAPI (Status ${metaApiRes.status}): ${responseText.substring(0, 500)}`);
      }

      console.log('MetaAPI parsed response:', JSON.stringify(metaApiResponse, null, 2));

      // Check if response indicates an error
      if (!metaApiRes.ok) {
        const errorMsg = metaApiResponse.message || metaApiResponse.error || metaApiResponse.msg || JSON.stringify(metaApiResponse);
        throw new Error(`MetaAPI error (Status ${metaApiRes.status}): ${errorMsg}`);
      }
      
      // Check if response has error field even if status is ok
      if (metaApiResponse.error || metaApiResponse.status === 'error') {
        const errorMsg = metaApiResponse.message || metaApiResponse.error || JSON.stringify(metaApiResponse);
        throw new Error(`MetaAPI returned error: ${errorMsg}`);
      }
    } catch (apiError) {
      console.error('MetaAPI error:', apiError);
      console.error('Error details:', {
        message: apiError.message,
        stack: apiError.stack,
        url: `${METAAPI_BASE_URL}/api/User/create`
      });
      return res.status(500).json({
        success: false,
        message: apiError.message || 'Failed to create account via MetaAPI. Please try again later.'
      });
    }

    // Extract account number from MetaAPI response
    const apiAccountNumber = metaApiResponse.account || metaApiResponse.accountNumber || metaApiResponse.login || null;
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
        name, group_name_api, master_password, password_api, email_api, country_api, city_api, phone_api,
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
        // Include non-sensitive account info from MetaAPI response
        metaApiResponse: {
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

