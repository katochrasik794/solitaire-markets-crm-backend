/**
 * Script to run the unified_actions table migration
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

    const sqlPath = path.join(__dirname, '../database/migration_unified_actions_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📝 Running unified_actions table migration...');
    await pool.query(sql);
    console.log('✅ Migration completed successfully!\n');

    // Verify table was created
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_actions'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('✅ unified_actions table exists');
      
      // Check column count
      const columnCount = await pool.query(`
        SELECT COUNT(*) as count
        FROM information_schema.columns
        WHERE table_name = 'unified_actions'
      `);
      console.log(`✅ Table has ${columnCount.rows[0].count} columns`);
    } else {
      console.log('❌ unified_actions table was not created');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    // Ignore "already exists" errors
    if (err.message.includes('already exists') || err.message.includes('duplicate')) {
      console.log('⚠️  Migration already applied (table or objects already exist)');
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






