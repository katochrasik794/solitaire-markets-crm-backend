import pool from './config/database.js';

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'trading_accounts'
      AND data_type = 'character varying';
    `);
        console.log('--- COLUMNS ---');
        res.rows.forEach(r => {
            console.log(`${r.column_name}: ${r.character_maximum_length}`);
        });
        console.log('--- END ---');
    } catch (error) {
        console.error('Schema check failed:', error);
    } finally {
        await pool.end();
    }
}

checkSchema();
