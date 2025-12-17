import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function runMigration() {
    try {
        const sqlPath = path.join(process.cwd(), 'database', 'migration_add_email_tables.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        await pool.query(sql);
        console.log('✅ Migration completed successfully');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
