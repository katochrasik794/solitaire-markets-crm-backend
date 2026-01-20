
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;

async function forceFixUser59() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    try {
        console.log('Force fixing user 59...');

        await pool.query('BEGIN');

        // 1. Force Update Users Table
        const userRes = await pool.query(
            `UPDATE users 
             SET kyc_status = 'approved', 
                 updated_at = NOW() 
             WHERE id = 59 
             RETURNING id, kyc_status, sumsub_applicant_id`
        );
        console.log('Users Table Updated:', userRes.rows[0]);

        // 2. Force Update KYC Verifications Table
        // Use a dummy success JSON to clear the error
        const successJson = JSON.stringify({
            status: "approved",
            forced_fix: true,
            timestamp: new Date().toISOString()
        });

        const kycRes = await pool.query(
            `UPDATE kyc_verifications
             SET status = 'approved',
                 sumsub_review_result = 'GREEN',
                 sumsub_review_comment = 'Manually verified via support request',
                 sumsub_verification_status = 'completed',
                 sumsub_verification_result = $1,
                 reviewed_at = NOW(),
                 updated_at = NOW()
             WHERE user_id = 59
             RETURNING *`,
            [successJson]
        );

        console.log('KYC Verifications Updated:', kycRes.rows[0]);

        await pool.query('COMMIT');
        console.log('Successfully committed changes.');

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

forceFixUser59();
