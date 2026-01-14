import pool from '../config/database.js';

async function checkData() {
    try {
        console.log('--- Database Audit (Corrected) ---');

        // 1. IB Requests
        const ibRequests = await pool.query('SELECT id, user_id, status, ib_type FROM ib_requests');
        console.log(`\nIB Requests Table:`);
        console.log(`- Total records: ${ibRequests.rows.length}`);
        console.log(`- Approved: ${ibRequests.rows.filter(r => r.status === 'approved').length}`);
        console.log(`- Pending: ${ibRequests.rows.filter(r => r.status === 'pending').length}`);

        // 2. Users (Referrals)
        const referrals = await pool.query('SELECT COUNT(*) FROM users WHERE referred_by IS NOT NULL');
        console.log(`\nUsers Table:`);
        console.log(`- Reffered users: ${referrals.rows[0].count}`);

        // 3. Commissions
        const commissionCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'ib_commissions'
            );
        `);

        if (commissionCheck.rows[0].exists) {
            const commissions = await pool.query('SELECT COUNT(*) as count, SUM(commission_amount) as total FROM ib_commissions');
            console.log(`\nIB Commissions Table:`);
            console.log(`- Total records: ${commissions.rows[0].count}`);
            console.log(`- Total amount: ${commissions.rows[0].total}`);
        } else {
            console.log(`\nIB Commissions Table NOT FOUND`);
        }

    } catch (error) {
        console.error('Audit error:', error);
    } finally {
        process.exit();
    }
}

checkData();
