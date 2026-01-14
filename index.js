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
import withdrawalsRoutes from './routes/withdrawals.js';
import reportsRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import supportRoutes from './routes/support.js';
import tickerRoutes from './routes/tickers.js';
import promotionRoutes from './routes/promotions.js';
import paymentDetailsRoutes from './routes/paymentDetails.js';
import unifiedActionsRoutes from './routes/unifiedActions.js';
import menusRoutes from './routes/menus.js';
import sessionRoutes from './routes/session.js';
import ibRequestsRoutes from './routes/ibRequests.js';
import ibRoutes from './routes/ib.js';
import ibWithdrawalsRoutes from './routes/ibWithdrawals.js';
import ibWithdrawalAdminRoutes from './routes/ibWithdrawalAdmin.js';
import pool from './config/database.js';
import { syncAllCommissions } from './services/ib_commission.service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Test database connection on startup with retry logic (non-blocking)
const testDatabaseConnection = async (retries = 5, delay = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await pool.query('SELECT NOW()');
      console.log('✅ Connected to PostgreSQL database');
      return true;
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
          sslConfigured: process.env.DB_SSL !== 'false'
        });
        console.error('⚠️  Database connection failed after all retries, but continuing startup...');
        console.error('⚠️  The server will continue to retry connections in the background.');
        console.error('Please check:');
        console.error('1. DATABASE_URL is set correctly');
        console.error('2. Database server is accessible');
        console.error('3. Network connection is stable');
        // Don't exit - let the server start and retry in background
        return false;
      }
    }
  }
  return false;
};

// Ensure withdrawals table exists
const ensureWithdrawalsTable = async () => {
  try {
    // Check if table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'withdrawals'
      );
    `);

    if (!checkTable.rows[0].exists) {
      console.log('📦 Creating withdrawals table...');
      await pool.query(`
        CREATE TABLE withdrawals (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          amount DECIMAL(15, 2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD',
          method VARCHAR(50) NOT NULL,
          payment_method VARCHAR(100),
          bank_name VARCHAR(255),
          account_name VARCHAR(255),
          account_number VARCHAR(100),
          ifsc_swift_code VARCHAR(50),
          account_type VARCHAR(50),
          bank_details TEXT,
          crypto_address VARCHAR(255),
          wallet_address VARCHAR(255),
          pm_currency VARCHAR(20),
          pm_network VARCHAR(50),
          pm_address VARCHAR(255),
          mt5_account_id VARCHAR(50),
          status VARCHAR(50) DEFAULT 'pending',
          external_transaction_id VARCHAR(255),
          approved_by INTEGER REFERENCES admin(id),
          approved_at TIMESTAMP,
          rejected_by INTEGER REFERENCES admin(id),
          rejected_at TIMESTAMP,
          rejection_reason TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT positive_amount CHECK (amount > 0)
        );
      `);

      // Create indexes
      await pool.query('CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals(created_at DESC);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_withdrawals_mt5_account ON withdrawals(mt5_account_id);');

      console.log('✅ Withdrawals table created successfully');
    } else {
      console.log('✅ Withdrawals table exists');
    }
  } catch (error) {
    console.error('❌ Error ensuring withdrawals table:', error);
    console.error('Error details:', error.message, error.code);
    // Don't exit - table might already exist with different structure
  }
};

// Scheduled job to cancel expired deposits (runs every 5 minutes)
const cancelExpiredDeposits = async () => {
  try {
    // Test connection first - if it fails, skip this run
    await pool.query('SELECT 1');

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
        try {
          await pool.query(
            `UPDATE cregis_transactions 
             SET cregis_status = 'expired', updated_at = NOW()
             WHERE deposit_request_id = $1`,
            [row.id]
          );
        } catch (err) {
          // Ignore errors updating cregis_transactions (table might not exist)
          console.warn(`⚠️  Could not update cregis_transactions for deposit #${row.id}:`, err.message);
        }
      }
    }
  } catch (error) {
    // Don't log connection errors as errors - they're expected during startup
    if (error.message && error.message.includes('Connection terminated')) {
      console.warn('⚠️  Database not ready yet, skipping expired deposits check');
    } else {
      console.error('❌ Error cancelling expired deposits:', error.message);
    }
  }
};

// Initialize database connection and tables (non-blocking)
(async () => {
  try {
    const connected = await testDatabaseConnection();
    if (connected) {
      await ensureWithdrawalsTable();
      // Only run cancelExpiredDeposits after connection is established
      cancelExpiredDeposits();
    } else {
      // Retry connection in background
      console.log('🔄 Will retry database connection in background...');
      setTimeout(async () => {
        const retryConnected = await testDatabaseConnection(10, 5000);
        if (retryConnected) {
          await ensureWithdrawalsTable();
          cancelExpiredDeposits();
        }
      }, 10000); // Retry after 10 seconds
    }
  } catch (error) {
    console.error('❌ Error during database initialization:', error.message);
    // Don't exit - continue startup
  }
})();

// Run every 5 minutes (will skip if database is not ready)
setInterval(cancelExpiredDeposits, 5 * 60 * 1000); // Every 5 minutes

// Run IB Commission Sync every 15 minutes
syncAllCommissions(); // Initial run
setInterval(syncAllCommissions, 15 * 60 * 1000);

// Middleware
// CORS: fully open for all origins (including https://portal.solitairemarkets.com)
// The request Origin will be reflected back in Access-Control-Allow-Origin.
// If you later want to restrict origins, this block should be updated accordingly.
app.use(cors({
  origin: true,        // reflect request origin
  credentials: true,    // allow cookies/authorization headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Health check endpoint (for Render and other platforms)
app.get('/api/health', async (req, res) => {
  try {
    // Try to ping database
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      message: 'Server is running',
      database: 'connected'
    });
  } catch (error) {
    // Still return 200 but indicate DB is not connected
    res.status(200).json({
      status: 'ok',
      message: 'Server is running',
      database: 'disconnected',
      warning: 'Database connection pending'
    });
  }
});

// Root endpoint for Render health checks
app.head('/', (req, res) => {
  res.status(200).end();
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Solitaire CRM API Server',
    version: '1.0.0'
  });
});

// Routes - MUST be before 404 handler
app.use('/api/auth', authRoutes);
app.use('/api/countries', countriesRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/deposits', depositsRoutes);
app.use('/api/withdrawals', withdrawalsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/unified-actions', unifiedActionsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/tickers', tickerRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/payment-details', paymentDetailsRoutes);
app.use('/api/menus', menusRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/ib-requests', ibRequestsRoutes);
app.use('/api/ib', ibRoutes);
app.use('/api/ib-withdrawals', ibWithdrawalsRoutes);
app.use('/api/admin/ib-withdrawals', ibWithdrawalAdminRoutes);

// Debug: Log registered routes
console.log('✅ Routes registered:');
console.log('  - /api/auth');
console.log('  - /api/countries');
console.log('  - /api/kyc');
console.log('  - /api/accounts');
console.log('  - /api/wallet');
console.log('  - /api/deposits');
console.log('  - /api/withdrawals');
console.log('  - /api/reports');
console.log('  - /api/admin');
console.log('  - /api/support');
console.log('  - /api/tickers');
console.log('  - /api/promotions');
console.log('  - /api/payment-details');
console.log('  - /api/session');

// Inspect admin routes
if (adminRoutes && adminRoutes.stack) {
  console.log('🔍 Inspecting Admin Routes:');
  adminRoutes.stack.forEach(r => {
    if (r.route && r.route.path) {
      console.log(`  - ${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
    }
  });
}

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
  // Don't log OPTIONS requests (CORS preflight)
  if (req.method !== 'OPTIONS') {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
  }
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

