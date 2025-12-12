import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import * as mt5Service from '../services/mt5.service.js';

const router = express.Router();

/**
 * POST /api/withdrawals
 * Create a new withdrawal request
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const {
            amount,
            currency = 'USD',
            method,
            paymentMethod,
            mt5AccountId,
            password,
            // Crypto fields
            cryptoAddress,
            pmCurrency,
            pmNetwork,
            pmAddress,
            // Bank fields
            bankName,
            accountName,
            accountNumber,
            ifscSwiftCode,
            accountType,
            bankDetails
        } = req.body;

        const userId = req.user.id;

        // Validate required fields
        if (!amount || !method || !mt5AccountId || !password) {
            return res.status(400).json({
                ok: false,
                error: 'Amount, method, MT5 account ID, and password are required'
            });
        }

        // Validate amount
        const withdrawalAmount = parseFloat(amount);
        if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
            return res.status(400).json({
                ok: false,
                error: 'Invalid withdrawal amount'
            });
        }

        // Check withdrawal limits
        const MIN_AMOUNT = 10;
        const MAX_AMOUNT = 20000;
        if (withdrawalAmount < MIN_AMOUNT || withdrawalAmount > MAX_AMOUNT) {
            return res.status(400).json({
                ok: false,
                error: `Withdrawal amount must be between $${MIN_AMOUNT} and $${MAX_AMOUNT}`
            });
        }

        // Verify user password
        const userResult = await pool.query(
            'SELECT password FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: 'User not found'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, userResult.rows[0].password);
        if (!isPasswordValid) {
            return res.status(401).json({
                ok: false,
                error: 'Invalid password'
            });
        }

        // Verify MT5 account belongs to user
        const accountResult = await pool.query(
            'SELECT id FROM trading_accounts WHERE account_number = $1 AND user_id = $2',
            [mt5AccountId, userId]
        );

        if (accountResult.rows.length === 0) {
            return res.status(403).json({
                ok: false,
                error: 'MT5 account not found or does not belong to you'
            });
        }

        // Check MT5 account balance
        try {
            const balanceResult = await mt5Service.getClientBalance(parseInt(mt5AccountId));
            const currentBalance = balanceResult.data?.Balance || 0;

            if (currentBalance < withdrawalAmount) {
                return res.status(400).json({
                    ok: false,
                    error: `Insufficient balance. Available: $${currentBalance.toFixed(2)}`
                });
            }
        } catch (error) {
            console.error('Failed to check MT5 balance:', error);
            return res.status(500).json({
                ok: false,
                error: 'Failed to verify account balance'
            });
        }

        // Validate payment method specific fields
        if (method === 'crypto') {
            if (!cryptoAddress && !pmAddress) {
                return res.status(400).json({
                    ok: false,
                    error: 'Crypto address is required for crypto withdrawals'
                });
            }
        } else if (method === 'bank') {
            if (!accountNumber && !bankDetails) {
                return res.status(400).json({
                    ok: false,
                    error: 'Bank account details are required for bank withdrawals'
                });
            }
        }

        // Create withdrawal record
        const insertResult = await pool.query(
            `INSERT INTO withdrawals (
        user_id, amount, currency, method, payment_method,
        bank_name, account_name, account_number, ifsc_swift_code, account_type, bank_details,
        crypto_address, wallet_address, pm_currency, pm_network, pm_address,
        mt5_account_id, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'pending', NOW(), NOW())
      RETURNING *`,
            [
                userId, withdrawalAmount, currency, method, paymentMethod,
                bankName, accountName, accountNumber, ifscSwiftCode, accountType, bankDetails,
                cryptoAddress, cryptoAddress || pmAddress, pmCurrency, pmNetwork, pmAddress,
                mt5AccountId
            ]
        );

        const withdrawal = insertResult.rows[0];

        // TODO: Send email notification to user
        // TODO: Notify admin (optional)

        res.status(201).json({
            ok: true,
            message: 'Withdrawal request submitted successfully',
            withdrawal: {
                id: withdrawal.id,
                amount: withdrawal.amount,
                currency: withdrawal.currency,
                method: withdrawal.method,
                status: withdrawal.status,
                createdAt: withdrawal.created_at
            }
        });
    } catch (error) {
        console.error('Create withdrawal error:', error);
        res.status(500).json({
            ok: false,
            error: error.message || 'Failed to create withdrawal request'
        });
    }
});

/**
 * GET /api/withdrawals/my
 * Get user's withdrawal history
 */
router.get('/my', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, limit = 50 } = req.query;

        let query = `
      SELECT 
        id, amount, currency, method, payment_method,
        bank_name, account_name, account_number, ifsc_swift_code, account_type,
        crypto_address, wallet_address, pm_currency, pm_network,
        mt5_account_id, status, external_transaction_id,
        rejection_reason, created_at, updated_at, approved_at, rejected_at
      FROM withdrawals
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
            ok: true,
            items: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Get user withdrawals error:', error);
        res.status(500).json({
            ok: false,
            error: error.message || 'Failed to fetch withdrawals'
        });
    }
});

export default router;
