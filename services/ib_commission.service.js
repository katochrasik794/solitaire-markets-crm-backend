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
            const { account_number: login, group_id: groupId } = account;

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
 * Process a single trade and store commission if applicable
 */
const processTradeCommission = async (ibId, clientId, login, groupId, trade, pipRate) => {
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

        // Check if already processed
        const checkResult = await client.query(
            "SELECT id FROM ib_commissions WHERE trade_ticket = $1",
            [ticket]
        );

        if (checkResult.rows.length > 0) return;

        // Calculate duration
        const openTs = new Date(openTime).getTime();
        const closeTs = new Date(closeTime).getTime();
        const durationSeconds = Math.floor((closeTs - openTs) / 1000);

        let status = 'processed';
        let exclusionReason = null;

        // Rule: Duration <= 60 seconds excluded (as seen in MyCommission.jsx dummy text)
        if (durationSeconds <= 60) {
            status = 'excluded';
            exclusionReason = 'Trade duration <= 60 seconds';
        }

        // Calculate commission
        // Simplified formula: lots * pipRate * 10 (assuming $10 per pip per lot for many symbols)
        // In a real system, we'd fetch actual pip_value from MT5 for each symbol
        const pipValue = 10.0; // Placeholder for actual pip value calculation
        const commissionAmount = status === 'processed' ? (lots * pipRate * pipValue) : 0;

        // Insert into database
        await client.query(
            `INSERT INTO ib_commissions (
                ib_id, client_id, mt5_account_id, trade_ticket, symbol, 
                lots, profit, commission_amount, group_id, pip_rate, 
                pip_value, trade_open_time, trade_close_time, duration_seconds, 
                status, exclusion_reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [
                ibId, clientId, login, ticket, symbol,
                lots, profit, commissionAmount, groupId, pipRate,
                pipValue, openTime, closeTime, durationSeconds,
                status, exclusionReason
            ]
        );

        // If commission was earned, update IB's wallet balance
        if (commissionAmount > 0) {
            await client.query(
                "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
                [commissionAmount, ibId]
            );

            // Also log the transaction in a ledger if we had one
        }

    } catch (error) {
        console.error(`Error processing trade ${trade.ticket}:`, error);
    } finally {
        client.release();
    }
};
