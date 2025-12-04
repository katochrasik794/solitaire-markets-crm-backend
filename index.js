import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRoutes from './routes/auth.js';
import countriesRoutes from './routes/countries.js';
import kycRoutes from './routes/kyc.js';
import accountsRoutes from './routes/accounts.js';
import walletRoutes from './routes/wallet.js';
import adminRoutes from './routes/admin.js';
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
    console.error('Error code:', err.code);
    console.error('Error details:', {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      host: process.env.DB_HOST || 'not set',
      database: process.env.DB_NAME || 'not set',
      user: process.env.DB_USER || 'not set',
      port: process.env.DB_PORT || 'not set',
      nodeEnv: process.env.NODE_ENV,
      sslRequired: process.env.NODE_ENV === 'production'
    });
    console.error('Please check your environment variables:');
    console.error('1. DATABASE_URL (recommended) or DB_HOST, DB_USER, DB_PASSWORD, DB_NAME are set correctly');
    console.error('2. PostgreSQL is running');
    console.error('3. Database exists');
    console.error('4. SSL is configured if required (Render.com requires SSL)');
    process.exit(1);
  } else {
    console.log('✅ Connected to PostgreSQL database');
  }
});

// Middleware
// CORS: fully open for all origins (including https://portal.solitairemarkets.com)
// The request Origin will be reflected back in Access-Control-Allow-Origin.
// If you later want to restrict origins, this block should be updated accordingly.
app.use(cors({
  origin: true,        // reflect request origin
  credentials: true    // allow cookies/authorization headers
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
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);

// Debug: Log registered routes
console.log('✅ Routes registered:');
console.log('  - /api/auth');
console.log('  - /api/countries');
console.log('  - /api/kyc');
console.log('  - /api/accounts');
console.log('  - /api/wallet');
console.log('  - /api/admin');

// Debug endpoint to list all registered routes
app.get('/api/debug/routes', (req, res) => {
  res.json({
    success: true,
    routes: [
      '/api/auth',
      '/api/countries',
      '/api/kyc',
      '/api/accounts',
      '/api/admin',
      '/api/admin/test',
      '/api/admin/login'
    ],
    message: 'All routes are registered'
  });
});

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
  console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

