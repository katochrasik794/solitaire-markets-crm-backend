import express from 'express';
import pool from '../config/database.js';
import { authenticate, authenticateAdmin } from '../middleware/auth.js';
import { sendEmail } from '../services/email.js';

const router = express.Router();
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@solitairemarkets.me';

/**
 * GET /api/support
 * List user's tickets
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM support_tickets 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
            [req.user.id]
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('List tickets error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
    }
});

/**
 * POST /api/support
 * Create new ticket
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { subject, category, message, priority } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ success: false, error: 'Subject and message are required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Create ticket
            const ticketResult = await client.query(
                `INSERT INTO support_tickets (user_id, subject, category, priority, status)
         VALUES ($1, $2, $3, $4, 'open')
         RETURNING id`,
                [req.user.id, subject, category || 'General', priority || 'medium']
            );
            const ticketId = ticketResult.rows[0].id;

            // Create initial message
            await client.query(
                `INSERT INTO support_messages (ticket_id, sender_id, sender_type, message)
         VALUES ($1, $2, 'user', $3)`,
                [ticketId, req.user.id, message]
            );

            await client.query('COMMIT');

            // Send notification to support
            try {
                const userEmail = req.user.email; // Assuming req.user has email from auth middleware
                // If req.user doesn't have email, we might need to fetch it. 
                // authenticate middleware usually decodes token. Token might have email.
                // Let's assume it does or fetch it if needed.
                // Actually, let's fetch user details to be safe or use what's available.

                await sendEmail({
                    to: SUPPORT_EMAIL,
                    subject: `[New Ticket #${ticketId}] ${subject}`,
                    html: `
                        <h3>New Support Ticket Created</h3>
                        <p><strong>User:</strong> ${req.user.id}</p>
                        <p><strong>Category:</strong> ${category}</p>
                        <p><strong>Priority:</strong> ${priority}</p>
                        <p><strong>Subject:</strong> ${subject}</p>
                        <hr />
                        <p>${message}</p>
                    `
                });
            } catch (emailErr) {
                console.error('Failed to send support notification email:', emailErr);
            }

            res.json({
                success: true,
                message: 'Ticket created successfully',
                ticketId
            });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ success: false, error: 'Failed to create ticket' });
    }
});

/**
 * ============================================
 * Admin Endpoints (MUST be before /:id routes)
 * ============================================
 */

/**
 * GET /api/support/admin/all
 * Admin: List all tickets
 */
router.get('/admin/all', authenticateAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        let query = `
      SELECT t.*, u.email as user_email, u.first_name || ' ' || u.last_name as user_name,
             ar.name as assigned_role_name,
             a.username as assigned_to_username, a.email as assigned_to_email
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN admin_roles ar ON t.assigned_role_id = ar.id
      LEFT JOIN admin a ON t.assigned_to = a.id
    `;
        const params = [];

        // Get admin info to check role assignment
        const adminId = req.admin?.adminId;
        let adminRole = null;
        let isSuperAdmin = true;
        
        if (adminId) {
            try {
                const adminResult = await pool.query(
                    `SELECT role FROM admin WHERE id = $1`,
                    [adminId]
                );
                if (adminResult.rows.length > 0) {
                    adminRole = adminResult.rows[0].role;
                    // Super admin if role is 'admin', 'super_admin', or null/empty
                    isSuperAdmin = !adminRole || adminRole === 'admin' || adminRole === 'super_admin';
                }
            } catch (err) {
                console.error('Error fetching admin role:', err);
                // Default to super admin on error
            }
        }

        if (status && status !== 'all') {
            // Handle 'opened' vs 'open' mismatch just in case
            const searchStatus = status === 'opened' ? 'open' : status;
            
            // Filter by status AND role assignment
            // Super admin sees all tickets, others see only assigned tickets
            if (isSuperAdmin) {
                query += ` WHERE LOWER(TRIM(t.status)) = LOWER(TRIM($1))`;
                params.push(searchStatus);
            } else {
                query += ` WHERE LOWER(TRIM(t.status)) = LOWER(TRIM($1)) 
                          AND (t.assigned_role_id IS NULL OR t.assigned_role_id = $2)`;
                params.push(searchStatus, adminRole);
            }
        } else {
            // No status filter, but still filter by role if not super admin
            if (!isSuperAdmin) {
                query += ` WHERE (t.assigned_role_id IS NULL OR t.assigned_role_id = $1)`;
                params.push(adminRole);
            }
        }

        query += ` ORDER BY t.updated_at DESC`;

        const result = await pool.query(query, params);
        console.log('Admin list tickets result:', result.rows.length, 'rows');
        console.log('Query:', query);
        console.log('Params:', params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Admin list tickets error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
    }
});

/**
 * GET /api/support/admin/:id
 * Admin: Get ticket details
 */
router.get('/admin/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if admin has access (super admin or assigned role)
        const adminId = req.admin?.adminId;
        let adminRole = null;
        let isSuperAdmin = true;
        
        if (adminId) {
            try {
                const adminResult = await pool.query(
                    `SELECT role FROM admin WHERE id = $1`,
                    [adminId]
                );
                if (adminResult.rows.length > 0) {
                    adminRole = adminResult.rows[0].role;
                    isSuperAdmin = !adminRole || adminRole === 'admin' || adminRole === 'super_admin';
                }
            } catch (err) {
                console.error('Error fetching admin role:', err);
            }
        }

        let ticketQuery = `
            SELECT t.*, u.email as user_email, u.first_name || ' ' || u.last_name as user_name,
                   ar.name as assigned_role_name,
                   a.username as assigned_to_username, a.email as assigned_to_email
            FROM support_tickets t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN admin_roles ar ON t.assigned_role_id = ar.id
            LEFT JOIN admin a ON t.assigned_to = a.id
            WHERE t.id = $1
        `;
        const ticketParams = [id];

        if (!isSuperAdmin) {
            ticketQuery += ` AND (t.assigned_role_id IS NULL OR t.assigned_role_id = $2)`;
            ticketParams.push(adminRole);
        }

        const ticketResult = await pool.query(ticketQuery, ticketParams);

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const messagesResult = await pool.query(
            `SELECT m.*, 
         CASE 
           WHEN m.sender_type = 'user' THEN (SELECT first_name || ' ' || last_name FROM users WHERE id = m.sender_id)
           WHEN m.sender_type = 'admin' THEN (SELECT username FROM admin WHERE id = m.sender_id)
         END as sender_name
       FROM support_messages m
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ticket: ticketResult.rows[0],
                messages: messagesResult.rows
            }
        });
    } catch (error) {
        console.error('Admin get ticket details error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch ticket' });
    }
});

/**
 * POST /api/support/admin/:id/reply
 * Admin: Reply to ticket
 */
router.post('/admin/:id/reply', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { message, status } = req.body;

        // Fetch ticket to get user_id
        const ticketResult = await pool.query(
            `SELECT t.*, u.email as user_email, u.first_name 
             FROM support_tickets t
             JOIN users u ON t.user_id = u.id
             WHERE t.id = $1`,
            [id]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }
        const ticket = ticketResult.rows[0];

        // Add message
        await pool.query(
            `INSERT INTO support_messages (ticket_id, sender_id, sender_type, message)
       VALUES ($1, $2, 'admin', $3)`,
            [id, req.admin.adminId, message]
        );

        // Update status only if explicitly provided, otherwise keep current status
        // Don't auto-change to 'answered' - tickets stay 'open' until explicitly closed
        if (status && status !== 'open') {
            await pool.query(
                `UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2`,
                [status, id]
            );
        } else {
            // Just update the timestamp
            await pool.query(
                `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
                [id]
            );
        }

        // Send notification to user
        try {
            await sendEmail({
                to: ticket.user_email,
                subject: `[Support Reply] ${ticket.subject}`,
                html: `
                    <h3>Support Team Replied</h3>
                    <p>Hi ${ticket.first_name || 'User'},</p>
                    <p>You have a new reply on your support ticket <strong>#${id}</strong>.</p>
                    <hr />
                    <p>${message}</p>
                    <hr />
                    <p>You can view the full conversation in your dashboard.</p>
                `
            });
        } catch (emailErr) {
            console.error('Failed to send user notification email:', emailErr);
        }

        res.json({ success: true, message: 'Replied successfully' });
    } catch (error) {
        console.error('Admin reply error:', error);
        res.status(500).json({ success: false, error: 'Failed to reply' });
    }
});

/**
 * POST /api/support/admin/:id/status
 * Admin: Update status only
 */
router.post('/admin/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await pool.query(
            `UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2`,
            [status, id]
        );

        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        console.error('Admin update status error:', error);
        res.status(500).json({ success: false, error: 'Failed to update status' });
    }
});

/**
 * POST /api/support/admin/:id/assign
 * Admin: Assign ticket to a role
 */
router.post('/admin/:id/assign', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        let { roleId } = req.body;

        // Convert empty string to null
        if (roleId === '' || roleId === undefined) {
            roleId = null;
        } else {
            // Convert to integer if provided
            roleId = parseInt(roleId);
            if (isNaN(roleId)) {
                return res.status(400).json({ success: false, error: 'Invalid role ID' });
            }
            
            // Verify role exists
            const roleCheck = await pool.query(
                `SELECT id FROM admin_roles WHERE id = $1`,
                [roleId]
            );
            if (roleCheck.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Role not found' });
            }
        }

        // Verify ticket exists
        const ticketResult = await pool.query(
            `SELECT id FROM support_tickets WHERE id = $1`,
            [id]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        // Update assigned role and open ticket if it was closed (when transferred)
        await pool.query(
            `UPDATE support_tickets 
             SET assigned_role_id = $1, 
                 status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
                 updated_at = NOW() 
             WHERE id = $2`,
            [roleId, id]
        );

        res.json({ success: true, message: 'Ticket assigned successfully' });
    } catch (error) {
        console.error('Admin assign ticket error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to assign ticket' });
    }
});

/**
 * ============================================
 * User Endpoints (MUST be after admin routes)
 * ============================================
 */

/**
 * GET /api/support/:id
 * Get ticket details and messages
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch ticket (verify ownership)
        const ticketResult = await pool.query(
            `SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2`,
            [id, req.user.id]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        // Fetch messages
        const messagesResult = await pool.query(
            `SELECT m.*, 
        CASE 
          WHEN m.sender_type = 'user' THEN (SELECT first_name || ' ' || last_name FROM users WHERE id = m.sender_id)
          WHEN m.sender_type = 'admin' THEN (SELECT username FROM admin WHERE id = m.sender_id)
        END as sender_name
       FROM support_messages m
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ticket: ticketResult.rows[0],
                messages: messagesResult.rows
            }
        });
    } catch (error) {
        console.error('Get ticket details error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch ticket details' });
    }
});

/**
 * POST /api/support/:id/reply
 * Reply to a ticket
 */
router.post('/:id/reply', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        // Verify ownership
        const ticketResult = await pool.query(
            `SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2`,
            [id, req.user.id]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }
        const ticket = ticketResult.rows[0];

        // Add message
        await pool.query(
            `INSERT INTO support_messages (ticket_id, sender_id, sender_type, message)
       VALUES ($1, $2, 'user', $3)`,
            [id, req.user.id, message]
        );

        // Update ticket updated_at and status (optional: re-open if closed)
        await pool.query(
            `UPDATE support_tickets SET updated_at = NOW(), status = 'open' WHERE id = $1`,
            [id]
        );

        // Send notification to support
        try {
            await sendEmail({
                to: SUPPORT_EMAIL,
                subject: `[Reply on #${id}] ${ticket.subject}`,
                html: `
                    <h3>New Reply from User</h3>
                    <p><strong>Ticket ID:</strong> #${id}</p>
                    <p><strong>Subject:</strong> ${ticket.subject}</p>
                    <hr />
                    <p>${message}</p>
                `
            });
        } catch (emailErr) {
            console.error('Failed to send reply notification email:', emailErr);
        }

        res.json({ success: true, message: 'Reply added successfully' });
    } catch (error) {
        console.error('Reply error:', error);
        res.status(500).json({ success: false, error: 'Failed to send reply' });
    }
});


export default router;
