import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupAdminTables() {
  try {
    console.log('📋 Setting up admin tables...\n');

    // Read the admin_table.sql file
    const sqlFile = path.join(__dirname, 'admin_table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute the entire SQL file
    try {
      await pool.query(sql);
      console.log('✅ Admin tables created successfully');
    } catch (err) {
      // Check if it's just "already exists" errors
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log('ℹ️  Some tables/functions already exist, continuing...');
      } else {
        console.error('❌ Error creating tables:', err.message);
        throw err;
      }
    }

    console.log('\n✅ Admin tables setup completed!\n');

    // Now insert the admin user
    console.log('📋 Inserting admin user...\n');
    
    try {
      const result = await pool.query(`
        INSERT INTO admin (
          username,
          email,
          password_hash,
          admin_role,
          is_active,
          login_attempts,
          created_at,
          updated_at
        ) VALUES (
          'admin',
          'admin@Solitaire.com',
          '$2y$10$pDKYJsFkr457Fxnp990V/.cKXIpNNAWBZTtbnshZMUfhrUilE8Vbu',
          'admin',
          TRUE,
          0,
          NOW(),
          NOW()
        )
        ON CONFLICT (email) DO NOTHING
        RETURNING id, username, email, admin_role, is_active
      `);

      if (result.rows && result.rows.length > 0) {
        console.log('✅ Admin user inserted:', result.rows[0]);
      } else {
        console.log('ℹ️  Admin user already exists');
      }
    } catch (err) {
      if (err.message.includes('duplicate key') || err.message.includes('already exists')) {
        console.log('ℹ️  Admin user already exists, skipping...');
      } else {
        console.error('❌ Error inserting admin:', err.message);
        throw err;
      }
    }

    // Verify admin was created
    const verifyResult = await pool.query(
      "SELECT id, username, email, admin_role, is_active FROM admin WHERE email = 'admin@Solitaire.com'"
    );

    if (verifyResult.rows.length > 0) {
      console.log('\n✅ Admin user verified:');
      console.log(verifyResult.rows[0]);
    } else {
      console.log('\n⚠️  Warning: Admin user not found after insertion');
    }

    console.log('\n🎉 Setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

setupAdminTables();

