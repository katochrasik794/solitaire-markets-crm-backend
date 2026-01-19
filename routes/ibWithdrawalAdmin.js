import express from 'express';
import pool from '../config/database.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/admin/ib-withdrawals
 * Get all IB withdrawal requests
 */
router.get('/', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT w.*, u.first_name, u.last_name, u.email, pd.payment_details
             FROM ib_withdrawals w
             JOIN users u ON w.user_id = u.id
             LEFT JOIN payment_details pd ON w.payment_detail_id = pd.id
             ORDER BY w.created_at DESC`
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('GET /api/admin/ib-withdrawals error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * PATCH /api/admin/ib-withdrawals/:id/approve
 * Approve an IB withdrawal request and deduct balance
 */
router.patch('/:id/approve', authenticateAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const withdrawalId = req.params.id;
        const adminId = req.admin.adminId;

        await client.query('BEGIN');

        // 1. Get withdrawal details
        const withdrawalResult = await client.query(
            'SELECT * FROM ib_withdrawals WHERE id = $1 FOR UPDATE',
            [withdrawalId]
        );

        if (withdrawalResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
        }

        const withdrawal = withdrawalResult.rows[0];
        if (withdrawal.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: `Cannot approve. Current status is ${withdrawal.status}.` });
        }

        const { user_id, amount } = withdrawal;

        // 2. Check and deduct IB balance
        const ibResult = await client.query(
            'SELECT id, ib_balance FROM ib_requests WHERE user_id = $1 AND status = \'approved\' FOR UPDATE',
            [user_id]
        );

        if (ibResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Approved IB request not found. Cannot deduct balance.' });
        }

        const currentIBBalance = parseFloat(ibResult.rows[0].ib_balance || 0);
        if (currentIBBalance < parseFloat(amount)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'User has insufficient IB balance to complete this withdrawal' });
        }

        // 3. Deduct from IB balance
        await client.query(
            'UPDATE ib_requests SET ib_balance = ib_balance - $1, updated_at = NOW() WHERE id = $2',
            [amount, ibResult.rows[0].id]
        );

        // 4. Update withdrawal status
        await client.query(
            `UPDATE ib_withdrawals 
             SET status = 'approved', admin_id = $1, approved_at = NOW(), updated_at = NOW() 
             WHERE id = $2`,
            [adminId, withdrawalId]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Withdrawal approved and balance deducted' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ PATCH /api/admin/ib-withdrawals/:id/approve error:', {
            message: error.message,
            stack: error.stack,
            params: req.params,
            admin: req.admin
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        client.release();
    }
});

/**
 * PATCH /api/admin/ib-withdrawals/:id/reject
 * Reject an IB withdrawal request
 */
router.patch('/:id/reject', authenticateAdmin, async (req, res) => {
    try {
        const withdrawalId = req.params.id;
        const adminId = req.admin.adminId;
        const { reason } = req.body;

        console.log('🚫 Attempting to reject withdrawal:', { withdrawalId, adminId, reason });

        const result = await pool.query(
            `UPDATE ib_withdrawals 
             SET status = 'rejected', admin_id = $1, rejection_reason = $2, rejected_at = NOW(), updated_at = NOW() 
             WHERE id = $3 AND status = 'pending'
             RETURNING id`,
            [adminId, reason || 'Rejected by administrator', withdrawalId]
        );

        if (result.rows.length === 0) {
            console.log('⚠️ Rejection failed: Withdrawal not found or not pending', { withdrawalId });
            return res.status(404).json({ success: false, message: 'Withdrawal request not found or not in pending status' });
        }

        console.log('✅ Withdrawal rejected successfully:', withdrawalId);
        res.json({ success: true, message: 'Withdrawal request rejected' });
    } catch (error) {
        console.error('❌ PATCH /api/admin/ib-withdrawals/:id/reject error:', {
            message: error.message,
            stack: error.stack,
            params: req.params,
            body: req.body,
            admin: req.admin
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
