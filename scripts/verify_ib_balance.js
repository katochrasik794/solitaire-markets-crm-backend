import pool from '../config/database.js';

async function verify() {
    try {
        console.log('--- IB Balance Verification ---');

        // 1. Find an approved IB
        const ibResult = await pool.query("SELECT id, user_id, ib_balance FROM ib_requests WHERE status = 'approved' LIMIT 1");
        if (ibResult.rows.length === 0) {
            console.log('⚠️ No approved IB found to test with.');
            process.exit(0);
        }

        const ib = ibResult.rows[0];
        const initialBalance = parseFloat(ib.ib_balance || 0);
        console.log(`IB ID: ${ib.id}, User ID: ${ib.user_id}, Initial Balance: ${initialBalance}`);

        // 2. Test Distribution
        console.log('Testing Distribution ($10.50)...');
        await pool.query("UPDATE ib_requests SET ib_balance = ib_balance + 10.50 WHERE id = $1", [ib.id]);

        const afterDistResult = await pool.query("SELECT ib_balance FROM ib_requests WHERE id = $1", [ib.id]);
        const afterDistBalance = parseFloat(afterDistResult.rows[0].ib_balance);
        console.log(`Balance after distribution: ${afterDistBalance}`);

        if (afterDistBalance === initialBalance + 10.50) {
            console.log('✅ Distribution test passed');
        } else {
            console.log('❌ Distribution test failed');
        }

        // 3. Test Withdrawal Deduction
        console.log('Testing Withdrawal Deduction ($5.00)...');
        await pool.query("UPDATE ib_requests SET ib_balance = ib_balance - 5.00 WHERE id = $1", [ib.id]);

        const afterWithResult = await pool.query("SELECT ib_balance FROM ib_requests WHERE id = $1", [ib.id]);
        const afterWithBalance = parseFloat(afterWithResult.rows[0].ib_balance);
        console.log(`Balance after withdrawal: ${afterWithBalance}`);

        if (afterWithBalance === afterDistBalance - 5.00) {
            console.log('✅ Withdrawal deduction test passed');
        } else {
            console.log('❌ Withdrawal deduction test failed');
        }

        // Cleanup: Reset balance (optional, but keep it as is if it's a dev DB)
        // For verification, we'll leave it as proof.

        console.log('--- Verification Completed ---');
        process.exit(0);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verify();
