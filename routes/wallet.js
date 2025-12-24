import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import {
  createWalletForUser,
  getWalletByUserId,
  adjustWalletBalance
} from '../services/wallet.service.js';
import { addBalance, deductBalance } from '../services/mt5.service.js';
import { sendInternalTransferEmail } from '../services/templateEmail.service.js';

const router = express.Router();

// Ensure wallet exists for current user and return it
router.get('/', authenticate, async (req, res, next) => {
  try {
    let wallet = await getWalletByUserId(req.user.id);
    if (!wallet) {
      wallet = await createWalletForUser(req.user.id);
    }

    res.json({
      success: true,
      data: wallet
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    next(error);
  }
});

// Paginated wallet transaction history
router.get('/transactions', authenticate, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    const wallet = await getWalletByUserId(req.user.id);
    if (!wallet) {
      return res.json({
        success: true,
        data: { items: [], total: 0 }
      });
    }

    const countRes = await pool.query(
      'SELECT COUNT(*) AS count FROM wallet_transactions WHERE wallet_id = $1',
      [wallet.id]
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const txRes = await pool.query(
      `SELECT id, type, source, target, amount, currency, mt5_account_number, reference, created_at
       FROM wallet_transactions
       WHERE wallet_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [wallet.id, limit, offset]
    );

    res.json({
      success: true,
      data: {
        items: txRes.rows,
        total
      }
    });
  } catch (error) {
    console.error('Get wallet transactions error:', error);
    next(error);
  }
});

// Simple wallet deposit (for now, instant credit)
router.post('/deposit', authenticate, async (req, res, next) => {
  try {
    const { amount } = req.body;
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero'
      });
    }

    // Check KYC verification status
    const kycResult = await pool.query(
      `SELECT status 
       FROM kyc_verifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [req.user.id]
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
        [req.user.id]
      );
      if (walletResult.rows.length > 0) {
        totalDeposits += parseFloat(walletResult.rows[0].balance || 0);
      }
      
      // Get total MT5 account balances
      const mt5Result = await pool.query(
        'SELECT SUM(balance) as total_balance FROM trading_accounts WHERE user_id = $1 AND platform = \'MT5\' AND is_demo = FALSE',
        [req.user.id]
      );
      if (mt5Result.rows.length > 0 && mt5Result.rows[0].total_balance) {
        totalDeposits += parseFloat(mt5Result.rows[0].total_balance || 0);
      }
      
      // Check if this deposit would exceed the limit
      const totalAfterDeposit = totalDeposits + numericAmount;
      if (totalAfterDeposit > MAX_UNVERIFIED_DEPOSIT) {
        const maxAllowedDeposit = Math.max(0, MAX_UNVERIFIED_DEPOSIT - totalDeposits);
        return res.status(400).json({
          success: false,
          message: `KYC verification required. Maximum deposit limit for unverified accounts is USD ${MAX_UNVERIFIED_DEPOSIT}. You can deposit up to USD ${maxAllowedDeposit.toFixed(2)} more. Please complete KYC verification to remove this limit.`
        });
      }
      
      // Also check single deposit amount
      if (numericAmount > MAX_UNVERIFIED_DEPOSIT) {
        return res.status(400).json({
          success: false,
          message: `KYC verification required. Maximum single deposit for unverified accounts is USD ${MAX_UNVERIFIED_DEPOSIT}. Please complete KYC verification to remove this limit.`
        });
      }
    }

    let wallet = await getWalletByUserId(req.user.id);
    if (!wallet) {
      wallet = await createWalletForUser(req.user.id);
    }

    const result = await adjustWalletBalance(
      {
        walletId: wallet.id,
        amount: numericAmount,
        type: 'deposit',
        source: 'wallet',
        target: 'wallet',
        reference: 'Wallet deposit'
      },
      pool
    );

    res.json({
      success: true,
      message: 'Deposit successful',
      data: result
    });
  } catch (error) {
    console.error('Wallet deposit error:', error);
    next(error);
  }
});

// Simple wallet withdrawal
router.post('/withdraw', authenticate, async (req, res, next) => {
  try {
    const { amount } = req.body;
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero'
      });
    }

    const wallet = await getWalletByUserId(req.user.id);
    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    const result = await adjustWalletBalance(
      {
        walletId: wallet.id,
        amount: numericAmount,
        type: 'withdrawal',
        source: 'wallet',
        target: 'wallet',
        reference: 'Wallet withdrawal'
      },
      pool
    );

    res.json({
      success: true,
      message: 'Withdrawal successful',
      data: result
    });
  } catch (error) {
    console.error('Wallet withdraw error:', error);
    next(error);
  }
});

// Transfer from wallet to MT5 trading account
router.post('/transfer-to-mt5', authenticate, async (req, res, next) => {
  try {
    const { mt5Account, amount } = req.body;
    const numericAmount = Number(amount);

    if (!mt5Account || !numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'MT5 account and positive amount are required'
      });
    }

    // Ensure the MT5 account belongs to this user
    const accRes = await pool.query(
      `SELECT id, account_number, platform 
       FROM trading_accounts 
       WHERE user_id = $1 AND account_number = $2 AND platform = 'MT5'`,
      [req.user.id, String(mt5Account)]
    );
    if (accRes.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Trading account not found for this user'
      });
    }

    const login = parseInt(mt5Account, 10);
    if (Number.isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MT5 account number'
      });
    }

    // Get wallet for internal transfer record
    const wallet = await getWalletByUserId(req.user.id);
    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // 1) Call MT5 API to add balance
    await addBalance(login, numericAmount, 'Deposit');

    // 2) Adjust wallet balance
    const result = await adjustWalletBalance(
      {
        walletId: wallet.id,
        amount: numericAmount,
        type: 'transfer_out',
        source: 'wallet',
        target: 'mt5',
        mt5AccountNumber: String(mt5Account),
        reference: 'Wallet → MT5 transfer'
      },
      pool
    );

    // 3) Save to internal_transfers table
    await pool.query(
      `INSERT INTO internal_transfers 
       (user_id, from_type, from_account, to_type, to_account, amount, currency, mt5_account_number, status, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        req.user.id,
        'wallet',
        wallet.wallet_number,
        'mt5',
        String(mt5Account),
        numericAmount,
        wallet.currency || 'USD',
        String(mt5Account),
        'completed',
        'Internal transfer: Wallet → MT5'
      ]
    );

    res.json({
      success: true,
      message: 'Transfer to MT5 successful',
      data: result
    });

    // Send internal transfer email
    setImmediate(async () => {
      try {
        const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Valued Customer';
          await sendInternalTransferEmail(
            user.email,
            userName,
            wallet.wallet_number,
            String(mt5Account),
            `${numericAmount} ${wallet.currency || 'USD'}`,
            new Date().toLocaleDateString()
          );
          console.log(`Internal transfer email sent to ${user.email}`);
        }
      } catch (emailError) {
        console.error('Failed to send internal transfer email:', emailError);
      }
    });
  } catch (error) {
    console.error('Wallet transfer-to-mt5 error:', error);
    next(error);
  }
});

// Transfer from MT5 trading account to wallet
router.post('/transfer-from-mt5', authenticate, async (req, res, next) => {
  try {
    const { mt5Account, amount } = req.body;
    const numericAmount = Number(amount);

    if (!mt5Account || !numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'MT5 account and positive amount are required'
      });
    }

    // Ensure the MT5 account belongs to this user
    const accRes = await pool.query(
      `SELECT id, account_number, platform 
       FROM trading_accounts 
       WHERE user_id = $1 AND account_number = $2 AND platform = 'MT5'`,
      [req.user.id, String(mt5Account)]
    );
    if (accRes.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Trading account not found for this user'
      });
    }

    const login = parseInt(mt5Account, 10);
    if (Number.isNaN(login)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MT5 account number'
      });
    }

    // Get wallet for internal transfer record
    const wallet = await getWalletByUserId(req.user.id);
    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // 1) Call MT5 API to deduct balance
    await deductBalance(login, numericAmount, 'Deposit');

    // 2) Adjust wallet balance
    const result = await adjustWalletBalance(
      {
        walletId: wallet.id,
        amount: numericAmount,
        type: 'transfer_in',
        source: 'mt5',
        target: 'wallet',
        mt5AccountNumber: String(mt5Account),
        reference: 'MT5 → Wallet transfer'
      },
      pool
    );

    // 3) Save to internal_transfers table
    await pool.query(
      `INSERT INTO internal_transfers 
       (user_id, from_type, from_account, to_type, to_account, amount, currency, mt5_account_number, status, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        req.user.id,
        'mt5',
        String(mt5Account),
        'wallet',
        wallet.wallet_number,
        numericAmount,
        wallet.currency || 'USD',
        String(mt5Account),
        'completed',
        'Internal transfer: MT5 → Wallet'
      ]
    );

    res.json({
      success: true,
      message: 'Transfer from MT5 successful',
      data: result
    });

    // Send internal transfer email
    setImmediate(async () => {
      try {
        const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Valued Customer';
          await sendInternalTransferEmail(
            user.email,
            userName,
            String(mt5Account),
            wallet.wallet_number,
            `${numericAmount} ${wallet.currency || 'USD'}`,
            new Date().toLocaleDateString()
          );
          console.log(`Internal transfer email sent to ${user.email}`);
        }
      } catch (emailError) {
        console.error('Failed to send internal transfer email:', emailError);
      }
    });
  } catch (error) {
    console.error('Wallet transfer-from-mt5 error:', error);
    next(error);
  }
});

/**
 * GET /api/wallet/internal-transfers
 * Get internal transfer history for the logged-in user
 */
router.get('/internal-transfers', authenticate, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    const countRes = await pool.query(
      'SELECT COUNT(*) AS count FROM internal_transfers WHERE user_id = $1',
      [req.user.id]
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const transfersRes = await pool.query(
      `SELECT id, from_type, from_account, to_type, to_account, amount, currency, 
              mt5_account_number, status, reference, created_at
       FROM internal_transfers
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    res.json({
      success: true,
      data: {
        items: transfersRes.rows,
        total
      }
    });
  } catch (error) {
    console.error('Get internal transfers error:', error);
    next(error);
  }
});

export default router;


