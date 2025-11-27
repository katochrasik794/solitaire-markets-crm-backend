import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Get password - ensure it's always a string
// If DB_PASSWORD is not set or is empty, use empty string
let dbPassword = '';
if (process.env.DB_PASSWORD !== undefined && process.env.DB_PASSWORD !== null) {
  dbPassword = String(process.env.DB_PASSWORD).trim();
}

// Build connection config - only include password if it's not empty
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'solitaire',
  user: process.env.DB_USER || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Only add password if it's not empty (some PostgreSQL setups don't accept empty string)
if (dbPassword) {
  poolConfig.password = dbPassword;
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

