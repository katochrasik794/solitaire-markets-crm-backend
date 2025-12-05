import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/reports/transaction-history
 * Get transaction history from deposit_requests and trading_accounts
 */
router.get('/transaction-history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    // Fetch deposit requests for this user
    const depositQuery = `
      SELECT 
        dr.id,
        dr.amount,
        dr.currency,
        dr.status,
        dr.deposit_to_type,
        dr.mt5_account_id,
        dr.wallet_number,
        dr.created_at,
        mg.name as gateway_name,
        mg.type as gateway_type,
        'deposit' as transaction_type
      FROM deposit_requests dr
      LEFT JOIN manual_payment_gateways mg ON dr.gateway_id = mg.id
      WHERE dr.user_id = $1
      ORDER BY dr.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const depositResult = await pool.query(depositQuery, [userId, parseInt(limit), parseInt(offset)]);

    // Fetch trading accounts for this user (MT5 accounts)
    const tradingAccountsQuery = `
      SELECT 
        id,
        account_number,
        platform,
        account_type,
        balance,
        equity,
        currency,
        created_at,
        'account_creation' as transaction_type
      FROM trading_accounts
      WHERE user_id = $1 AND platform = 'MT5'
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const tradingAccountsResult = await pool.query(tradingAccountsQuery, [userId, parseInt(limit), parseInt(offset)]);

    // Combine and format the results
    const transactions = [
      ...depositResult.rows.map(row => ({
        id: `deposit_${row.id}`,
        type: 'deposit',
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        status: row.status,
        depositTo: row.deposit_to_type,
        mt5AccountId: row.mt5_account_id,
        walletNumber: row.wallet_number,
        gatewayName: row.gateway_name,
        gatewayType: row.gateway_type,
        createdAt: row.created_at,
        description: `Deposit via ${row.gateway_name || 'Manual Gateway'}`
      })),
      ...tradingAccountsResult.rows.map(row => ({
        id: `account_${row.id}`,
        type: 'account_creation',
        accountNumber: row.account_number,
        platform: row.platform,
        accountType: row.account_type,
        balance: parseFloat(row.balance || 0),
        equity: parseFloat(row.equity || 0),
        currency: row.currency || 'USD',
        createdAt: row.created_at,
        description: `MT5 Account Created: ${row.account_number}`
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get total count
    const depositCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM deposit_requests WHERE user_id = $1',
      [userId]
    );
    const accountCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM trading_accounts WHERE user_id = $1 AND platform = \'MT5\'',
      [userId]
    );
    const total = parseInt(depositCountResult.rows[0].count) + parseInt(accountCountResult.rows[0].count);

    res.json({
      success: true,
      data: {
        transactions,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transaction history'
    });
  }
});

export default router;

