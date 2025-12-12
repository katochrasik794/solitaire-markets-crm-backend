import pool from './config/database.js';

async function runMigration() {
    try {
        console.log('Altering account_type column length...');
        await pool.query('ALTER TABLE trading_accounts ALTER COLUMN account_type TYPE varchar(255)');
        console.log('Successfully increased account_type length to 255.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

runMigration();
