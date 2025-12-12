import pool from './config/database.js';

const runMigration = async () => {
    console.log('Starting KYC Migration...');
    const sql = `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sumsub_applicant_id VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_profile JSONB;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'unverified';
  `;

    try {
        console.log('Executing SQL:', sql);
        await pool.query(sql);
        console.log('Migration completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

runMigration();
