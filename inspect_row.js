import pool from './config/database.js';

async function checkRow() {
    try {
        const res = await pool.query('SELECT * FROM trading_accounts LIMIT 1');
        if (res.rows.length > 0) {
            console.log('Column names found in trading_accounts:');
            console.log(Object.keys(res.rows[0]));
        } else {
            console.log('Table exists but is empty. Fetching column names from query result fields...');
            console.log(res.fields.map(f => f.name));
        }
    } catch (error) {
        console.error('Row check failed:', error);
    } finally {
        await pool.end();
    }
}

checkRow();
