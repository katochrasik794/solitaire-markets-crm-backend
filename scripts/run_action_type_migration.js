/**
 * Script to run the action_type column migration for email_templates
 */

import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 30000
});

async function runMigration() {
  try {
    console.log('🔄 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected\n');

    const sqlPath = path.join(__dirname, '../database/migration_add_action_type.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📝 Running action_type column migration for email_templates...');
    await pool.query(sql);
    console.log('✅ Migration completed successfully!\n');

    // Verify column was added
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'email_templates' 
      AND column_name = 'action_type'
    `);

    if (columnCheck.rows.length > 0) {
      console.log('✅ action_type column exists in email_templates table');
    } else {
      console.log('⚠️  action_type column was not found (may need manual check)');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    // Ignore "already exists" errors
    if (err.message.includes('already exists') || err.message.includes('duplicate')) {
      console.log('⚠️  Migration already applied (action_type column already exists)');
      console.log('✅ This is okay - continuing...\n');
      await pool.end();
      process.exit(0);
    } else {
      console.error('❌ Migration failed:', err.message);
      console.error(err);
      await pool.end();
      process.exit(1);
    }
  }
}

runMigration();






