import pool from './config/database.js';

async function checkConstraint() {
    try {
        const res = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid)
      FROM pg_constraint
      WHERE conname = 'trading_accounts_account_type_check';
    `);
        console.log('--- CONSTRAINT DEFINITION ---');
        console.table(res.rows);
    } catch (error) {
        console.error('Constraint check failed:', error);
    } finally {
        await pool.end();
    }
}

checkConstraint();
