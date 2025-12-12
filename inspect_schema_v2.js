import pool from './config/database.js';

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'trading_accounts'
      ORDER BY ordinal_position;
    `);
        console.log('--- SCHEMA START ---');
        res.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type}`);
        });
        console.log('--- SCHEMA END ---');
    } catch (error) {
        console.error('Schema check failed:', error);
    } finally {
        await pool.end();
    }
}

checkSchema();
