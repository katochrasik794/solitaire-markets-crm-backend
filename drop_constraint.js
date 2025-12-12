import pool from './config/database.js';

async function runMigration() {
    try {
        console.log('Dropping trading_accounts_account_type_check constraint...');
        await pool.query('ALTER TABLE trading_accounts DROP CONSTRAINT IF EXISTS trading_accounts_account_type_check');
        console.log('Successfully dropped constraint.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

runMigration();
