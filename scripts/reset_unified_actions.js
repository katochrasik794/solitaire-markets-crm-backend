/**
 * Reset Unified Actions Table
 * This script recreates the unified_actions table as a simple list of email actions
 */

import pool from '../config/database.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resetUnifiedActions() {
  let client;
  try {
    console.log('🔄 Resetting unified_actions table to simple list structure...\n');

    client = await pool.connect();
    console.log('✅ Connected to database\n');

    // Drop existing table if it exists
    console.log('🗑️  Dropping existing unified_actions table...');
    await client.query('DROP TABLE IF EXISTS unified_actions CASCADE');
    console.log('✅ Table dropped\n');

    // Read and execute the new schema
    console.log('📝 Creating new unified_actions table...');
    const schemaPath = path.join(__dirname, '../database/migration_unified_actions_table.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSQL);
    console.log('✅ Table created\n');

    // Populate with email actions
    console.log('📋 Populating with email actions...');
    const populatePath = path.join(__dirname, '../database/populate_unified_actions_list.sql');
    const populateSQL = fs.readFileSync(populatePath, 'utf8');
    await client.query(populateSQL);
    console.log('✅ Actions populated\n');

    // Verify the data
    console.log('🔍 Verifying data...');
    const result = await client.query(`
      SELECT system_type, COUNT(*) as count 
      FROM unified_actions 
      GROUP BY system_type 
      ORDER BY system_type
    `);

    console.log('\n📊 Actions by system type:');
    result.rows.forEach(row => {
      console.log(`   ${row.system_type}: ${row.count} actions`);
    });

    const allActions = await client.query(`
      SELECT id, action_name, system_type 
      FROM unified_actions 
      ORDER BY system_type, action_name
    `);

    console.log(`\n📋 Total actions: ${allActions.rows.length}`);
    console.log('\n📝 All actions:');
    allActions.rows.forEach((action, index) => {
      console.log(`   ${index + 1}. [${action.system_type}] ${action.action_name}`);
    });

    console.log('\n🎉 Reset completed successfully!');
    console.log('\n✅ The unified_actions table now contains a simple list of all email-triggering actions.');

  } catch (error) {
    console.error('\n❌ Reset failed:', error);
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

// Run the reset
resetUnifiedActions()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

