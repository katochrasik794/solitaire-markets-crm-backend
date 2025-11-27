import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Test route to verify KYC routes are working
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'KYC routes are working!' });
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads/kyc');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG) and PDF are allowed'));
    }
  }
});

/**
 * GET /api/kyc/status
 * Get KYC verification status for logged in user
 */
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, status, document_type, submitted_at, reviewed_at, rejection_reason
       FROM kyc_verifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No verification submitted yet'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get KYC status error:', error);
    next(error);
  }
});

/**
 * POST /api/kyc/submit
 * Submit KYC verification with documents
 */
router.post('/submit', authenticate, upload.fields([
  { name: 'frontDocument', maxCount: 1 },
  { name: 'backDocument', maxCount: 1 }
]), async (req, res, next) => {
  try {
    const {
      hasTradingExperience,
      employmentStatus,
      annualIncome,
      totalNetWorth,
      sourceOfWealth,
      documentType
    } = req.body;

    // Validation
    if (!hasTradingExperience || !employmentStatus || !annualIncome || 
        !totalNetWorth || !sourceOfWealth || !documentType) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (!req.files || !req.files.frontDocument) {
      return res.status(400).json({
        success: false,
        message: 'Front document is required'
      });
    }

    // Check if user already has a pending verification
    const existingCheck = await pool.query(
      'SELECT id FROM kyc_verifications WHERE user_id = $1 AND status = $2',
      [req.user.id, 'pending']
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending verification. Please wait for review.'
      });
    }

    // Store relative path from server root
    const frontDocumentPath = `/uploads/kyc/${req.files.frontDocument[0].filename}`;
    const backDocumentPath = req.files.backDocument && req.files.backDocument[0] 
      ? `/uploads/kyc/${req.files.backDocument[0].filename}`
      : null;

    // Insert KYC verification
    const result = await pool.query(
      `INSERT INTO kyc_verifications (
        user_id, has_trading_experience, employment_status, annual_income,
        total_net_worth, source_of_wealth, document_type,
        document_front_path, document_back_path, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, status, submitted_at`,
      [
        req.user.id,
        hasTradingExperience === 'true',
        employmentStatus,
        annualIncome,
        totalNetWorth,
        sourceOfWealth,
        documentType,
        frontDocumentPath,
        backDocumentPath,
        'pending'
      ]
    );

    res.json({
      success: true,
      message: 'Verification submitted successfully. Your documents are under review.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Submit KYC error:', error);
    next(error);
  }
});

export default router;

