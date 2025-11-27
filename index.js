import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRoutes from './routes/auth.js';
import countriesRoutes from './routes/countries.js';
import kycRoutes from './routes/kyc.js';
import accountsRoutes from './routes/accounts.js';
import pool from './config/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Test database connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    console.error('Please check your .env file and ensure:');
    console.error('1. DB_PASSWORD is set correctly');
    console.error('2. PostgreSQL is running');
    console.error('3. Database "solitaire" exists');
    process.exit(1);
  } else {
    console.log('✅ Connected to PostgreSQL database');
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Routes - MUST be before 404 handler
app.use('/api/auth', authRoutes);
app.use('/api/countries', countriesRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/accounts', accountsRoutes);

// Debug: Log registered routes
console.log('✅ Routes registered:');
console.log('  - /api/auth');
console.log('  - /api/countries');
console.log('  - /api/kyc');
console.log('  - /api/accounts');

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

