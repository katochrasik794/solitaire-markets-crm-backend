import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import * as mt5Service from '../services/mt5.service.js';
import { logUserAction } from '../services/logging.service.js';

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
            walletId,
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

        // Validate required fields - either mt5AccountId or walletId must be provided
        if (!amount || !method || !password) {
            return res.status(400).json({
                ok: false,
                error: 'Amount, method, and password are required'
            });
        }

        if (!mt5AccountId && !walletId) {
            return res.status(400).json({
                ok: false,
                error: 'Either MT5 account ID or wallet ID is required'
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

        // Validate withdrawal limits if withdrawing from MT5 account
        if (mt5AccountId) {
            // Get account's group limits
            const accountGroupResult = await pool.query(
                `SELECT 
                  ta.account_number,
                  mg.minimum_withdrawal,
                  mg.maximum_withdrawal
                FROM trading_accounts ta
                LEFT JOIN mt5_groups mg ON ta.mt5_group_name = mg.group_name AND mg.is_active = TRUE
                WHERE ta.account_number = $1 AND ta.user_id = $2 AND ta.platform = 'MT5'`,
                [mt5AccountId, userId]
            );

            if (accountGroupResult.rows.length === 0) {
                return res.status(404).json({
                    ok: false,
                    error: 'MT5 account not found or does not belong to you'
                });
            }

            const groupLimits = accountGroupResult.rows[0];
            const minWithdrawal = parseFloat(groupLimits.minimum_withdrawal || 0);
            const maxWithdrawal = groupLimits.maximum_withdrawal ? parseFloat(groupLimits.maximum_withdrawal) : null;

            // Validate against limits
            if (withdrawalAmount < minWithdrawal) {
                return res.status(400).json({
                    ok: false,
                    error: `Minimum withdrawal amount is ${currency} ${minWithdrawal.toFixed(2)}`
                });
            }

            if (maxWithdrawal !== null && withdrawalAmount > maxWithdrawal) {
                return res.status(400).json({
                    ok: false,
                    error: `Maximum withdrawal amount is ${currency} ${maxWithdrawal.toFixed(2)}`
                });
            }
        }

        // Verify user password from users table (for confirmation only, not stored in withdrawals)
        const userResult = await pool.query(
            'SELECT id, password_hash FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: 'User not found'
            });
        }

        // Compare provided password with user's login password from users table
        if (!userResult.rows[0].password_hash) {
            return res.status(500).json({
                ok: false,
                error: 'User password not found in database'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, userResult.rows[0].password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                ok: false,
                error: 'Invalid password. Please enter your login password.'
            });
        }

        let accountBalance = 0;
        let accountCurrency = currency;

        // Verify account belongs to user and check balance
        if (mt5AccountId) {
            // Verify MT5 account belongs to user and get balance from database
            const accountResult = await pool.query(
                'SELECT id, currency, balance, equity FROM trading_accounts WHERE account_number = $1 AND user_id = $2',
                [mt5AccountId, userId]
            );

            if (accountResult.rows.length === 0) {
                return res.status(403).json({
                    ok: false,
                    error: 'MT5 account not found or does not belong to you'
                });
            }

            accountCurrency = accountResult.rows[0].currency || currency;
            // Use balance from database (already synced from MT5)
            accountBalance = parseFloat(accountResult.rows[0].balance || 0);

            // If balance is 0 or null, try to get from equity as fallback
            if (accountBalance === 0 || !accountBalance) {
                accountBalance = parseFloat(accountResult.rows[0].equity || 0);
            }

            if (accountBalance < withdrawalAmount) {
                return res.status(400).json({
                    ok: false,
                    error: `Insufficient balance. Available: $${accountBalance.toFixed(2)}`
                });
            }
        } else if (walletId) {
            // Verify wallet belongs to user
            const walletResult = await pool.query(
                'SELECT id, balance, currency FROM wallets WHERE id = $1 AND user_id = $2 AND status = $3',
                [walletId, userId, 'active']
            );

            if (walletResult.rows.length === 0) {
                return res.status(403).json({
                    ok: false,
                    error: 'Wallet not found or does not belong to you'
                });
            }

            accountBalance = parseFloat(walletResult.rows[0].balance || 0);
            accountCurrency = walletResult.rows[0].currency || currency;

            if (accountBalance < withdrawalAmount) {
                return res.status(400).json({
                    ok: false,
                    error: `Insufficient balance. Available: $${accountBalance.toFixed(2)}`
                });
            }
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
        mt5_account_id, wallet_id, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pending', NOW(), NOW())
      RETURNING *`,
            [
                userId, withdrawalAmount, accountCurrency, method, paymentMethod,
                bankName, accountName, accountNumber, ifscSwiftCode, accountType, bankDetails,
                cryptoAddress, cryptoAddress || pmAddress, pmCurrency, pmNetwork, pmAddress,
                mt5AccountId || null, walletId || null
            ]
        );

        const withdrawal = insertResult.rows[0];

        const responseData = {
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
        };

        // TODO: Send email notification to user
        // TODO: Notify admin (optional)

        res.status(201).json(responseData);
        
        // Log user action
        setImmediate(async () => {
            await logUserAction({
                userId: req.user.id,
                userEmail: req.user.email,
                actionType: 'withdrawal_request',
                actionCategory: 'withdrawal',
                targetType: 'withdrawal',
                targetId: withdrawal.id,
                targetIdentifier: `Withdrawal #${withdrawal.id}`,
                description: `Requested withdrawal of $${withdrawal.amount} ${withdrawal.currency} via ${withdrawal.method}`,
                req,
                res,
                beforeData: null,
                afterData: responseData.withdrawal
            });
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

/**
 * GET /api/withdrawals/gateways
 * Get all active payment gateways for user withdrawals
 */
router.get('/gateways', authenticate, async (req, res) => {
  try {
    const getBaseUrl = () => {
      if (process.env.FRONTEND_URL) {
        return process.env.FRONTEND_URL.replace(/\/$/, '');
      }
      return 'http://localhost:5000';
    };

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
      WHERE is_active = TRUE AND COALESCE(is_withdrawal_enabled, FALSE) = TRUE
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
        : row.type_data;

      const baseUrl = getBaseUrl();
      return {
        id: row.id,
        type: typeMapping[row.type] || row.type.toLowerCase(),
        name: row.name,
        icon_url: row.icon_path ? `${baseUrl}${row.icon_path}` : null,
        qr_code_url: row.qr_code_path ? `${baseUrl}${row.qr_code_path}` : null,
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
    console.error('Get withdrawal gateways error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch withdrawal gateways'
    });
  }
});

export default router;
