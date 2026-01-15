import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Always use SSL for production database
  connectionTimeoutMillis: 30000
});

const migrations = [
  {
    name: 'Add Cregis Support',
    file: join(__dirname, '../database/migration_add_cregis.sql')
  },
  {
    name: 'Fix Currency Length',
    file: join(__dirname, '../database/migration_fix_currency_length.sql')
  },
  {
    name: 'Make Gateway ID Nullable',
    file: join(__dirname, '../database/migration_make_gateway_id_nullable.sql')
  },
  {
    name: 'Add Cancelled Status',
    file: join(__dirname, '../database/migration_add_cancelled_status.sql')
  }
];

async function runMigrations() {
  try {
    console.log('🔄 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected\n');

    for (const migration of migrations) {
      console.log(`📝 Running migration: ${migration.name}`);
      const sql = readFileSync(migration.file, 'utf8');

      try {
        await pool.query(sql);
        console.log(`✅ Migration completed: ${migration.name}\n`);
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log(`⚠️  Migration already applied (skipping): ${migration.name}\n`);
        } else {
          throw error;
        }
      }
    }

    console.log('✅ All migrations completed!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();

