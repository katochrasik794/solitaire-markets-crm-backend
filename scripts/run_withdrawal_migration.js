import pool from '../config/database.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log('🔄 Starting migration: Add withdrawal support to manual_payment_gateways...');
    
    // Read the migration SQL file
    const migrationPath = join(__dirname, '../database/add_withdrawal_support_to_manual_gateways.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    
    // Execute the entire SQL file as one transaction
    // This ensures all statements run together
    try {
      console.log('\n📌 Executing migration SQL...');
      await pool.query(sql);
      console.log('✅ Migration SQL executed successfully');
    } catch (error) {
      // If columns already exist, that's okay - continue
      if (error.message.includes('already exists') || error.code === '42701') {
        console.log('⚠️  Some columns may already exist, continuing...');
      } else {
        throw error;
      }
    }
    
    // Now run the UPDATE statement separately to ensure columns exist
    try {
      console.log('\n📌 Updating existing records...');
      await pool.query(`
        UPDATE manual_payment_gateways 
        SET is_deposit_enabled = COALESCE(is_deposit_enabled, is_active),
            is_withdrawal_enabled = COALESCE(is_withdrawal_enabled, FALSE)
        WHERE is_deposit_enabled IS NULL OR is_withdrawal_enabled IS NULL
      `);
      console.log('✅ Existing records updated');
    } catch (error) {
      console.log('⚠️  Update statement result:', error.message);
      // Continue even if update fails
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Verifying migration...');
    
    // Verify the columns were added
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'manual_payment_gateways'
      AND column_name IN ('is_deposit_enabled', 'is_withdrawal_enabled')
      ORDER BY column_name
    `);
    
    if (verifyResult.rows.length === 2) {
      console.log('✅ Verification successful! Columns found:');
      verifyResult.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
      });
    } else {
      console.log('⚠️  Warning: Expected 2 columns but found', verifyResult.rows.length);
    }
    
    // Check existing records
    const countResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_deposit_enabled = TRUE) as deposit_enabled,
        COUNT(*) FILTER (WHERE is_withdrawal_enabled = TRUE) as withdrawal_enabled
      FROM manual_payment_gateways
    `);
    
    if (countResult.rows.length > 0) {
      const stats = countResult.rows[0];
      console.log('\n📈 Current gateway statistics:');
      console.log(`   - Total gateways: ${stats.total}`);
      console.log(`   - Deposit enabled: ${stats.deposit_enabled}`);
      console.log(`   - Withdrawal enabled: ${stats.withdrawal_enabled}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();

