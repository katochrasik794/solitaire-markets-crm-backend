import dotenv from 'dotenv';
dotenv.config();

console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
    console.log('DATABASE_URL length:', process.env.DATABASE_URL.length);
}

import pg from 'pg';
const { Pool } = pg;

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
};

const pool = new Pool(poolConfig);

const runMigration = async () => {
    console.log('Starting Migration V3...');
    const sql = `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sumsub_applicant_id VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_profile JSONB;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'unverified';
  `;

    try {
        console.log('Connecting...');
        const client = await pool.connect();
        console.log('Connected!');

        console.log('Executing SQL...');
        await client.query(sql);
        console.log('Migration completed successfully');

        client.release();
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

runMigration();
