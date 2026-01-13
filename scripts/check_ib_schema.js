import pool from '../config/database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkSchema() {
    try {
        console.log('--- ib_commissions schema ---');
        const resCommissions = await pool.query(`
          SELECT column_name, data_type, character_maximum_length
          FROM information_schema.columns
          WHERE table_name = 'ib_commissions'
        `);
        console.table(resCommissions.rows);

        console.log('--- ib_requests schema ---');
        const resRequests = await pool.query(`
          SELECT column_name, data_type, character_maximum_length
          FROM information_schema.columns
          WHERE table_name = 'ib_requests'
        `);
        console.table(resRequests.rows);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
