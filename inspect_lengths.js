import pool from './config/database.js';

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'trading_accounts'
      AND data_type = 'character varying';
    `);
        console.log('--- VARCHAR COLUMNS ---');
        console.table(res.rows);
    } catch (error) {
        console.error('Schema check failed:', error);
    } finally {
        await pool.end();
    }
}

checkSchema();
