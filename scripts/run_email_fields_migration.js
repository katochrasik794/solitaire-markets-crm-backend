/**
 * Migration Script: Add Email Fields to Unified Actions
 * This script adds email-specific fields to the unified_actions table
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
    console.log('🔄 Starting migration: Add email fields to unified_actions table...\n');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../database/migration_add_email_fields_to_unified_actions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Get a client from the pool
    client = await pool.connect();
    console.log('✅ Connected to database\n');

    // Execute the migration
    console.log('📝 Executing migration SQL...');
    await client.query(migrationSQL);
    console.log('✅ Migration SQL executed successfully\n');

    // Verify the migration by checking if columns exist
    console.log('🔍 Verifying migration...');
    const checkColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'unified_actions'
      AND column_name IN (
        'recipient_email', 'recipient_name', 'email_status', 'email_template',
        'email_subject', 'email_sent_at', 'email_error', 'email_message_id'
      )
      ORDER BY column_name
    `);

    if (checkColumns.rows.length > 0) {
      console.log('✅ Verified email columns exist:');
      checkColumns.rows.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.log('⚠️  Warning: No email columns found. Migration may have failed.');
    }

    // Check indexes
    console.log('\n🔍 Checking indexes...');
    const checkIndexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'unified_actions'
      AND indexname LIKE 'idx_unified_actions_email%'
      ORDER BY indexname
    `);

    if (checkIndexes.rows.length > 0) {
      console.log('✅ Verified email indexes exist:');
      checkIndexes.rows.forEach(idx => {
        console.log(`   - ${idx.indexname}`);
      });
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Restart your application to load the new services');
    console.log('   2. Verify that new email sends are being tracked in unified_actions');
    console.log('   3. Check the unified_actions table to see email tracking in action\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('Error details:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

