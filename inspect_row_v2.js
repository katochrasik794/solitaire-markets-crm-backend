import pool from './config/database.js';

async function checkRow() {
    try {
        const res = await pool.query('SELECT * FROM trading_accounts LIMIT 1');
        if (res.rows.length > 0) {
            console.log('--- COLUMNS ---');
            Object.keys(res.rows[0]).forEach(key => console.log(key));
            console.log('--- END COLUMNS ---');
        } else {
            console.log('--- FIELDS ---');
            res.fields.forEach(f => console.log(f.name));
            console.log('--- END FIELDS ---');
        }
    } catch (error) {
        console.error('Row check failed:', error);
    } finally {
        await pool.end();
    }
}

checkRow();
