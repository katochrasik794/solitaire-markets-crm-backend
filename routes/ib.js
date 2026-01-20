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
                message: 'Access denied. You must be an approved IB.'
            });
        }
        next();
    } catch (error) {
        console.error('ensureIB middleware error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * GET /api/ib/status
 * Get IB status for current user
 */
router.get('/status', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            'SELECT ib_requests.id, status, ib_type, referral_code, is_banned FROM ib_requests JOIN users ON ib_requests.user_id = users.id WHERE user_id = $1 ORDER BY ib_requests.created_at DESC LIMIT 1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: { isIB: false, status: null }
            });
        }

        const isBanned = result.rows[0].is_banned;
        res.json({
            success: true,
            data: {
                isIB: result.rows[0].status === 'approved' && !isBanned,
                status: isBanned ? 'locked' : result.rows[0].status,
                ibType: result.rows[0].ib_type,
                referralCode: result.rows[0].referral_code
            }
        });
    } catch (error) {
        console.error('GET /ib/status error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/ib/dashboard
 * Get summary stats for IB dashboard
 */
router.get('/dashboard', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Get IB Profile & Referral Code
        const ibResult = await pool.query(
            'SELECT referral_code FROM users WHERE id = $1',
            [userId]
        );
        const referralCode = ibResult.rows[0]?.referral_code;

        // 2. Get Total Network Clients Count & Team Balance
        const clientsResult = await pool.query(
            `WITH RECURSIVE referral_tree AS (
                SELECT id, referral_code, 1 as level FROM users WHERE referred_by = $1
                UNION ALL
                SELECT u.id, u.referral_code, rt.level + 1
                FROM users u
                INNER JOIN referral_tree rt ON u.referred_by = rt.referral_code
                WHERE rt.level < 10
            )
            SELECT 
                COUNT(rt.id) as client_count,
                COALESCE(SUM(ta.balance), 0) as total_team_balance
            FROM referral_tree rt
            LEFT JOIN trading_accounts ta ON rt.id = ta.user_id AND ta.platform = 'MT5' AND ta.is_demo = FALSE`,
            [referralCode]
        );

        // 3. Get Wallet Balances (Available/Pending)
        const walletResult = await pool.query(
            'SELECT balance, currency FROM wallets WHERE user_id = $1',
            [userId]
        );

        // 4. Get active groups and merge with IB's specific pip rates
        const activeGroupsResult = await pool.query(
            'SELECT id, group_name, dedicated_name FROM mt5_groups WHERE is_active = true AND LOWER(group_name) NOT LIKE \'%demo%\''
        );

        const ibRequestResult = await pool.query(
            'SELECT group_pip_commissions, ib_balance, plan_type, show_commission_structure FROM ib_requests WHERE user_id = $1 AND status = $2',
            [userId, 'approved']
        );
        const ibRates = ibRequestResult.rows[0]?.group_pip_commissions || {};
        const groups = activeGroupsResult.rows.map(g => ({
            id: g.id,
            name: g.dedicated_name || g.group_name,
            rate: parseFloat(ibRates[g.id] || 0),
            isActive: parseFloat(ibRates[g.id] || 0) > 0
        }));
        // 5. Get Personal Trading Accounts Stats
        const myAccountsResult = await pool.query(
            'SELECT COUNT(*) as count, COALESCE(SUM(balance), 0) as balance, COALESCE(SUM(equity), 0) as equity FROM trading_accounts WHERE user_id = $1 AND platform = $2 AND is_demo = FALSE',
            [userId, 'MT5']
        );

        // 6. Get IB Status
        const ibStatusResult = await pool.query(
            'SELECT ir.status, ir.ib_type, u.is_banned FROM ib_requests ir JOIN users u ON ir.user_id = u.id WHERE ir.user_id = $1 ORDER BY ir.created_at DESC LIMIT 1',
            [userId]
        );

        // 7. Get Recent Withdrawals
        const withdrawalsResult = await pool.query(
            'SELECT amount, status, payment_method as method, created_at FROM ib_withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
            [userId]
        );

        res.json({
            success: true,
            data: {
                referralCode,
                stats: {
                    clientCount: parseInt(clientsResult.rows[0]?.client_count || 0),
                    teamBalance: parseFloat(clientsResult.rows[0]?.total_team_balance || 0),
                    availableBalance: parseFloat(ibRequestResult.rows[0]?.ib_balance || 0),
                    currency: walletResult.rows[0]?.currency || 'USD',
                    groups: groups,
                    myAccountCount: parseInt(myAccountsResult.rows[0]?.count || 0),
                    myTotalBalance: parseFloat(myAccountsResult.rows[0]?.balance || 0),
                    myTotalEquity: parseFloat(myAccountsResult.rows[0]?.equity || 0),
                    ibStatus: ibStatusResult.rows[0]?.is_banned ? 'locked' : (ibStatusResult.rows[0]?.status || 'none'),
                    ibType: ibStatusResult.rows[0]?.ib_type || 'normal',
                    planType: ibRequestResult.rows[0]?.plan_type,
                    showCommissionStructure: ibRequestResult.rows[0]?.show_commission_structure ?? true
                },
                recentWithdrawals: withdrawalsResult.rows
            }
        });
    } catch (error) {
        console.error('GET /ib/dashboard error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/ib/clients
 * Get list of referred users
 */
router.get('/clients', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        const ibResult = await pool.query('SELECT referral_code FROM users WHERE id = $1', [userId]);
        const referralCode = ibResult.rows[0]?.referral_code;

        if (!referralCode) {
            return res.json({
                success: true,
                data: {
                    clients: [],
                    total: 0,
                    page,
                    limit
                }
            });
        }

        let query = `
      WITH RECURSIVE referral_tree AS (
        -- Root: direct referrals
        SELECT id, first_name, last_name, email, created_at, referral_code, referred_by, 1 as level,
               CAST(NULL AS VARCHAR) as referred_by_name, CAST(NULL AS VARCHAR) as referred_by_email
        FROM users
        WHERE referred_by = $1

        UNION ALL

        -- Recursive step: indirect referrals
        SELECT u.id, u.first_name, u.last_name, u.email, u.created_at, u.referral_code, u.referred_by, rt.level + 1,
               rt.first_name || ' ' || rt.last_name, rt.email
        FROM users u
        INNER JOIN referral_tree rt ON u.referred_by = rt.referral_code
        WHERE rt.level < 10 -- Limit depth to prevent infinite loops
      )
      SELECT 
        rt.id, rt.first_name, rt.last_name, rt.email, rt.created_at as join_date, rt.level,
        rt.referred_by_name, rt.referred_by_email,
        COUNT(DISTINCT ta.id) as account_count,
        COALESCE(SUM(ta.balance), 0) as total_balance,
        ir.status as ib_status,
        ir.group_pip_commissions as sub_ib_rates,
        ir.ib_balance as ib_balance,
        ir.id as ib_request_id,
        (
             COALESCE((SELECT SUM(commission_amount) FROM ib_commissions WHERE ib_id = rt.id), 0) +
             COALESCE((SELECT SUM(amount) FROM ib_distributions WHERE ib_id = ir.id), 0)
        ) as total_commission_earned
      FROM referral_tree rt
      LEFT JOIN trading_accounts ta ON rt.id = ta.user_id AND ta.platform = 'MT5' AND ta.is_demo = FALSE
      LEFT JOIN ib_requests ir ON ir.user_id = rt.id AND ir.status = 'approved'
      WHERE 1=1
    `;
        const params = [referralCode];

        if (search) {
            query += ` AND (LOWER(rt.first_name) LIKE $2 OR LOWER(rt.last_name) LIKE $2 OR LOWER(rt.email) LIKE $2)`;
            params.push(`%${search.toLowerCase()}%`);
        }

        query += ` GROUP BY rt.id, rt.first_name, rt.last_name, rt.email, rt.created_at, rt.level, rt.referred_by_name, rt.referred_by_email, ir.status, ir.group_pip_commissions, ir.ib_balance, ir.id 
                   ORDER BY rt.level ASC, rt.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Also get total count for pagination
        let countQuery = `
          WITH RECURSIVE referral_tree AS (
            SELECT id, first_name, last_name, email, referral_code, level
            FROM (SELECT id, first_name, last_name, email, referral_code, 1 as level FROM users WHERE referred_by = $1) as root
            UNION ALL
            SELECT u.id, u.first_name, u.last_name, u.email, u.referral_code, rt.level + 1
            FROM users u
            INNER JOIN referral_tree rt ON u.referred_by = rt.referral_code
            WHERE rt.level < 10
          )
          SELECT COUNT(*) FROM referral_tree rt WHERE 1=1
        `;
        const countParams = [referralCode];
        if (search) {
            countQuery += ` AND (LOWER(rt.first_name) LIKE $2 OR LOWER(rt.last_name) LIKE $2 OR LOWER(rt.email) LIKE $2)`;
            countParams.push(`%${search.toLowerCase()}%`);
        }
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            data: {
                clients: result.rows,
                total: total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('GET /ib/clients error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/ib/tree
 * Get hierarchical network tree
 */
router.get('/tree', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = req.user.id;
        const ibResult = await pool.query('SELECT referral_code FROM users WHERE id = $1', [userId]);
        const rootReferralCode = ibResult.rows[0]?.referral_code;

        const buildTree = async (refCode, level = 1, maxLevel = 3) => {
            if (level > maxLevel || !refCode) return [];

            const result = await pool.query(
                `SELECT u.id, u.first_name, u.last_name, u.email, u.referral_code,
                ir.status as ib_status, ir.ib_type
         FROM users u
         LEFT JOIN ib_requests ir ON u.id = ir.user_id AND ir.status = 'approved'
         WHERE u.referred_by = $1`,
                [refCode]
            );

            const children = [];
            for (const row of result.rows) {
                const subChildren = row.referral_code ? await buildTree(row.referral_code, level + 1, maxLevel) : [];
                children.push({
                    id: row.id,
                    name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
                    email: row.email,
                    level: `L${level}`,
                    type: row.ib_status === 'approved' ? (row.ib_type || 'IB') : 'Client',
                    children: subChildren
                });
            }
            return children;
        };

        const tree = await buildTree(rootReferralCode);

        res.json({
            success: true,
            data: tree
        });
    } catch (error) {
        console.error('GET /ib/tree error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/ib/profile
 * Get IB profile details
 */
router.get('/profile', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = parseInt(req.user.id);
        if (isNaN(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }

        const result = await pool.query(
            `SELECT 
                u.first_name, u.last_name, u.email, u.referral_code, u.referred_by, u.is_banned,
                ir.status as ib_status, ir.ib_type, ir.approved_at, ir.ib_balance, ir.plan_type, ir.show_commission_structure
             FROM users u
             JOIN ib_requests ir ON u.id = ir.user_id
             WHERE u.id = $1 AND ir.status = 'approved'
             ORDER BY ir.created_at DESC LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'IB profile not found' });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('GET /ib/profile error:', error);
        res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
    }
});

/**
 * POST /api/ib/select-plan
 * Allow Master IB to select their plan (Normal/Advanced)
 */
router.post('/select-plan', authenticate, ensureIB, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { plan_type } = req.body;

        if (!plan_type || !['normal', 'advanced'].includes(plan_type)) {
            return res.status(400).json({
                success: false,
                message: 'Valid plan_type is required (normal or advanced)'
            });
        }

        // Check if plan is already set
        const statusRes = await pool.query(
            'SELECT plan_type FROM ib_requests WHERE user_id = $1 AND status = $2',
            [userId, 'approved']
        );

        if (statusRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Approved IB request not found' });
        }

        if (statusRes.rows[0].plan_type !== null) {
            return res.status(400).json({
                success: false,
                message: 'Plan is already set and cannot be changed'
            });
        }

        // Update plan_type
        await pool.query(
            'UPDATE ib_requests SET plan_type = $1, updated_at = NOW() WHERE user_id = $2 AND status = $3',
            [plan_type, userId, 'approved']
        );

        res.json({
            success: true,
            message: `Successfully enrolled in ${plan_type} plan`
        });
    } catch (error) {
        console.error('POST /ib/select-plan error:', error);
        next(error);
    }
});

/**
 * GET /api/ib/commission/summary
 * Get aggregated statistics for commission analytics
 */
router.get('/commission/summary', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = req.user.id;
        const { start_date, end_date, granularity = 'day' } = req.query;

        // Default range: 30 days
        let start = start_date && start_date !== 'all' ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        let end = end_date ? new Date(end_date) : new Date();

        // If All Time is requested
        if (start_date === 'all') {
            const userRes = await pool.query('SELECT created_at FROM users WHERE id = $1', [userId]);
            start = userRes.rows[0]?.created_at || new Date('2025-01-01');
        }

        // Validate dates
        if (isNaN(start.getTime())) start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (isNaN(end.getTime())) end = new Date();

        const tableCheck = await pool.query(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ib_commissions')"
        );

        if (!tableCheck.rows[0].exists) {
            return res.json({
                success: true,
                data: {
                    total_commission: 0,
                    this_month: 0,
                    avg_daily: 0,
                    active_clients: 0,
                    byCategory: [],
                    monthlyTrend: [],
                    availableBalance: 0
                }
            });
        }

        const statsResult = await pool.query(
            `SELECT 
                COALESCE(SUM(commission_amount), 0) as total_commission,
                COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN commission_amount ELSE 0 END), 0) as this_month,
                COUNT(DISTINCT client_id) as active_clients,
                COALESCE(SUM(CASE WHEN ib_id = client_id THEN commission_amount ELSE 0 END), 0) as my_commission,
                COALESCE(SUM(CASE WHEN lots > 0 AND ib_id = client_id THEN lots ELSE 0 END), 0) as my_lots,
                COALESCE(SUM(CASE WHEN ib_id != client_id THEN commission_amount ELSE 0 END), 0) as client_commission,
                COALESCE(SUM(CASE WHEN lots > 0 AND ib_id != client_id THEN lots ELSE 0 END), 0) as client_lots
             FROM ib_commissions 
             WHERE ib_id = $1 AND status = 'processed'
             AND created_at BETWEEN $2 AND $3`,
            [userId, start, end]
        );

        // Get excluded trades stats
        const excludedResult = await pool.query(
            `SELECT 
                COUNT(*) as count,
                COALESCE(SUM(lots), 0) as lots,
                COALESCE(SUM(CASE WHEN ib_id = client_id THEN 1 ELSE 0 END), 0) as my_count,
                COALESCE(SUM(CASE WHEN ib_id = client_id THEN lots ELSE 0 END), 0) as my_lots,
                COALESCE(SUM(CASE WHEN ib_id != client_id THEN 1 ELSE 0 END), 0) as client_count,
                COALESCE(SUM(CASE WHEN ib_id != client_id THEN lots ELSE 0 END), 0) as client_lots
             FROM ib_commissions
             WHERE ib_id = $1 AND status = 'excluded'
             AND created_at BETWEEN $2 AND $3`,
            [userId, start, end]
        );

        // Get wallet balances
        const walletResult = await pool.query(
            'SELECT balance, currency FROM wallets WHERE user_id = $1',
            [userId]
        );

        // Get by category
        const categoryResult = await pool.query(
            `SELECT 
                CASE 
                    WHEN symbol LIKE '%XAU%' OR symbol LIKE '%XAG%' THEN 'Commodities'
                    WHEN symbol LIKE '%BTC%' OR symbol LIKE '%ETH%' THEN 'Crypto'
                    WHEN symbol LIKE '%US30%' OR symbol LIKE '%NAS10%' THEN 'Indices'
                    ELSE 'Forex'
                END as category,
                COALESCE(SUM(commission_amount), 0) as amount
             FROM ib_commissions
             WHERE ib_id = $1 AND status = 'processed'
             AND created_at BETWEEN $2 AND $3
             GROUP BY category`,
            [userId, start, end]
        );

        // Get total manual distributions
        const distributionResult = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as total 
             FROM ib_distributions d
             JOIN ib_requests ir ON d.ib_id = ir.id
             WHERE ir.user_id = $1
             AND d.created_at BETWEEN $2 AND $3`,
            [userId, start, end]
        );
        const totalDistribution = parseFloat(distributionResult.rows[0]?.total || 0);

        // Get Available Balance from ib_requests
        const ibBalanceResult = await pool.query(
            'SELECT ib_balance FROM ib_requests WHERE user_id = $1 AND status = \'approved\'',
            [userId]
        );
        const availableBalance = parseFloat(ibBalanceResult.rows[0]?.ib_balance || 0);

        // Get monthly/weekly/daily trend using generate_series to fill gaps
        let interval = '1 day';
        let format = 'Mon DD';
        if (granularity === 'week') {
            interval = '1 week';
            format = 'Mon DD';
        } else if (granularity === 'month') {
            interval = '1 month';
            format = 'Mon YYYY';
        }

        const trendResult = await pool.query(
            `WITH date_series AS (
                SELECT generate_series($2::timestamp, $3::timestamp, $4::interval) as period
            )
            SELECT 
                TO_CHAR(ds.period, $5) as label,
                COALESCE(SUM(c.commission_amount), 0) as amount
            FROM date_series ds
            LEFT JOIN ib_commissions c ON DATE_TRUNC($6, c.created_at) = DATE_TRUNC($6, ds.period)
                AND c.ib_id = $1 AND c.status = 'processed'
            GROUP BY ds.period
            ORDER BY ds.period`,
            [userId, start, end, interval, format, granularity]
        );

        // Get top symbols
        const symbolsResult = await pool.query(
            `SELECT 
                symbol,
                CASE 
                    WHEN symbol LIKE '%XAU%' OR symbol LIKE '%XAG%' THEN 'Commodities'
                    WHEN symbol LIKE '%BTC%' OR symbol LIKE '%ETH%' THEN 'Crypto'
                    WHEN symbol LIKE '%US30%' OR symbol LIKE '%NAS10%' THEN 'Indices'
                    ELSE 'Forex'
                END as category,
                COALESCE(SUM(commission_amount), 0) as commission,
                COUNT(*) as trades,
                COALESCE(SUM(lots), 0) as lots
            FROM ib_commissions
            WHERE ib_id = $1 AND status = 'processed'
            AND created_at BETWEEN $2 AND $3
            GROUP BY symbol, category
            ORDER BY commission DESC
            LIMIT 10`,
            [userId, start, end]
        );

        res.json({
            success: true,
            data: {
                ...statsResult.rows[0],
                excluded: excludedResult.rows[0],
                availableBalance: availableBalance,
                currency: walletResult.rows[0]?.currency || 'USD',
                byCategory: categoryResult.rows,
                monthlyTrend: trendResult.rows,
                topSymbols: symbolsResult.rows
            }
        });
    } catch (error) {
        console.error('GET /ib/commission/summary error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/ib/commission/history
 * Get detailed commission entries
 */
router.get('/commission/history', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const tableCheck = await pool.query(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ib_commissions')"
        );

        if (!tableCheck.rows[0].exists) {
            return res.json({ success: true, data: [], total: 0 });
        }

        const result = await pool.query(
            `SELECT 
                ic.*,
                u.first_name || ' ' || u.last_name as client_name
             FROM ib_commissions ic
             JOIN users u ON ic.client_id = u.id
             WHERE ic.ib_id = $1
             ORDER BY ic.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('GET /ib/commission/history error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/ib/referral-report
 * Get deposit/withdrawal summary for referral network
 */
router.get('/referral-report', authenticate, ensureIB, async (req, res) => {
    try {
        const userId = req.user.id;

        const ibResult = await pool.query('SELECT referral_code FROM users WHERE id = $1', [userId]);
        const rootRef = ibResult.rows[0]?.referral_code;

        if (!rootRef) {
            return res.json({ success: true, data: { summary: {}, levels: {} } });
        }

        // Recursive function to get data for all levels
        const getLevelData = async (refCode, level = 1, maxLevel = 3) => {
            if (level > maxLevel) return [];

            const clients = await pool.query(
                `SELECT 
                    u.id, u.first_name, u.last_name, u.email, u.referral_code, 
                    u.created_at,
                    COALESCE(SUM(CASE WHEN d.status = 'approved' THEN d.amount ELSE 0 END), 0) as total_deposits,
                    COUNT(CASE WHEN d.status = 'approved' THEN 1 END) as deposit_count,
                    COALESCE(SUM(CASE WHEN w.status = 'approved' THEN w.amount ELSE 0 END), 0) as total_withdrawals,
                    COUNT(CASE WHEN w.status = 'approved' THEN 1 END) as withdrawal_count
                 FROM users u
                 LEFT JOIN deposit_requests d ON u.id = d.user_id
                 LEFT JOIN withdrawals w ON u.id = w.user_id
                 WHERE u.referred_by = $1
                 GROUP BY u.id`,
                [refCode]
            );

            let allClientsForThisLevel = [];
            for (const client of clients.rows) {
                const subClients = await getLevelData(client.referral_code, level + 1, maxLevel);
                allClientsForThisLevel.push({
                    ...client,
                    level: `L${level}`,
                    subClients
                });
            }
            return allClientsForThisLevel;
        };

        const hierarchy = await getLevelData(rootRef);

        // Flatten to levels for the report components
        const reportData = {
            summary: {
                totalReferrals: 0,
                totalDeposits: 0,
                totalWithdrawals: 0,
                depositCount: 0,
                withdrawalCount: 0
            },
            levels: {
                L1: { referrals: 0, deposits: 0, withdrawals: 0, clients: [] },
                L2: { referrals: 0, deposits: 0, withdrawals: 0, clients: [] },
                L3: { referrals: 0, deposits: 0, withdrawals: 0, clients: [] }
            }
        };

        const processNode = (nodes) => {
            for (const node of nodes) {
                const levelKey = node.level;
                if (reportData.levels[levelKey]) {
                    reportData.levels[levelKey].referrals++;
                    reportData.levels[levelKey].deposits += parseFloat(node.total_deposits);
                    reportData.levels[levelKey].withdrawals += parseFloat(node.total_withdrawals);
                    reportData.levels[levelKey].clients.push({
                        id: node.id,
                        name: `${node.first_name || ''} ${node.last_name || ''}`.trim(),
                        email: node.email,
                        deposits: { amount: node.total_deposits, count: node.deposit_count },
                        withdrawals: { amount: node.total_withdrawals, count: node.withdrawal_count },
                        netAmount: parseFloat(node.total_deposits) - parseFloat(node.total_withdrawals),
                        join_date: node.created_at,
                        type: 'Client'
                    });

                    reportData.summary.totalReferrals++;
                    reportData.summary.totalDeposits += parseFloat(node.total_deposits);
                    reportData.summary.totalWithdrawals += parseFloat(node.total_withdrawals);
                    reportData.summary.depositCount += parseInt(node.deposit_count);
                    reportData.summary.withdrawalCount += parseInt(node.withdrawal_count);
                }
                if (node.subClients) processNode(node.subClients);
            }
        };

        processNode(hierarchy);

        res.json({
            success: true,
            data: reportData
        });
    } catch (error) {
        console.error('GET /ib/referral-report error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

export default router;
