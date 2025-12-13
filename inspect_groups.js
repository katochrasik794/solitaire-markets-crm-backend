
import pool from './config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function inspectGroups() {
    try {
        // Get columns
        const colsRes = await pool.query(
            `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'mt5_groups'`
        );
        console.log('Columns:', colsRes.rows.map(r => `${r.column_name} (${r.data_type})`));

        // Get data
        const res = await pool.query('SELECT * FROM mt5_groups');
        console.log('Groups Data:', JSON.stringify(res.rows, null, 2));

        pool.end();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

inspectGroups();
