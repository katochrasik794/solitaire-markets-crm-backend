import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function listTickets() {
    const client = await pool.connect();
    try {
        console.log('🔍 Listing support tickets with status check...');
        const res = await client.query(`
            SELECT id, subject, status, length(status) as status_len
            FROM support_tickets
            ORDER BY created_at DESC
        `);
        if (res.rows.length === 0) {
            console.log('No tickets found.');
        } else {
            console.table(res.rows);
        }
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

listTickets();
