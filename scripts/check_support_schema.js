import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function checkSchema() {
    const client = await pool.connect();
    try {
        console.log('🔍 Checking support_messages constraints...');
        const res = await client.query(`
            SELECT conname, pg_get_constraintdef(c.oid)
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE conrelid = 'support_messages'::regclass
        `);
        res.rows.forEach(row => {
            console.log(`${row.conname}: ${row.pg_get_constraintdef}`);
        });
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

checkSchema();
