import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function checkTemplates() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT COUNT(*) FROM email_templates');
        console.log(`Total templates in database: ${res.rows[0].count}`);

        const rows = await client.query('SELECT id, name FROM email_templates');
        console.log('Templates:', rows.rows);
    } catch (err) {
        console.error('Error checking templates:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkTemplates();
