import pool from '../config/database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
    try {
        console.log('🔄 Starting Multi-Level IB Migration...');

        // 1. Create ib_commissions table if it doesn't exist (base definition)
        console.log('Ensuring ib_commissions table exists...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ib_commissions (
                id SERIAL PRIMARY KEY,
                ib_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                mt5_account_id VARCHAR(50) NOT NULL,
                trade_ticket BIGINT NOT NULL,
                symbol VARCHAR(50) NOT NULL,
                lots DECIMAL(18, 8) NOT NULL,
                profit DECIMAL(18, 8),
                commission_amount DECIMAL(18, 8) NOT NULL,
                group_id INTEGER,
                pip_rate DECIMAL(18, 8),
                pip_value DECIMAL(18, 8),
                trade_open_time TIMESTAMP,
                trade_close_time TIMESTAMP,
                duration_seconds INTEGER,
                status VARCHAR(20) DEFAULT 'processed',
                exclusion_reason TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ ib_commissions table ensured.');

        // 2. Remove old unique constraint on trade_ticket (which would block multi-level)
        console.log('Updating constraints for multi-level...');
        try {
            await pool.query(`ALTER TABLE ib_commissions DROP CONSTRAINT IF EXISTS unique_trade_commission`);
            console.log('✅ Old unique constraint dropped.');
        } catch (err) {
            console.log('ℹ️ No old unique constraint to drop.');
        }

        // 3. Add Level and Override columns to ib_commissions
        console.log('Adding multi-level columns to ib_commissions...');
        await pool.query(`ALTER TABLE ib_commissions ADD COLUMN IF NOT EXISTS commission_level INT DEFAULT NULL`);
        await pool.query(`ALTER TABLE ib_commissions ADD COLUMN IF NOT EXISTS is_override BOOLEAN DEFAULT FALSE`);
        console.log('✅ Multi-level columns added to ib_commissions.');

        // 4. Add NEW unique constraint (trade_ticket + ib_id)
        try {
            await pool.query(`ALTER TABLE ib_commissions ADD CONSTRAINT unique_trade_level_ib UNIQUE (trade_ticket, ib_id)`);
            console.log('✅ New composite unique constraint added.');
        } catch (err) {
            console.log('ℹ️ New unique constraint might already exist.');
        }

        // 5. Update ib_requests
        console.log('Updating ib_requests table...');
        await pool.query(`ALTER TABLE ib_requests ADD COLUMN IF NOT EXISTS commission_chain JSONB DEFAULT NULL`);
        await pool.query(`ALTER TABLE ib_requests ADD COLUMN IF NOT EXISTS ib_level INT DEFAULT NULL`);
        await pool.query(`ALTER TABLE ib_requests ADD COLUMN IF NOT EXISTS root_master_id INT DEFAULT NULL`);
        console.log('✅ ib_requests updated.');

        console.log('✨ Multi-Level IB Migration process finished!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
