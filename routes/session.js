import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/session/check-valid
 * Check if the current session (token) is valid
 */
router.get('/check-valid', authenticate, (req, res) => {
    // If request reaches here, the authenticate middleware has already verified the token
    res.json({
        success: true,
        valid: true,
        user: {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role
        }
    });
});

export default router;
