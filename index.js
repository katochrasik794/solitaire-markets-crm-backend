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
import depositsRoutes from './routes/deposits.js';
import reportsRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import pool from './config/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Test database connection on startup with retry logic
const testDatabaseConnection = async (retries = 3, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await pool.query('SELECT NOW()');
      console.log('✅ Connected to PostgreSQL database');
      return;
    } catch (err) {
      console.error(`❌ Database connection attempt ${i + 1}/${retries} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Error code:', err.code);
        console.error('Error details:', {
          hasDatabaseUrl: !!process.env.DATABASE_URL,
          databaseUrl: process.env.DATABASE_URL ? (process.env.DATABASE_URL.substring(0, 30) + '...') : 'not set',
          nodeEnv: process.env.NODE_ENV,
          sslConfigured: true
        });
        console.error('Please check:');
        console.error('1. DATABASE_URL is set correctly');
        console.error('2. Database server is accessible');
        console.error('3. Network connection is stable');
        process.exit(1);
      }
    }
  }
};

testDatabaseConnection();

// Scheduled job to cancel expired deposits (runs every 5 minutes)
const cancelExpiredDeposits = async () => {
  try {
    // Find pending deposits with cregis_order_id that are older than 60 minutes
    const result = await pool.query(
      `UPDATE deposit_requests 
       SET status = 'cancelled', 
           cregis_status = 'expired',
           updated_at = NOW()
       WHERE status = 'pending' 
         AND cregis_order_id IS NOT NULL
         AND created_at < NOW() - INTERVAL '60 minutes'
       RETURNING id, cregis_order_id`
    );

    if (result.rows.length > 0) {
      console.log(`✅ Cancelled ${result.rows.length} expired deposit(s):`, 
        result.rows.map(r => `#${r.id} (${r.cregis_order_id})`).join(', '));
      
      // Also update cregis_transactions if they exist
      for (const row of result.rows) {
        await pool.query(
          `UPDATE cregis_transactions 
           SET cregis_status = 'expired', updated_at = NOW()
           WHERE deposit_request_id = $1`,
          [row.id]
        );
      }
    }
  } catch (error) {
    console.error('❌ Error cancelling expired deposits:', error);
  }
};

// Run immediately on startup, then every 5 minutes
cancelExpiredDeposits();
setInterval(cancelExpiredDeposits, 5 * 60 * 1000); // Every 5 minutes

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
app.use('/api/deposits', depositsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);

// Debug: Log registered routes
console.log('✅ Routes registered:');
console.log('  - /api/auth');
console.log('  - /api/countries');
console.log('  - /api/kyc');
console.log('  - /api/accounts');
console.log('  - /api/wallet');
console.log('  - /api/deposits');
console.log('  - /api/reports');
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

