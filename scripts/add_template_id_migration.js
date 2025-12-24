/**
 * Migration Script: Add template_id to unified_actions
 */

import pool from '../config/database.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  let client;
  try {
    console.log('🔄 Adding template_id column to unified_actions...\n');

    client = await pool.connect();
    console.log('✅ Connected to database\n');

    const migrationPath = path.join(__dirname, '../database/migration_add_template_to_unified_actions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Executing migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration completed\n');

    // Verify
    const check = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'unified_actions' AND column_name = 'template_id'
    `);

    if (check.rows.length > 0) {
      console.log('✅ Verified: template_id column exists');
      console.log(`   Type: ${check.rows[0].data_type}`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

