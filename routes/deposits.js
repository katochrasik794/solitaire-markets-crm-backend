import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
      WHERE is_active = TRUE
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

    // Verify gateway exists and is active
    const gatewayCheck = await pool.query(
      'SELECT id FROM manual_payment_gateways WHERE id = $1 AND is_active = TRUE',
      [gateway_id]
    );

    if (gatewayCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Gateway not found or inactive'
      });
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
        parseFloat(amount),
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

    res.json({
      success: true,
      deposit: result.rows[0]
    });
  } catch (error) {
    console.error('Create deposit request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create deposit request'
    });
  }
});

export default router;

