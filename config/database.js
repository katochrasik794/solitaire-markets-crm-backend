import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pkg;

let poolConfig;

// Always prioritize DATABASE_URL if provided
if (process.env.DATABASE_URL) {
  console.log('📦 Using DATABASE_URL for database connection');

  // Base config using DATABASE_URL
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 10, // Reduced from 20 for Render compatibility
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // 10 seconds - Render databases should respond quickly
  };

  // Enable SSL by default for DATABASE_URL (most remote/cloud databases require it)
  // Only disable if explicitly set to false
  if (process.env.DB_SSL !== 'false') {
    // For Render PostgreSQL and other cloud providers, always use SSL
    // Check if DATABASE_URL contains 'render.com' or other cloud providers
    const isCloudDatabase = process.env.DATABASE_URL && (
      process.env.DATABASE_URL.includes('render.com') ||
      process.env.DATABASE_URL.includes('amazonaws.com') ||
      process.env.DATABASE_URL.includes('azure.com') ||
      process.env.DATABASE_URL.includes('heroku.com')
    );

    if (isCloudDatabase || process.env.NODE_ENV === 'production') {
      poolConfig.ssl = { require: true, rejectUnauthorized: false };
    } else {
      poolConfig.ssl = { rejectUnauthorized: false };
    }
    console.log('🔒 SSL enabled for database connection');
  } else {
    console.log('⚠️  SSL disabled for database connection (DB_SSL=false)');
  }
} else {
  console.log('📦 Using individual DB environment variables for database connection');
  // Build connection config from individual environment variables
  let dbPassword = '';
  if (process.env.DB_PASSWORD !== undefined && process.env.DB_PASSWORD !== null) {
    dbPassword = String(process.env.DB_PASSWORD).trim();
  }

  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'solitaire',
    user: process.env.DB_USER || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  };

  // Only add password if it's not empty
  if (dbPassword) {
    poolConfig.password = dbPassword;
  }

  // Add SSL for production (required for Render.com PostgreSQL)
  if (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool(poolConfig);

// Test connection
pool.on('connect', (client) => {
  // Only log in development to reduce noise
  if (process.env.NODE_ENV !== 'production') {
    console.log('✅ New PostgreSQL client connected');
  }
});

pool.on('error', (err, client) => {
  // Don't log connection termination errors during startup - they're expected
  if (err.message && err.message.includes('Connection terminated')) {
    // Silently handle - retry logic will handle it
    return;
  }
  console.error('❌ Unexpected error on idle PostgreSQL client:', err.message);
  console.error('Error code:', err.code);
  // Don't exit immediately - let the retry logic in index.js handle it
  // process.exit(-1);
});

// Handle connection errors gracefully
pool.on('acquire', (client) => {
  // Client acquired from pool
});

pool.on('remove', (client) => {
  // Client removed from pool
});

export default pool;

