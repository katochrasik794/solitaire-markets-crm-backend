import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

let poolConfig;

// Always prioritize DATABASE_URL if provided
if (process.env.DATABASE_URL) {
  console.log('📦 Using DATABASE_URL for database connection');

  // Base config using DATABASE_URL
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 60000, // Increased to 60 seconds for remote databases
  };

  // Only force SSL when explicitly needed (production / cloud DB)
  // For local development PostgreSQL usually DOES NOT use SSL, so enabling it causes "connection terminated unexpectedly"
  if (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
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
  console.log('✅ New PostgreSQL client connected');
});

pool.on('error', (err, client) => {
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

