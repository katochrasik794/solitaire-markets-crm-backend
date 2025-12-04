import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import {
  createWalletForUser,
  getWalletByUserId,
  adjustWalletBalance
} from '../services/wallet.service.js';
import { addBalance, deductBalance } from '../services/mt5.service.js';

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
       WHERE user_id = $1 AND (account_number = $2 OR api_account_number = $2) AND platform = 'MT5'`,
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

    // 1) Call MT5 API to add balance
    await addBalance(login, numericAmount, 'Internal transfer from wallet');

    // 2) Adjust wallet balance
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
        type: 'transfer_out',
        source: 'wallet',
        target: 'mt5',
        mt5AccountNumber: String(mt5Account),
        reference: 'Wallet → MT5 transfer'
      },
      pool
    );

    res.json({
      success: true,
      message: 'Transfer to MT5 successful',
      data: result
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
       WHERE user_id = $1 AND (account_number = $2 OR api_account_number = $2) AND platform = 'MT5'`,
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

    // 1) Call MT5 API to deduct balance
    await deductBalance(login, numericAmount, 'Internal transfer to wallet');

    // 2) Adjust wallet balance
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
        type: 'transfer_in',
        source: 'mt5',
        target: 'wallet',
        mt5AccountNumber: String(mt5Account),
        reference: 'MT5 → Wallet transfer'
      },
      pool
    );

    res.json({
      success: true,
      message: 'Transfer from MT5 successful',
      data: result
    });
  } catch (error) {
    console.error('Wallet transfer-from-mt5 error:', error);
    next(error);
  }
});

export default router;


