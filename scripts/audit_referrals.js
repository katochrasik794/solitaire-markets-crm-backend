import pool from '../config/database.js';

async function checkReferrals() {
    try {
        console.log('--- Referral Data Audit ---');

        const users = await pool.query('SELECT id, email, referral_code, referred_by FROM users');
        console.log(`Total users: ${users.rows.length}`);

        const nullRefCodes = users.rows.filter(u => !u.referral_code);
        console.log(`Users with NULL referral_code: ${nullRefCodes.length}`);
        if (nullRefCodes.length > 0) {
            console.log('Sample NULL referral_code users:', nullRefCodes.slice(0, 3));
        }

        const withReferredBy = users.rows.filter(u => u.referred_by);
        console.log(`Users with referred_by set: ${withReferredBy.length}`);
        if (withReferredBy.length > 0) {
            console.log('Sample referred_by users:', withReferredBy.slice(0, 3));
        }

        const ibRequests = await pool.query('SELECT user_id, status FROM ib_requests WHERE status = \'approved\'');
        const approvedIBIds = ibRequests.rows.map(r => r.user_id);

        const approvedIBUsers = users.rows.filter(u => approvedIBIds.includes(u.id));
        console.log(`Approved IB Users count from users table: ${approvedIBUsers.length}`);
        console.log('Approved IB Users sample (ids and ref_codes):', approvedIBUsers.map(u => ({ id: u.id, ref_code: u.referral_code })));

    } catch (error) {
        console.error('Audit error:', error);
    } finally {
        process.exit();
    }
}

checkReferrals();
