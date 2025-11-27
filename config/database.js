import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

let poolConfig;

// Check if DATABASE_URL is provided (common in production environments like Render.com)
if (process.env.DATABASE_URL) {
  // Use DATABASE_URL directly - it includes all connection details
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
} else {
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
    connectionTimeoutMillis: 10000,
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
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;

