import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import crypto from 'crypto';

/**
 * Middleware to verify JWT token
 */
export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided or invalid format'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Token verification failed'
    });
  }
};



/**
 * Admin authentication middleware
 */
export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'your-secret-key');

    // Check if it's an admin token
    if (!decoded.adminId) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Check if token is blacklisted
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Check for "logout all" marker first
    const logoutAllCheck = await pool.query(
      `SELECT id FROM admin_token_blacklist 
       WHERE admin_id = $1 
       AND token_hash = $2 
       AND expires_at > NOW()`,
      [decoded.adminId, 'LOGOUT_ALL_' + decoded.adminId]
    );

    if (logoutAllCheck.rows.length > 0) {
      return res.status(401).json({
        success: false,
        message: 'Session has been logged out from all devices'
      });
    }

    // Check if this specific token is blacklisted
    const blacklistCheck = await pool.query(
      `SELECT id FROM admin_token_blacklist 
       WHERE admin_id = $1 
       AND token_hash = $2 
       AND expires_at > NOW()`,
      [decoded.adminId, tokenHash]
    );

    if (blacklistCheck.rows.length > 0) {
      return res.status(401).json({
        success: false,
        message: 'Token has been revoked'
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    console.error('Admin Auth Error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Token verification failed',
      error: error.message
    });
  }
};
