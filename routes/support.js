import express from 'express';
import pool from '../config/database.js';
import { authenticate, authenticateAdmin } from '../middleware/auth.js';
import { sendEmail } from '../services/email.js';
import { sendTicketCreatedEmail, sendTicketResponseEmail } from '../services/templateEmail.service.js';

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
        console.log('📧 POST /api/support - Creating ticket');
        console.log('📧 Request body:', req.body);
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

            // Get user details for email
            const userResult = await client.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [req.user.id]);
            const user = userResult.rows[0];
            const userName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Valued Customer' : 'Valued Customer';
            const userEmail = user?.email;

            // Send notification to support
            try {
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

            // Send ticket created email to user
            if (userEmail) {
                setImmediate(async () => {
                    try {
                        await sendTicketCreatedEmail(userEmail, userName, ticketId, subject, category || 'General', priority || 'medium');
                        console.log(`Ticket created email sent to ${userEmail}`);
                    } catch (emailErr) {
                        console.error('Failed to send ticket created email:', emailErr);
                    }
                });
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
        
        // Check if assigned_role_id column exists
        let hasAssignedRoleColumn = false;
        let hasAssignedToColumn = false;
        try {
            const columnCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'support_tickets' 
                AND column_name IN ('assigned_role_id', 'assigned_to')
            `);
            hasAssignedRoleColumn = columnCheck.rows.some(r => r.column_name === 'assigned_role_id');
            hasAssignedToColumn = columnCheck.rows.some(r => r.column_name === 'assigned_to');
        } catch (err) {
            console.error('Error checking columns:', err);
        }

        let query = `
      SELECT t.*, u.email as user_email, u.first_name || ' ' || u.last_name as user_name
    `;
        
        // Add role and admin joins only if columns exist
        if (hasAssignedRoleColumn) {
            query += `, ar.name as assigned_role_name`;
        }
        if (hasAssignedToColumn) {
            query += `, a.username as assigned_to_username, a.email as assigned_to_email`;
        }
        
        // Calculate time taken for closed tickets (in seconds)
        query += `, CASE 
            WHEN t.status = 'closed' AND t.created_at IS NOT NULL AND t.updated_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (t.updated_at - t.created_at))
            ELSE NULL
        END as time_taken_seconds`;
        
        query += `
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
    `;
        
        if (hasAssignedRoleColumn) {
            query += ` LEFT JOIN admin_roles ar ON t.assigned_role_id = ar.id`;
        }
        if (hasAssignedToColumn) {
            query += ` LEFT JOIN admin a ON t.assigned_to = a.id`;
        }
        
        const params = [];

        // Get admin info to check role assignment
        const adminId = req.admin?.adminId;
        let adminRole = null;
        let isSuperAdmin = true;
        
        if (adminId) {
            try {
                const adminResult = await pool.query(
                    `SELECT admin_role FROM admin WHERE id = $1`,
                    [adminId]
                );
                if (adminResult.rows.length > 0) {
                    adminRole = adminResult.rows[0].admin_role;
                    // Super admin if admin_role is null, 'admin', 'superadmin', 'super_admin', or empty
                    isSuperAdmin = !adminRole || adminRole === '' || adminRole === 'admin' || adminRole === 'superadmin' || adminRole === 'super_admin';
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
            } else if (hasAssignedRoleColumn) {
                // For non-super admins, we need to find their role ID from admin_roles table
                // First, get the admin's role ID if they have a role assigned
                let adminRoleId = null;
                if (adminRole) {
                    try {
                        const roleIdResult = await pool.query(
                            `SELECT id FROM admin_roles WHERE name = $1`,
                            [adminRole]
                        );
                        if (roleIdResult.rows.length > 0) {
                            adminRoleId = roleIdResult.rows[0].id;
                        }
                    } catch (err) {
                        console.error('Error fetching role ID:', err);
                    }
                }
                query += ` WHERE LOWER(TRIM(t.status)) = LOWER(TRIM($1)) 
                          AND (t.assigned_role_id IS NULL OR t.assigned_role_id = $2)`;
                params.push(searchStatus, adminRoleId);
            } else {
                query += ` WHERE LOWER(TRIM(t.status)) = LOWER(TRIM($1))`;
                params.push(searchStatus);
            }
        } else {
            // No status filter, but still filter by role if not super admin
            if (!isSuperAdmin && hasAssignedRoleColumn) {
                // Get the admin's role ID from admin_roles table
                let adminRoleId = null;
                if (adminRole) {
                    try {
                        const roleIdResult = await pool.query(
                            `SELECT id FROM admin_roles WHERE name = $1`,
                            [adminRole]
                        );
                        if (roleIdResult.rows.length > 0) {
                            adminRoleId = roleIdResult.rows[0].id;
                        }
                    } catch (err) {
                        console.error('Error fetching role ID:', err);
                    }
                }
                query += ` WHERE (t.assigned_role_id IS NULL OR t.assigned_role_id = $1)`;
                params.push(adminRoleId);
            }
        }

        query += ` ORDER BY t.updated_at DESC`;

        const result = await pool.query(query, params);
        console.log('Admin list tickets result:', result.rows.length, 'rows');

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
                    `SELECT admin_role FROM admin WHERE id = $1`,
                    [adminId]
                );
                if (adminResult.rows.length > 0) {
                    adminRole = adminResult.rows[0].admin_role;
                    // Super admin if admin_role is null, 'admin', 'superadmin', 'super_admin', or empty
                    isSuperAdmin = !adminRole || adminRole === '' || adminRole === 'admin' || adminRole === 'superadmin' || adminRole === 'super_admin';
                }
            } catch (err) {
                console.error('Error fetching admin role:', err);
            }
        }

        // Check if columns exist
        let hasAssignedRoleColumn = false;
        let hasAssignedToColumn = false;
        try {
            const columnCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'support_tickets' 
                AND column_name IN ('assigned_role_id', 'assigned_to')
            `);
            hasAssignedRoleColumn = columnCheck.rows.some(r => r.column_name === 'assigned_role_id');
            hasAssignedToColumn = columnCheck.rows.some(r => r.column_name === 'assigned_to');
        } catch (err) {
            console.error('Error checking columns:', err);
        }

        let ticketQuery = `
            SELECT t.*, u.email as user_email, u.first_name || ' ' || u.last_name as user_name
        `;
        
        if (hasAssignedRoleColumn) {
            ticketQuery += `, ar.name as assigned_role_name`;
        }
        if (hasAssignedToColumn) {
            ticketQuery += `, a.username as assigned_to_username, a.email as assigned_to_email`;
        }
        
        // Calculate time taken for closed tickets (in seconds)
        ticketQuery += `, CASE 
            WHEN t.status = 'closed' AND t.created_at IS NOT NULL AND t.updated_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (t.updated_at - t.created_at))
            ELSE NULL
        END as time_taken_seconds`;
        
        ticketQuery += `
            FROM support_tickets t
            JOIN users u ON t.user_id = u.id
        `;
        
        if (hasAssignedRoleColumn) {
            ticketQuery += ` LEFT JOIN admin_roles ar ON t.assigned_role_id = ar.id`;
        }
        if (hasAssignedToColumn) {
            ticketQuery += ` LEFT JOIN admin a ON t.assigned_to = a.id`;
        }
        
        ticketQuery += ` WHERE t.id = $1`;
        const ticketParams = [id];

        if (!isSuperAdmin && hasAssignedRoleColumn) {
            // Get the admin's role ID from admin_roles table
            let adminRoleId = null;
            if (adminRole) {
                try {
                    const roleIdResult = await pool.query(
                        `SELECT id FROM admin_roles WHERE name = $1`,
                        [adminRole]
                    );
                    if (roleIdResult.rows.length > 0) {
                        adminRoleId = roleIdResult.rows[0].id;
                    }
                } catch (err) {
                    console.error('Error fetching role ID:', err);
                }
            }
            ticketQuery += ` AND (t.assigned_role_id IS NULL OR t.assigned_role_id = $2)`;
            ticketParams.push(adminRoleId);
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

        // Send notification to user using template
        try {
            const userName = ticket.first_name ? `${ticket.first_name} ${ticket.last_name || ''}`.trim() : 'Valued Customer';
            const currentStatus = status && status !== 'open' ? status : ticket.status || 'open';
            await sendTicketResponseEmail(ticket.user_email, userName, id, ticket.subject, message, currentStatus);
            console.log(`Ticket response email sent to ${ticket.user_email}`);
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

        // Check if assigned_role_id column exists
        let hasAssignedRoleColumn = false;
        try {
            const columnCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'support_tickets' 
                AND column_name = 'assigned_role_id'
            `);
            hasAssignedRoleColumn = columnCheck.rows.length > 0;
        } catch (err) {
            console.error('Error checking column:', err);
        }

        if (!hasAssignedRoleColumn) {
            return res.status(400).json({ 
                success: false, 
                error: 'Assignment feature not available. Please run the database migration: add_assigned_role_to_tickets.sql' 
            });
        }

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
