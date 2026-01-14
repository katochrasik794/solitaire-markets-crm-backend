import pool from '../config/database.js';
import * as mt5Service from './mt5.service.js';

/**
 * IB Commission Service
 * Handles calculation and storage of IB commissions from client trades
 */

/**
 * Calculate and sync commissions for all approved IBs
 */
export const syncAllCommissions = async () => {
    try {
        console.log('Starting IB commission sync...');

        // 1. Get all approved IBs
        const ibsResult = await pool.query(
            "SELECT u.id, u.referral_code, ir.id as ib_request_id, ir.group_pip_commissions FROM users u JOIN ib_requests ir ON u.id = ir.user_id WHERE ir.status = 'approved'"
        );

        for (const ib of ibsResult.rows) {
            await syncIBCommissions(ib);
        }

        console.log('IB commission sync completed.');
    } catch (error) {
        console.error('Error in syncAllCommissions:', error);
    }
};

/**
 * Sync commissions for a specific IB
 */
export const syncIBCommissions = async (ib) => {
    try {
        const { id: ibId, referralCode, group_pip_commissions: pipRates } = ib;

        // 2. Get all clients referred by this IB
        const clientsResult = await pool.query(
            "SELECT id FROM users WHERE referred_by = $1",
            [referralCode]
        );

        if (clientsResult.rows.length === 0) return;

        for (const client of clientsResult.rows) {
            await syncClientTrades(ibId, client.id, pipRates);
        }
    } catch (error) {
        console.error(`Error syncing commissions for IB ${ib.id}:`, error);
    }
};

/**
 * Sync trades and calculate commission for a specific client
 */
const syncClientTrades = async (ibId, clientId, pipRates) => {
    try {
        // 3. Get all MT5 accounts for this client
        const accountsResult = await pool.query(
            "SELECT account_number, group_id FROM trading_accounts WHERE user_id = $1 AND platform = 'MT5' AND is_demo = FALSE",
            [clientId]
        );

        for (const account of accountsResult.rows) {
            const { account_number: login, mt5_group_id: groupId } = account;

            // Get the pip rate for this group
            const pipRate = parseFloat(pipRates[groupId] || 0);
            if (pipRate <= 0) continue;

            // 4. Fetch closed trades from MT5 API
            // For now, we fetch trades from last 24 hours to keep it simple
            const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const tradesRes = await mt5Service.getClosedTrades(login, fromDate);

            if (tradesRes.success && tradesRes.data) {
                const trades = tradesRes.data.items || tradesRes.data; // Handle different API response formats

                for (const trade of trades) {
                    await processTradeCommission(ibId, clientId, login, groupId, trade, pipRate);
                }
            }
        }
    } catch (error) {
        console.error(`Error syncing trades for client ${clientId}:`, error);
    }
};

/**
 * Process a single trade and distribute commissions to all levels in the chain
 */
const processTradeCommission = async (directIbId, clientId, login, groupId, trade, directPipRate) => {
    const client = await pool.connect();
    try {
        const {
            ticket,
            symbol,
            volume: lots,
            profit,
            time_setup: openTime,
            time_done: closeTime
        } = trade;

        // 1. Initial Checks
        // Rule: IBs do not get commission on their own trading
        if (directIbId === clientId) return;

        // Calculate duration and check validity (Rule: duration > 60s)
        const openTs = new Date(openTime).getTime();
        const closeTs = new Date(closeTime).getTime();
        const durationSeconds = Math.floor((closeTs - openTs) / 1000);

        let status = 'processed';
        let exclusionReason = null;
        if (durationSeconds <= 60) {
            status = 'excluded';
            exclusionReason = 'Trade duration <= 60 seconds';
        }

        const pipValue = 10.0; // Placeholder for actual pip value calculation

        // 2. Fetch IB Info to get the chain
        const ibInfoRes = await client.query(
            "SELECT commission_chain, ib_level, root_master_id, referrer_ib_id FROM ib_requests WHERE user_id = $1 AND status = 'approved'",
            [directIbId]
        );

        if (ibInfoRes.rows.length === 0) return;
        const { commission_chain: chain, ib_level: myLevel, root_master_id: rootId, referrer_ib_id: parentId } = ibInfoRes.rows[0];

        // 3. Recursive Distribution Logic
        // We need to distribute for:
        // - Direct IB (Level N)
        // - All ancestors (Level N-1 down to 1)
        // - Root Master (Override)

        let currentIbId = directIbId;
        let currentClientReferrer = clientId; // For "referred_by" chain traversal if needed, but we use referrer_ib_id
        let nextLevelRate = 0; // The rate of the level BELOW the one we are currently calculating for

        // List of IBs to pay: [{ id, level, rate, isOverride }]
        const participants = [];

        // Add Direct IB
        participants.push({ id: directIbId, level: myLevel || 1, rate: directPipRate, isOverride: false });

        // If part of a chain, find ancestors
        if (chain && chain[groupId] && chain[groupId].length > 0) {
            const levelRates = chain[groupId]; // Array of rates [L1, L2, L3...]

            // Traverse up the chain using referrer_ib_id
            let loopLevel = (myLevel || 1) - 1;
            let loopParentId = parentId;

            while (loopLevel >= 1 && loopParentId) {
                const parentRate = levelRates[loopLevel - 1];
                participants.push({ id: loopParentId, level: loopLevel, rate: parentRate, isOverride: false });

                // Move up
                const pInfo = await client.query("SELECT referrer_ib_id FROM ib_requests WHERE user_id = $1 AND status = 'approved'", [loopParentId]);
                loopParentId = pInfo.rows.length > 0 ? pInfo.rows[0].referrer_ib_id : null;
                loopLevel--;
            }

            // ADD MASTER OVERRIDE
            // The Master IB is the one who created the link or the root_master_id
            const finalMasterId = rootId || loopParentId; // Potential fallback
            if (finalMasterId) {
                // Get Master's base rate for this group
                const masterRateRes = await client.query(
                    `SELECT (group_pip_commissions->>$1)::numeric as rate 
                     FROM ib_requests WHERE user_id = $2 AND status = 'approved'`,
                    [groupId, finalMasterId]
                );

                if (masterRateRes.rows.length > 0) {
                    const mRate = parseFloat(masterRateRes.rows[0].rate || 0);
                    participants.push({ id: finalMasterId, level: 0, rate: mRate, isOverride: true });
                }
            }
        }

        // 4. Execute Distribution (Top-Down Difference)
        // Sort participants by level DESC (Deepest first)
        // Levels: 5, 4, 3, 2, 1, 0 (Master)
        participants.sort((a, b) => b.level - a.level);

        let distributedSoFar = 0;
        for (const p of participants) {
            // Check if already processed for this specific IB and trade
            const checkResult = await client.query(
                "SELECT id FROM ib_commissions WHERE trade_ticket = $1 AND ib_id = $2",
                [ticket, p.id]
            );
            if (checkResult.rows.length > 0) {
                distributedSoFar = p.rate; // Update for next higher level's reference
                continue;
            }

            // Commission for this participant = (Their Absolute Rate) - (Sum of rates below them)
            // But since we are iterating up, it's simpler: Rate(Current) - Rate(Previous processed)
            const absoluteRate = p.rate;
            const diffRate = Math.max(0, absoluteRate - distributedSoFar);
            const commissionAmount = status === 'processed' ? (lots * diffRate * pipValue) : 0;

            // Insert Commission Entry
            await client.query(
                `INSERT INTO ib_commissions (
                    ib_id, client_id, mt5_account_id, trade_ticket, symbol, 
                    lots, profit, commission_amount, group_id, pip_rate, 
                    pip_value, trade_open_time, trade_close_time, duration_seconds, 
                    status, exclusion_reason, commission_level, is_override
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
                [
                    p.id, clientId, login, ticket, symbol,
                    lots, profit, commissionAmount, groupId, diffRate,
                    pipValue, openTime, closeTime, durationSeconds,
                    status, exclusionReason, p.level, p.isOverride
                ]
            );

            // Update Balance
            if (commissionAmount > 0) {
                await client.query(
                    "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
                    [commissionAmount, p.id]
                );
            }

            // Update tracked rate for next level
            distributedSoFar = absoluteRate;
        }

    } catch (error) {
        console.error(`Error processing trade ${trade.ticket}:`, error);
    } finally {
        client.release();
    }
};
