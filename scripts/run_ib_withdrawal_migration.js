import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000
});

async function runMigration() {
    try {
        const sqlFile = join(__dirname, '../database/migration_ib_withdrawals.sql');
        const sql = readFileSync(sqlFile, 'utf8');

        console.log('🔄 Running IB Withdrawals migration...');
        await pool.query(sql);
        console.log('✅ Migration successful!');

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        await pool.end();
        process.exit(1);
    }
}

runMigration();
