import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/payment-details
 * Get all payment details for the authenticated user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, payment_method, payment_details, status, created_at, updated_at, reviewed_at, rejection_reason
       FROM payment_details
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/payment-details
 * Add a new payment detail (submitted for admin review)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { payment_method, payment_details } = req.body;

    // Validation
    if (!payment_method || !['bank_transfer', 'usdt_trc20'].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method. Must be "bank_transfer" or "usdt_trc20"'
      });
    }

    if (!payment_details || typeof payment_details !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Payment details must be a valid object'
      });
    }

    // Check if user already has 3 approved or pending payment details
    const countResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM payment_details
       WHERE user_id = $1 AND status IN ('pending', 'approved')`,
      [userId]
    );

    const count = parseInt(countResult.rows[0].count);
    if (count >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 3 payment details allowed. Please delete an existing one before adding a new one.'
      });
    }

    // Validate payment details based on method
    if (payment_method === 'bank_transfer') {
      const required = ['bankName', 'accountName', 'accountNumber', 'ifscSwiftCode'];
      for (const field of required) {
        if (!payment_details[field] || payment_details[field].trim() === '') {
          return res.status(400).json({
            success: false,
            message: `${field} is required for bank transfer`
          });
        }
      }

      // Check for duplicate bank transfer details (same bank, account number, and IFSC/SWIFT)
      const duplicateCheck = await pool.query(
        `SELECT id, status, payment_details
         FROM payment_details
         WHERE user_id = $1 
           AND payment_method = 'bank_transfer'
           AND status IN ('pending', 'approved')`,
        [userId]
      );

      for (const existing of duplicateCheck.rows) {
        const existingDetails = typeof existing.payment_details === 'string' 
          ? JSON.parse(existing.payment_details) 
          : existing.payment_details;
        
        // Normalize for comparison (trim and lowercase)
        const existingAccountNumber = (existingDetails.accountNumber || '').trim().toLowerCase();
        const existingIfscSwift = (existingDetails.ifscSwiftCode || '').trim().toLowerCase();
        const newAccountNumber = (payment_details.accountNumber || '').trim().toLowerCase();
        const newIfscSwift = (payment_details.ifscSwiftCode || '').trim().toLowerCase();

        if (existingAccountNumber === newAccountNumber && existingIfscSwift === newIfscSwift) {
          return res.status(400).json({
            success: false,
            message: `This payment method already exists with ${existing.status} status. Please use a different account or delete the existing one.`
          });
        }
      }
    } else if (payment_method === 'usdt_trc20') {
      if (!payment_details.walletAddress || payment_details.walletAddress.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Wallet address is required for USDT TRC20'
        });
      }

      // Check for duplicate USDT TRC20 wallet address
      const duplicateCheck = await pool.query(
        `SELECT id, status, payment_details
         FROM payment_details
         WHERE user_id = $1 
           AND payment_method = 'usdt_trc20'
           AND status IN ('pending', 'approved')`,
        [userId]
      );

      const newWalletAddress = (payment_details.walletAddress || '').trim().toLowerCase();

      for (const existing of duplicateCheck.rows) {
        const existingDetails = typeof existing.payment_details === 'string' 
          ? JSON.parse(existing.payment_details) 
          : existing.payment_details;
        
        const existingWalletAddress = (existingDetails.walletAddress || '').trim().toLowerCase();

        if (existingWalletAddress === newWalletAddress) {
          return res.status(400).json({
            success: false,
            message: `This wallet address already exists with ${existing.status} status. Please use a different wallet or delete the existing one.`
          });
        }
      }
    }

    // Insert payment detail with status 'pending'
    const result = await pool.query(
      `INSERT INTO payment_details (user_id, payment_method, payment_details, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, payment_method, payment_details, status, created_at`,
      [userId, payment_method, JSON.stringify(payment_details)]
    );

    res.json({
      success: true,
      message: 'Payment details submitted successfully. Awaiting admin approval.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Add payment details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add payment details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * DELETE /api/payment-details/:id
 * Delete a payment detail (only if pending or rejected)
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentDetailId = parseInt(req.params.id);

    if (isNaN(paymentDetailId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment detail ID'
      });
    }

    // Check if payment detail exists and belongs to user
    const check = await pool.query(
      'SELECT id, status FROM payment_details WHERE id = $1 AND user_id = $2',
      [paymentDetailId, userId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment detail not found'
      });
    }

    const paymentDetail = check.rows[0];

    // Only allow deletion of pending or rejected payment details
    if (paymentDetail.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete approved payment details. Please contact support.'
      });
    }

    // Delete the payment detail
    await pool.query(
      'DELETE FROM payment_details WHERE id = $1 AND user_id = $2',
      [paymentDetailId, userId]
    );

    res.json({
      success: true,
      message: 'Payment detail deleted successfully'
    });
  } catch (error) {
    console.error('Delete payment details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete payment details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;

