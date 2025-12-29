import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { sendDepositRequestEmail } from '../services/templateEmail.service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as cregisService from '../services/cregis.service.js';
import * as mt5Service from '../services/mt5.service.js';
import { logUserAction } from '../services/logging.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create uploads directory for deposit proofs
const depositProofsDir = path.join(__dirname, '../uploads/deposit-proofs');
if (!fs.existsSync(depositProofsDir)) {
  fs.mkdirSync(depositProofsDir, { recursive: true });
}

// Configure multer for deposit proof uploads
const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, depositProofsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `proof-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const proofUpload = multer({
  storage: proofStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG) and PDF files are allowed'));
    }
  }
});

const router = express.Router();

// Get base URL for serving static files
const getBaseUrl = () => {
  if (process.env.BACKEND_API_URL) {
    return process.env.BACKEND_API_URL.replace('/api', '');
  }
  if (process.env.API_URL) {
    return process.env.API_URL.replace('/api', '');
  }
  return 'http://localhost:5000';
};

/**
 * GET /api/deposits/gateways
 * Get all active payment gateways for user deposits
 */
router.get('/gateways', authenticate, async (req, res) => {
  try {
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
        instructions
      FROM manual_payment_gateways
      WHERE is_active = TRUE AND COALESCE(is_deposit_enabled, TRUE) = TRUE
      ORDER BY is_recommended DESC, display_order ASC, name ASC`
    );

    // Map backend types to frontend types and format response
    const typeMapping = {
      'UPI': 'upi',
      'Bank_Transfer': 'wire',
      'USDT_TRC20': 'crypto',
      'USDT_ERC20': 'crypto',
      'USDT_BEP20': 'crypto',
      'Bitcoin': 'crypto',
      'Ethereum': 'crypto',
      'Other_Crypto': 'crypto',
      'Debit_Card': 'card',
      'Other': 'local'
    };

    const gateways = result.rows.map(row => {
      const parsedTypeData = typeof row.type_data === 'string'
        ? JSON.parse(row.type_data)
        : row.type_data || {};

      const baseUrl = getBaseUrl();
      return {
        id: row.id,
        type: typeMapping[row.type] || row.type.toLowerCase(),
        name: row.name,
        icon_url: row.icon_path,
        qr_code_url: row.qr_code_path,
        is_recommended: row.is_recommended,
        instructions: row.instructions,
        // Type-specific data
        vpa_address: parsedTypeData.vpa || null,
        crypto_address: parsedTypeData.address || null,
        bank_name: parsedTypeData.bank_name || null,
        account_name: parsedTypeData.account_name || null,
        account_number: parsedTypeData.account_number || null,
        ifsc_code: parsedTypeData.ifsc || null,
        swift_code: parsedTypeData.swift || null,
        account_type: parsedTypeData.account_type || null,
        country_code: parsedTypeData.country_code || null
      };
    });

    res.json({
      success: true,
      gateways
    });
  } catch (error) {
    console.error('Get deposit gateways error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch deposit gateways'
    });
  }
});

/**
 * POST /api/deposits/request
 * Create a new deposit request
 */
router.post('/request', authenticate, proofUpload.single('proof'), async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      gateway_id,
      amount,
      currency = 'USD',
      converted_amount,
      converted_currency,
      transaction_hash,
      deposit_to = 'wallet',
      mt5_account_id,
      wallet_id,
      wallet_number
    } = req.body;

    console.log('Deposit request received:', {
      userId,
      gateway_id,
      amount,
      deposit_to,
      mt5_account_id,
      wallet_id,
      wallet_number,
      body: req.body
    });

    if (!gateway_id || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Gateway ID and amount are required'
      });
    }

    // Verify gateway exists, is active, and enabled for deposits
    const gatewayCheck = await pool.query(
      'SELECT id FROM manual_payment_gateways WHERE id = $1 AND is_active = TRUE AND COALESCE(is_deposit_enabled, TRUE) = TRUE',
      [gateway_id]
    );

    if (gatewayCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Gateway not found or inactive'
      });
    }

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid deposit amount'
      });
    }

    // Check KYC verification status
    const kycResult = await pool.query(
      `SELECT status 
       FROM kyc_verifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );

    const kycStatus = kycResult.rows[0]?.status?.toLowerCase() || 'unverified';
    const isKycVerified = kycStatus === 'approved';

    // If KYC is not verified, limit deposit to $2000 USD
    if (!isKycVerified) {
      const MAX_UNVERIFIED_DEPOSIT = 2000;

      // Check total deposits (wallet + MT5) for unverified users
      let totalDeposits = 0;

      // Get wallet balance
      const walletResult = await pool.query(
        'SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      if (walletResult.rows.length > 0) {
        totalDeposits += parseFloat(walletResult.rows[0].balance || 0);
      }

      // Get total MT5 account balances
      const mt5Result = await pool.query(
        'SELECT SUM(balance) as total_balance FROM trading_accounts WHERE user_id = $1 AND platform = \'MT5\' AND is_demo = FALSE',
        [userId]
      );
      if (mt5Result.rows.length > 0 && mt5Result.rows[0].total_balance) {
        totalDeposits += parseFloat(mt5Result.rows[0].total_balance || 0);
      }

      // Check if this deposit would exceed the limit
      const totalAfterDeposit = totalDeposits + depositAmount;
      if (totalAfterDeposit > MAX_UNVERIFIED_DEPOSIT) {
        const maxAllowedDeposit = Math.max(0, MAX_UNVERIFIED_DEPOSIT - totalDeposits);
        return res.status(400).json({
          success: false,
          error: `KYC verification required. Maximum deposit limit for unverified accounts is ${currency} ${MAX_UNVERIFIED_DEPOSIT}. You can deposit up to ${currency} ${maxAllowedDeposit.toFixed(2)} more. Please complete KYC verification to remove this limit.`
        });
      }

      // Also check single deposit amount
      if (depositAmount > MAX_UNVERIFIED_DEPOSIT) {
        return res.status(400).json({
          success: false,
          error: `KYC verification required. Maximum single deposit for unverified accounts is ${currency} ${MAX_UNVERIFIED_DEPOSIT}. Please complete KYC verification to remove this limit.`
        });
      }
    }

    // Validate deposit limits if depositing to MT5 account
    if (deposit_to === 'mt5' && mt5_account_id) {
      const mt5AccountId = String(mt5_account_id).trim();

      // Check which columns exist for joining with mt5_groups
      const colsRes = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'trading_accounts'`
      );
      const existingCols = new Set(colsRes.rows.map((r) => r.column_name));

      const hasMt5GroupName = existingCols.has('mt5_group_name');
      const hasMt5GroupId = existingCols.has('mt5_group_id');
      const hasGroup = existingCols.has('group');

      // Build join condition based on available columns (try ALL possible joins with OR)
      const joinConditions = [];
      if (hasMt5GroupName) {
        joinConditions.push('ta.mt5_group_name = mg.group_name');
      }
      if (hasMt5GroupId) {
        joinConditions.push('ta.mt5_group_id = mg.id');
      }
      if (hasGroup) {
        joinConditions.push('ta.group = mg.group_name');
      }

      // Get account's group limits
      let query = `
        SELECT 
          ta.account_number,
          mg.minimum_deposit,
          mg.maximum_deposit
        FROM trading_accounts ta
      `;

      if (joinConditions.length > 0) {
        const joinCondition = joinConditions.join(' OR ');
        query += `LEFT JOIN mt5_groups mg ON (${joinCondition}) AND mg.is_active = TRUE`;
      } else {
        query += `CROSS JOIN (SELECT NULL::DECIMAL(15,2) as minimum_deposit, NULL::DECIMAL(15,2) as maximum_deposit) mg`;
      }

      query += ` WHERE ta.account_number = $1 AND ta.user_id = $2 AND ta.platform = 'MT5'`;

      const accountGroupResult = await pool.query(query, [mt5AccountId, userId]);

      if (accountGroupResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'MT5 account not found or does not belong to you'
        });
      }

      const groupLimits = accountGroupResult.rows[0];
      const minDeposit = parseFloat(groupLimits.minimum_deposit || 0);
      const maxDeposit = groupLimits.maximum_deposit ? parseFloat(groupLimits.maximum_deposit) : null;

      // Get current account balance
      const accountBalanceResult = await pool.query(
        'SELECT balance FROM trading_accounts WHERE account_number = $1 AND user_id = $2',
        [mt5AccountId, userId]
      );
      const currentBalance = accountBalanceResult.rows.length > 0
        ? parseFloat(accountBalanceResult.rows[0].balance || 0)
        : 0;

      // Validate against limits
      if (depositAmount < minDeposit) {
        return res.status(400).json({
          success: false,
          error: `Minimum deposit amount is ${currency} ${minDeposit.toFixed(2)}`
        });
      }

      // Check if deposit + current balance exceeds maximum deposit limit
      if (maxDeposit !== null) {
        const totalAfterDeposit = currentBalance + depositAmount;
        if (totalAfterDeposit > maxDeposit) {
          const maxAllowedDeposit = Math.max(0, maxDeposit - currentBalance);
          return res.status(400).json({
            success: false,
            error: `Maximum deposit is ${currency} ${maxAllowedDeposit.toFixed(2)} (account balance + deposit cannot exceed ${currency} ${maxDeposit.toFixed(2)})`
          });
        }
      }
    }

    const proofPath = req.file ? `/uploads/deposit-proofs/${req.file.filename}` : null;

    const depositToType = deposit_to === 'mt5' ? 'mt5' : 'wallet';
    let mt5AccountId = null;
    let walletId = null;
    let walletNumber = null;

    // Handle MT5 account ID
    if (deposit_to === 'mt5' && mt5_account_id) {
      mt5AccountId = String(mt5_account_id).trim();
      console.log('Setting MT5 account ID:', mt5AccountId);
    }

    // Handle wallet - prioritize wallet_number
    if (deposit_to === 'wallet') {
      if (wallet_number) {
        walletNumber = String(wallet_number).trim();
        console.log('Using provided wallet_number:', walletNumber);

        // Also fetch wallet_id from wallet_number for reference
        const walletResult = await pool.query(
          'SELECT id FROM wallets WHERE wallet_number = $1 LIMIT 1',
          [walletNumber]
        );
        if (walletResult.rows.length > 0) {
          walletId = walletResult.rows[0].id;
          console.log('Fetched wallet_id from wallet_number:', walletId);
        } else {
          console.error('Wallet not found with wallet_number:', walletNumber);
        }
      } else if (wallet_id) {
        walletId = parseInt(wallet_id);
        console.log('Using provided wallet_id:', walletId);

        // ALWAYS fetch wallet_number from wallet_id - this is critical!
        const walletResult = await pool.query(
          'SELECT wallet_number FROM wallets WHERE id = $1 LIMIT 1',
          [walletId]
        );
        if (walletResult.rows.length > 0 && walletResult.rows[0].wallet_number) {
          walletNumber = walletResult.rows[0].wallet_number;
          console.log('Fetched wallet_number from wallet_id:', walletNumber);
        } else {
          console.error('Wallet not found or wallet_number is null for wallet_id:', walletId);
        }
      } else {
        // Fetch wallet by user_id
        const walletResult = await pool.query(
          'SELECT id, wallet_number FROM wallets WHERE user_id = $1 LIMIT 1',
          [userId]
        );
        if (walletResult.rows.length > 0) {
          walletId = walletResult.rows[0].id;
          walletNumber = walletResult.rows[0].wallet_number;
          console.log('Fetched wallet_id and wallet_number from user_id:', { walletId, walletNumber });
        } else {
          console.error('No wallet found for user:', userId);
        }
      }

      // Final validation - ensure wallet_number is set
      if (!walletNumber && walletId) {
        console.error('CRITICAL: wallet_number is missing but wallet_id exists:', walletId);
        // Try one more time to fetch it
        const lastAttempt = await pool.query(
          'SELECT wallet_number FROM wallets WHERE id = $1 LIMIT 1',
          [walletId]
        );
        if (lastAttempt.rows.length > 0 && lastAttempt.rows[0].wallet_number) {
          walletNumber = lastAttempt.rows[0].wallet_number;
          console.log('Successfully fetched wallet_number on retry:', walletNumber);
        }
      }
    }

    console.log('Final values before insert:', {
      depositToType,
      mt5AccountId,
      walletId,
      walletNumber
    });

    const result = await pool.query(
      `INSERT INTO deposit_requests 
        (user_id, gateway_id, amount, currency, converted_amount, converted_currency, 
         transaction_hash, proof_path, deposit_to_type, mt5_account_id, wallet_id, wallet_number, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
      RETURNING *`,
      [
        userId,
        gateway_id,
        depositAmount,
        currency,
        converted_amount ? parseFloat(converted_amount) : null,
        converted_currency || null,
        transaction_hash || null,
        proofPath,
        depositToType,
        mt5AccountId || null,
        walletId || null,
        walletNumber || null
      ]
    );

    console.log('Deposit request created:', {
      id: result.rows[0].id,
      deposit_to_type: result.rows[0].deposit_to_type,
      mt5_account_id: result.rows[0].mt5_account_id,
      wallet_id: result.rows[0].wallet_id,
      wallet_number: result.rows[0].wallet_number
    });

    console.log('Deposit request created:', {
      id: result.rows[0].id,
      deposit_to_type: result.rows[0].deposit_to_type,
      mt5_account_id: result.rows[0].mt5_account_id,
      wallet_id: result.rows[0].wallet_id
    });

    const deposit = result.rows[0];
    const responseData = {
      success: true,
      deposit: deposit
    };

    res.json(responseData);

    // Log user action and send email
    setImmediate(async () => {
      await logUserAction({
        userId: req.user.id,
        userEmail: req.user.email,
        actionType: 'deposit_request',
        actionCategory: 'deposit',
        targetType: 'deposit',
        targetId: deposit.id,
        targetIdentifier: `Deposit #${deposit.id}`,
        description: `Requested deposit of $${deposit.amount} ${deposit.currency} to ${deposit.deposit_to_type}`,
        req,
        res,
        beforeData: null,
        afterData: deposit
      });

      // Send deposit request email
      try {
        const userResult = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id]);
        const userName = userResult.rows.length > 0
          ? `${userResult.rows[0].first_name || ''} ${userResult.rows[0].last_name || ''}`.trim() || 'Valued Customer'
          : 'Valued Customer';
        const accountLogin = deposit.mt5_account_id || deposit.wallet_number || 'N/A';
        await sendDepositRequestEmail(
          req.user.email,
          userName,
          accountLogin,
          `${deposit.amount} ${deposit.currency || 'USD'}`,
          new Date().toLocaleDateString()
        );
        console.log(`Deposit request email sent to ${req.user.email}`);
      } catch (emailError) {
        console.error('Failed to send deposit request email:', emailError);
      }
    });
  } catch (error) {
    console.error('Create deposit request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create deposit request'
    });
  }
});

/**
 * POST /api/deposits/cregis/create
 * Create a Cregis payment order for deposit
 */
router.post('/cregis/create', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      amount,
      currency = 'USDT',
      deposit_to = 'mt5',
      mt5_account_id,
      wallet_id,
      wallet_number
    } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid amount is required'
      });
    }

    const depositAmount = parseFloat(amount);

    // Check KYC verification status
    const kycResult = await pool.query(
      `SELECT status 
       FROM kyc_verifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );

    const kycStatus = kycResult.rows[0]?.status?.toLowerCase() || 'unverified';
    const isKycVerified = kycStatus === 'approved';

    // If KYC is not verified, limit deposit to $2000 USD
    if (!isKycVerified) {
      const MAX_UNVERIFIED_DEPOSIT = 2000;

      // Check total deposits (wallet + MT5) for unverified users
      let totalDeposits = 0;

      // Get wallet balance
      const walletResult = await pool.query(
        'SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      if (walletResult.rows.length > 0) {
        totalDeposits += parseFloat(walletResult.rows[0].balance || 0);
      }

      // Get total MT5 account balances
      const mt5Result = await pool.query(
        'SELECT SUM(balance) as total_balance FROM trading_accounts WHERE user_id = $1 AND platform = \'MT5\' AND is_demo = FALSE',
        [userId]
      );
      if (mt5Result.rows.length > 0 && mt5Result.rows[0].total_balance) {
        totalDeposits += parseFloat(mt5Result.rows[0].total_balance || 0);
      }

      // Check if this deposit would exceed the limit
      const totalAfterDeposit = totalDeposits + depositAmount;
      if (totalAfterDeposit > MAX_UNVERIFIED_DEPOSIT) {
        const maxAllowedDeposit = Math.max(0, MAX_UNVERIFIED_DEPOSIT - totalDeposits);
        return res.status(400).json({
          success: false,
          error: `KYC verification required. Maximum deposit limit for unverified accounts is USD ${MAX_UNVERIFIED_DEPOSIT}. You can deposit up to USD ${maxAllowedDeposit.toFixed(2)} more. Please complete KYC verification to remove this limit.`
        });
      }

      // Also check single deposit amount
      if (depositAmount > MAX_UNVERIFIED_DEPOSIT) {
        return res.status(400).json({
          success: false,
          error: `KYC verification required. Maximum single deposit for unverified accounts is USD ${MAX_UNVERIFIED_DEPOSIT}. Please complete KYC verification to remove this limit.`
        });
      }
    }

    if (deposit_to === 'mt5' && !mt5_account_id) {
      return res.status(400).json({
        success: false,
        error: 'MT5 account ID is required for MT5 deposits'
      });
    }

    // Create deposit request first
    const depositToType = deposit_to === 'mt5' ? 'mt5' : 'wallet';
    let mt5AccountId = null;
    let walletId = null;
    let walletNumber = null;

    if (deposit_to === 'mt5' && mt5_account_id) {
      mt5AccountId = String(mt5_account_id).trim();

      // Verify MT5 account belongs to user
      const accountCheck = await pool.query(
        'SELECT id, account_number FROM trading_accounts WHERE account_number = $1 AND user_id = $2 AND platform = \'MT5\'',
        [mt5AccountId, userId]
      );

      if (accountCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'MT5 account not found or does not belong to you'
        });
      }
    }

    if (deposit_to === 'wallet') {
      if (wallet_number) {
        walletNumber = String(wallet_number).trim();
        const walletResult = await pool.query(
          'SELECT id FROM wallets WHERE wallet_number = $1 AND user_id = $2 LIMIT 1',
          [walletNumber, userId]
        );
        if (walletResult.rows.length > 0) {
          walletId = walletResult.rows[0].id;
        }
      } else if (wallet_id) {
        walletId = parseInt(wallet_id);
        const walletResult = await pool.query(
          'SELECT wallet_number FROM wallets WHERE id = $1 AND user_id = $2 LIMIT 1',
          [walletId, userId]
        );
        if (walletResult.rows.length > 0) {
          walletNumber = walletResult.rows[0].wallet_number;
        }
      } else {
        const walletResult = await pool.query(
          'SELECT id, wallet_number FROM wallets WHERE user_id = $1 LIMIT 1',
          [userId]
        );
        if (walletResult.rows.length > 0) {
          walletId = walletResult.rows[0].id;
          walletNumber = walletResult.rows[0].wallet_number;
        }
      }
    }

    // Insert deposit request
    const depositResult = await pool.query(
      `INSERT INTO deposit_requests 
        (user_id, gateway_id, amount, currency, deposit_to_type, mt5_account_id, wallet_id, wallet_number, status)
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *`,
      [
        userId,
        parseFloat(amount),
        currency,
        depositToType,
        mt5AccountId || null,
        walletId || null,
        walletNumber || null
      ]
    );

    const depositRequest = depositResult.rows[0];

    // Generate order ID and create Cregis payment
    const orderId = cregisService.generateOrderId(depositRequest.id);

    console.log('Creating Cregis payment for deposit:', {
      depositId: depositRequest.id,
      orderId,
      amount: parseFloat(amount),
      currency
    });

    // Get user info for payer details
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Fetch Cregis gateway configuration from database
    const gatewayResult = await pool.query(
      `SELECT project_id, api_key, gateway_url, webhook_secret, secret_key
       FROM auto_gateway
       WHERE gateway_type = 'Cryptocurrency' 
         AND is_active = TRUE
         AND project_id IS NOT NULL
         AND api_key IS NOT NULL
         AND gateway_url IS NOT NULL
       ORDER BY display_order ASC, created_at DESC
       LIMIT 1`
    );

    const gatewayConfig = gatewayResult.rows.length > 0 ? gatewayResult.rows[0] : null;

    if (!gatewayConfig) {
      console.warn('No active Cregis gateway found in database, using environment variables as fallback');
    }

    const cregisResult = await cregisService.createPayment({
      orderId,
      amount: parseFloat(amount),
      currency,
      payerId: String(userId),
      payerName: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : null,
      payerEmail: user?.email || null,
      callbackUrl: `${getBaseUrl()}/api/deposits/cregis/webhook`,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/user/deposits/cregis-usdt-trc20`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/user/deposits`,
      validTime: 60, // 60 minutes
      gatewayConfig // Pass gateway config from database
    });

    console.log('Cregis payment result:', cregisResult);

    if (!cregisResult.success) {
      // Update deposit request status to rejected
      await pool.query(
        'UPDATE deposit_requests SET status = $1 WHERE id = $2',
        ['rejected', depositRequest.id]
      );

      console.error('Cregis payment creation failed:', cregisResult.error);
      return res.status(500).json({
        success: false,
        error: cregisResult.error || 'Failed to create payment order'
      });
    }

    const cregisData = cregisResult.data;

    // Update deposit request with Cregis order ID and cregis_id
    await pool.query(
      `UPDATE deposit_requests 
       SET cregis_order_id = $1, cregis_status = $2 
       WHERE id = $3`,
      [orderId, cregisData.status, depositRequest.id]
    );

    // Store Cregis transaction (use cregisId as cregis_order_id for queries)
    await pool.query(
      `INSERT INTO cregis_transactions 
        (deposit_request_id, cregis_order_id, cregis_status, amount, currency, payment_url, qr_code_url, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (cregis_order_id) DO UPDATE SET
        cregis_status = $3,
        payment_url = $6,
        qr_code_url = $7,
        expires_at = $8,
        updated_at = NOW()`,
      [
        depositRequest.id,
        cregisData.cregisId, // Store cregis_id for status queries
        cregisData.status,
        cregisData.amount,
        cregisData.currency,
        cregisData.paymentUrl || cregisData.checkoutUrl,
        cregisData.qrCodeUrl,
        cregisData.expiresAt
      ]
    );

    res.json({
      success: true,
      data: {
        depositId: depositRequest.id,
        cregisId: cregisData.cregisId,
        orderId,
        checkoutUrl: cregisData.checkoutUrl,
        paymentUrl: cregisData.checkoutUrl, // Alias for compatibility
        qrCodeUrl: cregisData.qrCodeUrl,
        paymentAddress: cregisData.paymentAddress,
        amount: cregisData.amount,
        currency: cregisData.currency,
        expiresAt: cregisData.expiresAt,
        status: cregisData.status,
        paymentInfo: cregisData.paymentInfo
      }
    });
  } catch (error) {
    console.error('Create Cregis payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment order'
    });
  }
});

/**
 * GET /api/deposits/my
 * Get all deposits for the logged in user
 * MUST be before /cregis/status/:depositId to avoid route conflicts
 */
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status, limit = 1000 } = req.query;

    // Use only columns that definitely exist based on INSERT statements
    let query = `
      SELECT 
        id, amount, currency, deposit_to_type, mt5_account_id, wallet_id,
        status, gateway_id, created_at, updated_at
      FROM deposit_requests
      WHERE user_id = $1
    `;
    const params = [userId];

    if (status && status !== 'all') {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      success: true,
      items: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get user deposits error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch deposits'
    });
  }
});

/**
 * GET /api/deposits/cregis/status/:depositId
 * Check payment status for a Cregis deposit
 */
router.get('/cregis/status/:depositId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { depositId } = req.params;

    // Verify deposit belongs to user
    const depositCheck = await pool.query(
      `SELECT id, cregis_order_id, cregis_status, status, deposit_to_type, mt5_account_id, amount, currency
       FROM deposit_requests 
       WHERE id = $1 AND user_id = $2`,
      [depositId, userId]
    );

    if (depositCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Deposit not found or does not belong to you'
      });
    }

    const deposit = depositCheck.rows[0];

    // Get cregis_id from cregis_transactions table
    const cregisTransaction = await pool.query(
      'SELECT cregis_order_id FROM cregis_transactions WHERE deposit_request_id = $1 LIMIT 1',
      [deposit.id]
    );

    if (cregisTransaction.rows.length === 0 || !cregisTransaction.rows[0].cregis_order_id) {
      return res.status(400).json({
        success: false,
        error: 'No Cregis transaction found for this deposit'
      });
    }

    const cregisId = cregisTransaction.rows[0].cregis_order_id; // This is actually cregis_id

    // Fetch Cregis gateway configuration from database
    const gatewayResult = await pool.query(
      `SELECT project_id, api_key, gateway_url, webhook_secret, secret_key
       FROM auto_gateway
       WHERE gateway_type = 'Cryptocurrency' 
         AND is_active = TRUE
         AND project_id IS NOT NULL
         AND api_key IS NOT NULL
         AND gateway_url IS NOT NULL
       ORDER BY display_order ASC, created_at DESC
       LIMIT 1`
    );

    const gatewayConfig = gatewayResult.rows.length > 0 ? gatewayResult.rows[0] : null;

    // Check status from Cregis API using cregis_id
    const statusResult = await cregisService.checkPaymentStatus(cregisId, gatewayConfig);

    if (!statusResult.success) {
      return res.status(500).json({
        success: false,
        error: statusResult.error || 'Failed to check payment status'
      });
    }

    const cregisStatus = statusResult.data.status;
    const depositStatus = cregisService.mapCregisStatusToDepositStatus(cregisStatus);

    // Update deposit request if status changed
    if (cregisStatus !== deposit.cregis_status) {
      await pool.query(
        `UPDATE deposit_requests 
         SET cregis_status = $1, status = $2, updated_at = NOW()
         WHERE id = $3`,
        [cregisStatus, depositStatus, deposit.id]
      );

      // Update cregis_transactions
      await pool.query(
        `UPDATE cregis_transactions 
         SET cregis_status = $1, updated_at = NOW()
         WHERE cregis_order_id = $2`,
        [cregisStatus, cregisId]
      );

      // If payment is paid/paid_over and deposit is for MT5, add balance
      if ((cregisStatus === 'paid' || cregisStatus === 'paid_over')
        && deposit.deposit_to_type === 'mt5'
        && deposit.mt5_account_id
        && deposit.status !== 'approved') {
        try {
          const login = parseInt(deposit.mt5_account_id, 10);
          if (!Number.isNaN(login)) {
            await mt5Service.addBalance(
              login,
              parseFloat(deposit.amount),
              `Cregis deposit #${deposit.id}`
            );
            console.log(`Added balance to MT5 account ${login} for Cregis deposit #${deposit.id}`);
          }
        } catch (mt5Error) {
          console.error('Error adding MT5 balance:', mt5Error);
          // Don't fail the request, just log the error
        }
      }
    }

    res.json({
      success: true,
      data: {
        depositId: deposit.id,
        cregisStatus,
        depositStatus,
        amount: statusResult.data.amount || deposit.amount,
        currency: statusResult.data.currency || deposit.currency,
        transactionHash: statusResult.data.transactionHash,
        paidAt: statusResult.data.paidAt
      }
    });
  } catch (error) {
    console.error('Check Cregis payment status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check payment status'
    });
  }
});

/**
 * POST /api/deposits/cregis/webhook
 * Handle Cregis webhook callbacks (public endpoint, no auth)
 */
router.post('/cregis/webhook', express.json(), async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-cregis-signature'] || req.headers['x-signature'] || null;

    console.log('Cregis webhook received:', JSON.stringify(payload, null, 2));

    const webhookResult = await cregisService.handleWebhook(payload, signature);

    if (!webhookResult.success) {
      console.error('Webhook processing failed:', webhookResult.error);
      return res.status(400).json({
        success: false,
        error: webhookResult.error
      });
    }

    const { cregisId, orderId, status, transactionHash } = webhookResult.data;

    // Find deposit request by order_id (merchant order ID)
    const depositCheck = await pool.query(
      `SELECT id, user_id, deposit_to_type, mt5_account_id, amount, currency, status
       FROM deposit_requests 
       WHERE cregis_order_id = $1`,
      [orderId]
    );

    if (depositCheck.rows.length === 0) {
      console.error('Deposit not found for Cregis order ID:', orderId);
      return res.status(404).json({
        success: false,
        error: 'Deposit not found'
      });
    }

    const deposit = depositCheck.rows[0];
    const depositStatus = cregisService.mapCregisStatusToDepositStatus(status);

    // Update deposit request
    await pool.query(
      `UPDATE deposit_requests 
       SET cregis_status = $1, status = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, depositStatus, deposit.id]
    );

    // Update cregis_transactions using cregis_id
    await pool.query(
      `UPDATE cregis_transactions 
       SET cregis_status = $1, webhook_data = $2, updated_at = NOW()
       WHERE cregis_order_id = $3`,
      [status, JSON.stringify(payload), cregisId]
    );

    // If payment is paid/paid_over and deposit is for MT5, add balance
    if ((status === 'paid' || status === 'paid_over')
      && deposit.deposit_to_type === 'mt5'
      && deposit.mt5_account_id
      && deposit.status !== 'approved') {
      try {
        const login = parseInt(deposit.mt5_account_id, 10);
        if (!Number.isNaN(login)) {
          await mt5Service.addBalance(
            login,
            parseFloat(deposit.amount),
            `Cregis deposit #${deposit.id}`
          );
          console.log(`Added balance to MT5 account ${login} for Cregis deposit #${deposit.id} via webhook`);
        }
      } catch (mt5Error) {
        console.error('Error adding MT5 balance from webhook:', mt5Error);
        // Don't fail the webhook, just log the error
      }
    }

    // Return "success" string as required by Cregis
    res.status(200).send('success');
  } catch (error) {
    console.error('Cregis webhook error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process webhook'
    });
  }
});

/**
 * PUT /api/deposits/:depositId/cancel
 * Cancel a deposit request (user-initiated or expired)
 */
router.put('/:depositId/cancel', authenticate, async (req, res) => {
  try {
    const { depositId } = req.params;
    const userId = req.user.id;

    // Check if deposit exists and belongs to user
    const depositCheck = await pool.query(
      `SELECT id, status, cregis_order_id, cregis_status
       FROM deposit_requests 
       WHERE id = $1 AND user_id = $2`,
      [depositId, userId]
    );

    if (depositCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Deposit request not found'
      });
    }

    const deposit = depositCheck.rows[0];

    // Only allow cancellation if status is pending
    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel deposit with status: ${deposit.status}`
      });
    }

    // Update deposit status to cancelled
    await pool.query(
      `UPDATE deposit_requests 
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [depositId]
    );

    // Update cregis_status if it exists
    if (deposit.cregis_order_id) {
      await pool.query(
        `UPDATE deposit_requests 
         SET cregis_status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [depositId]
      );

      // Update cregis_transactions if exists
      await pool.query(
        `UPDATE cregis_transactions 
         SET cregis_status = 'expired', updated_at = NOW()
         WHERE deposit_request_id = $1`,
        [depositId]
      );
    }

    console.log(`Deposit #${depositId} cancelled by user ${userId}`);

    res.json({
      success: true,
      message: 'Deposit request cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel deposit error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel deposit request'
    });
  }
});

export default router;

