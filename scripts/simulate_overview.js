import pool from '../config/database.js';

async function simulateEndpoints() {
    try {
        console.log('--- Simulating /overview/stats ---');
        const totalIBsResult = await pool.query('SELECT COUNT(*) as count FROM ib_requests');
        const totalIBs = parseInt(totalIBsResult.rows[0]?.count || 0);
        console.log('Total IBs (count):', totalIBs);

        const approvedIBsResult = await pool.query(
            `SELECT COUNT(*) as count FROM ib_requests WHERE status = 'approved'`
        );
        const approvedIBs = parseInt(approvedIBsResult.rows[0]?.count || 0);
        console.log('Approved IBs (count):', approvedIBs);

        const totalReferralsResult = await pool.query(
            `SELECT COUNT(*) as count 
             FROM users u
             WHERE u.referred_by IS NOT NULL 
               AND EXISTS (
                 SELECT 1 FROM ib_requests ir 
                 JOIN users ib_user ON ir.user_id = ib_user.id 
                 WHERE ir.status = 'approved' 
                   AND ib_user.referral_code = u.referred_by
               )`
        );
        console.log('Total Referrals (count):', totalReferralsResult.rows[0].count);

        console.log('\n--- Simulating /overview/system-summary ---');
        const summaryStats = await pool.query('SELECT COUNT(*) as count FROM ib_requests');
        console.log('Summary Total IBs:', summaryStats.rows[0].count);

    } catch (error) {
        console.error('Simulation error:', error);
    } finally {
        process.exit();
    }
}

simulateEndpoints();
