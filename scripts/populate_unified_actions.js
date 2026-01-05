/**
 * Script to populate unified_actions table from existing logs
 * This migrates data from logs_of_admin and logs_of_users tables
 */

import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function populateUnifiedActions() {
  try {
    console.log('🔄 Starting to populate unified_actions table...\n');

    // Check if unified_actions table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_actions'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ unified_actions table does not exist. Please run the migration first.');
      console.log('   Run: migration_unified_actions_table.sql');
      return;
    }

    // Migrate admin logs
    console.log('📥 Migrating admin logs...');
    const adminLogsResult = await pool.query(`
      INSERT INTO unified_actions (
        system_type, actor_id, actor_email, actor_name, actor_type,
        action_type, action_category, action_name, target_type, target_id,
        target_identifier, description, details, request_method, request_path,
        request_body, response_status, response_body, before_data, after_data,
        ip_address, user_agent, session_id, created_at, updated_at
      )
      SELECT 
        'crm_admin' as system_type,
        admin_id as actor_id,
        admin_email as actor_email,
        admin_email as actor_name,
        'admin' as actor_type,
        action_type,
        action_category,
        REPLACE(REPLACE(action_type, '_', ' '), ' ', ' ') as action_name,
        target_type,
        target_id,
        target_identifier,
        description,
        NULL as details,
        request_method,
        request_path,
        request_body,
        response_status,
        response_body,
        before_data,
        after_data,
        ip_address,
        user_agent,
        session_id,
        created_at,
        updated_at
      FROM logs_of_admin
      WHERE NOT EXISTS (
        SELECT 1 FROM unified_actions ua
        WHERE ua.system_type = 'crm_admin'
        AND ua.actor_id = logs_of_admin.admin_id
        AND ua.action_type = logs_of_admin.action_type
        AND ua.created_at = logs_of_admin.created_at
      )
      RETURNING id
    `);
    console.log(`✅ Migrated ${adminLogsResult.rows.length} admin log entries`);

    // Migrate user logs
    console.log('📥 Migrating user logs...');
    const userLogsResult = await pool.query(`
      INSERT INTO unified_actions (
        system_type, actor_id, actor_email, actor_name, actor_type,
        action_type, action_category, action_name, target_type, target_id,
        target_identifier, description, details, request_method, request_path,
        request_body, response_status, response_body, before_data, after_data,
        ip_address, user_agent, session_id, created_at, updated_at
      )
      SELECT 
        'crm_user' as system_type,
        user_id as actor_id,
        user_email as actor_email,
        user_email as actor_name,
        'user' as actor_type,
        action_type,
        action_category,
        REPLACE(REPLACE(action_type, '_', ' '), ' ', ' ') as action_name,
        target_type,
        target_id,
        target_identifier,
        description,
        NULL as details,
        request_method,
        request_path,
        request_body,
        response_status,
        response_body,
        before_data,
        after_data,
        ip_address,
        user_agent,
        session_id,
        created_at,
        updated_at
      FROM logs_of_users
      WHERE NOT EXISTS (
        SELECT 1 FROM unified_actions ua
        WHERE ua.system_type = 'crm_user'
        AND ua.actor_id = logs_of_users.user_id
        AND ua.action_type = logs_of_users.action_type
        AND ua.created_at = logs_of_users.created_at
      )
      RETURNING id
    `);
    console.log(`✅ Migrated ${userLogsResult.rows.length} user log entries`);

    // Get summary
    const summaryResult = await pool.query(`
      SELECT 
        system_type,
        COUNT(*) as count
      FROM unified_actions
      GROUP BY system_type
      ORDER BY system_type
    `);

    console.log('\n📊 Summary:');
    summaryResult.rows.forEach(row => {
      console.log(`   ${row.system_type}: ${row.count} actions`);
    });

    const totalResult = await pool.query('SELECT COUNT(*) as total FROM unified_actions');
    console.log(`\n✅ Total actions in unified_actions table: ${totalResult.rows[0].total}`);

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Error populating unified_actions:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
populateUnifiedActions()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });






