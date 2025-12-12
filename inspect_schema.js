import pool from './config/database.js';

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'trading_accounts';
    `);
        console.log('Schema for trading_accounts:');
        console.table(res.rows);
    } catch (error) {
        console.error('Schema check failed:', error);
    } finally {
        await pool.end();
    }
}

checkSchema();
