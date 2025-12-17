import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function clearBlacklist() {
    const client = await pool.connect();
    try {
        console.log('🧹 Clearing admin token blacklist...');
        const res = await client.query('DELETE FROM admin_token_blacklist');
        console.log(`✅ Deleted ${res.rowCount} entries from blacklist.`);
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

clearBlacklist();
