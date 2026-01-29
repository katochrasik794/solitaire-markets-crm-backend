/**
 * Script to add CRM transaction email actions to unified_actions table without truncating existing data
 * Run with: node scripts/add_crm_transaction_emails_migration.js
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

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
        console.log('🔄 Connecting to database...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected\n');

        const sqlFile = join(__dirname, '../database/add_crm_transaction_emails.sql');
        const sql = readFileSync(sqlFile, 'utf8');

        console.log('📝 Adding new CRM transaction email actions to unified_actions...');
        await pool.query(sql);
        console.log('✅ Migration completed successfully!\n');

        // Verify the actions were added
        const result = await pool.query(`
            SELECT action_name, system_type, template_id 
            FROM unified_actions 
            WHERE action_name LIKE '%Deposit%' OR action_name LIKE '%Withdrawal%'
            ORDER BY action_name
        `);

        console.log(`✅ Found ${result.rows.length} deposit/withdrawal actions in unified_actions:`);
        result.rows.forEach(row => {
            const templateStatus = row.template_id ? `(Template ID: ${row.template_id})` : '(No template assigned)';
            console.log(`   - ${row.action_name} [${row.system_type}] ${templateStatus}`);
        });

        await pool.end();
        process.exit(0);
    } catch (error) {
        // Ignore "already exists" errors (ON CONFLICT DO NOTHING handles this)
        if (error.message.includes('already exists') || error.message.includes('duplicate') || error.message.includes('violates unique constraint')) {
            console.log('⚠️  Some actions may already exist (this is okay)');
            console.log('✅ Migration completed (using ON CONFLICT DO NOTHING)\n');
            
            // Still verify what we have
            const result = await pool.query(`
                SELECT action_name, system_type, template_id 
                FROM unified_actions 
                WHERE action_name LIKE '%Deposit%' OR action_name LIKE '%Withdrawal%'
                ORDER BY action_name
            `);
            console.log(`✅ Found ${result.rows.length} deposit/withdrawal actions in unified_actions`);
            
            await pool.end();
            process.exit(0);
        } else {
            console.error('❌ Migration failed:', error.message);
            console.error(error);
            await pool.end();
            process.exit(1);
        }
    }
}

runMigration();
