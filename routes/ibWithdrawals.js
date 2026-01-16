import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * Middleware to ensure user is an approved IB
 */
const ensureIB = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            'SELECT status FROM ib_requests WHERE user_id = $1 AND status = $2',
            [userId, 'approved']
        );

        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only approved IBs can access this resource.'
            });
        }
        next();
    } catch (error) {
        console.error('ensureIB middleware error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * POST /api/ib-withdrawals
 * Create a new IB withdrawal request
 */
router.post('/', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, paymentDetailId } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid withdrawal amount'
            });
        }

        if (!paymentDetailId) {
            return res.status(400).json({
                success: false,
                message: 'Payment method is required'
            });
        }

        // 1. Check IB Available Balance (from ib_requests)
        const ibRequestResult = await pool.query(
            'SELECT ib_balance FROM ib_requests WHERE user_id = $1 AND status = $2',
            [userId, 'approved']
        );

        if (ibRequestResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Approved IB account not found'
            });
        }

        const balance = parseFloat(ibRequestResult.rows[0].ib_balance || 0);
        if (balance < parseFloat(amount)) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance'
            });
        }

        // 2. Verify Payment Detail belongs to user and is approved
        const paymentDetailResult = await pool.query(
            'SELECT id, payment_method FROM payment_details WHERE id = $1 AND user_id = $2 AND status = $3',
            [paymentDetailId, userId, 'approved']
        );

        if (paymentDetailResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or non-approved payment method'
            });
        }

        const paymentMethod = paymentDetailResult.rows[0].payment_method;

        // 3. Create withdrawal record
        const insertResult = await pool.query(
            `INSERT INTO ib_withdrawals (user_id, amount, payment_method, payment_detail_id, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING id, amount, status, created_at`,
            [userId, amount, paymentMethod, paymentDetailId]
        );

        res.status(201).json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            data: insertResult.rows[0]
        });
    } catch (error) {
        console.error('POST /api/ib-withdrawals error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/ib-withdrawals/my
 * Get authenticated IB's withdrawal history
 */
router.get('/my', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT w.*, pd.payment_details 
             FROM ib_withdrawals w
             LEFT JOIN payment_details pd ON w.payment_detail_id = pd.id
             WHERE w.user_id = $1
             ORDER BY w.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('GET /api/ib-withdrawals/my error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/ib-withdrawals/payment-methods
 * Get IB's approved payment methods for withdrawal
 */
router.get('/payment-methods', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            'SELECT id, payment_method, payment_details FROM payment_details WHERE user_id = $1 AND status = $2',
            [userId, 'approved']
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('GET /api/ib-withdrawals/payment-methods error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

export default router;
