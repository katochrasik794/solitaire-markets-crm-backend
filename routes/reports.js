import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { logUserAction } from '../services/logging.service.js';

const router = express.Router();

/**
 * Helper function to format gateway name for display
 * Converts gateway types/names to user-friendly format
 * Examples: "USDT_TRC20" -> "TRC20", "Bank_Transfer" -> "Bank", "USDT TRC20" -> "TRC20"
 * NEVER returns "Manual Gateway" - always shows the actual gateway name
 */
const formatGatewayName = (gatewayName, gatewayType) => {
  // If both are null/empty, return a generic name
  if (!gatewayName && !gatewayType) return 'Gateway';
  
  const name = (gatewayName || '').toUpperCase().trim();
  const type = (gatewayType || '').toUpperCase().trim();
  
  // Remove "MANUAL" from any string first
  const cleanName = name.replace(/MANUAL/gi, '').trim();
  const cleanType = type.replace(/MANUAL/gi, '').trim();
  
  // Handle gateway types first (more specific)
  if (cleanType) {
    // Convert types like "USDT_TRC20" to "TRC20", "USDT_ERC20" to "ERC20", etc.
    if (cleanType.includes('_')) {
      const parts = cleanType.split('_').filter(p => p && p !== 'MANUAL');
      if (parts.length > 1) {
        // Return the last part (e.g., "TRC20", "ERC20", "BEP20")
        return parts[parts.length - 1];
      } else if (parts.length === 1) {
        return parts[0];
      }
    }
    // Handle specific types
    if (cleanType === 'BANK_TRANSFER' || cleanType === 'BANK') return 'Bank';
    if (cleanType === 'DEBIT_CARD' || cleanType === 'CARD') return 'Debit Card';
    if (cleanType === 'OTHER_CRYPTO') return 'Crypto';
    if (cleanType === 'UPI') return 'UPI';
    if (cleanType === 'CRYPTOCURRENCY') return 'Crypto';
  }
  
  // Handle gateway names directly
  if (cleanName.includes('TRC20') || cleanName.includes('TRC-20')) return 'TRC20';
  if (cleanName.includes('ERC20') || cleanName.includes('ERC-20')) return 'ERC20';
  if (cleanName.includes('BEP20') || cleanName.includes('BEP-20')) return 'BEP20';
  if (cleanName.includes('UPI')) return 'UPI';
  if (cleanName.includes('BANK')) return 'Bank';
  if (cleanName.includes('BITCOIN') || cleanName.includes('BTC')) return 'Bitcoin';
  if (cleanName.includes('ETHEREUM') || cleanName.includes('ETH')) return 'Ethereum';
  if (cleanName.includes('USDT')) {
    // Try to extract network from name
    if (cleanName.includes('TRC')) return 'TRC20';
    if (cleanName.includes('ERC')) return 'ERC20';
    if (cleanName.includes('BEP')) return 'BEP20';
    return 'USDT';
  }
  
  // Return a cleaned version - remove "Manual" and clean up
  const finalName = cleanName || cleanType || gatewayName || gatewayType || 'Gateway';
  const cleaned = finalName.replace(/[_-]/g, ' ').replace(/MANUAL/gi, '').trim();
  
  // If empty after cleaning, return generic
  if (!cleaned || cleaned.toLowerCase() === 'gateway' || cleaned.toLowerCase().includes('manual')) {
    return 'Gateway';
  }
  
  return cleaned;
};

/**
 * GET /api/reports/transaction-history
 * Get transaction history from deposit_requests and trading_accounts
 */
router.get('/transaction-history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    // Fetch deposit requests for this user (including both manual and auto gateways)
    const depositQuery = `
      SELECT 
        dr.id,
        dr.amount,
        dr.currency,
        dr.status,
        dr.deposit_to_type,
        dr.mt5_account_id,
        dr.wallet_number,
        dr.created_at,
        COALESCE(mg.name, ag.wallet_name) as gateway_name,
        COALESCE(mg.type, ag.gateway_type) as gateway_type,
        CASE 
          WHEN dr.gateway_id IS NOT NULL THEN 'manual'
          WHEN dr.cregis_order_id IS NOT NULL THEN 'auto'
          ELSE 'unknown'
        END as gateway_source,
        'deposit' as transaction_type
      FROM deposit_requests dr
      LEFT JOIN manual_payment_gateways mg ON dr.gateway_id = mg.id
      LEFT JOIN LATERAL (
        SELECT wallet_name, gateway_type
        FROM auto_gateway
        WHERE gateway_type = 'Cryptocurrency' 
          AND is_active = TRUE
        ORDER BY display_order ASC, created_at DESC
        LIMIT 1
      ) ag ON dr.cregis_order_id IS NOT NULL
      WHERE dr.user_id = $1
      ORDER BY dr.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const depositResult = await pool.query(depositQuery, [userId, parseInt(limit), parseInt(offset)]);

    // Fetch trading accounts for this user (MT5 accounts)
    const tradingAccountsQuery = `
      SELECT 
        id,
        account_number,
        platform,
        account_type,
        balance,
        equity,
        currency,
        created_at,
        'account_creation' as transaction_type
      FROM trading_accounts
      WHERE user_id = $1 AND platform = 'MT5'
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const tradingAccountsResult = await pool.query(tradingAccountsQuery, [userId, parseInt(limit), parseInt(offset)]);

    // Fetch withdrawals for this user
    const withdrawalQuery = `
      SELECT 
        w.id,
        w.amount,
        w.currency,
        w.method,
        w.payment_method,
        w.status,
        w.mt5_account_id,
        w.wallet_id,
        w.created_at,
        wt.wallet_number
      FROM withdrawals w
      LEFT JOIN wallets wt ON w.wallet_id = wt.id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const withdrawalResult = await pool.query(withdrawalQuery, [userId, parseInt(limit), parseInt(offset)]);

    // Combine and format the results
    const transactions = [
      ...depositResult.rows.map(row => {
        const formattedGateway = formatGatewayName(row.gateway_name, row.gateway_type);
        return {
          id: `deposit_${row.id}`,
          type: 'deposit',
          amount: parseFloat(row.amount),
          currency: row.currency || 'USD',
          status: row.status,
          depositTo: row.deposit_to_type,
          mt5AccountId: row.mt5_account_id,
          walletNumber: row.wallet_number,
          gatewayName: row.gateway_name,
          gatewayType: row.gateway_type,
          createdAt: row.created_at,
          description: `Deposit via ${formattedGateway}`
        };
      }),
      ...withdrawalResult.rows.map(row => {
        let description = 'Withdrawal';
        if (row.method === 'crypto') {
          description = `Withdrawal via ${row.payment_method || 'Crypto'}`;
        } else if (row.method === 'bank') {
          description = 'Withdrawal via Bank Transfer';
        } else {
          description = `Withdrawal via ${row.method || 'Unknown'}`;
        }
        
        let accountInfo = null;
        if (row.mt5_account_id) {
          accountInfo = row.mt5_account_id;
        } else if (row.wallet_number) {
          accountInfo = row.wallet_number;
        }

        return {
          id: `withdrawal_${row.id}`,
          type: 'withdrawal',
          amount: parseFloat(row.amount),
          currency: row.currency || 'USD',
          status: row.status,
          mt5AccountId: row.mt5_account_id,
          walletNumber: row.wallet_number,
          createdAt: row.created_at,
          description: description,
          accountNumber: accountInfo
        };
      }),
      ...tradingAccountsResult.rows.map(row => ({
        id: `account_${row.id}`,
        type: 'account_creation',
        accountNumber: row.account_number,
        platform: row.platform,
        accountType: row.account_type,
        balance: parseFloat(row.balance || 0),
        equity: parseFloat(row.equity || 0),
        currency: row.currency || 'USD',
        createdAt: row.created_at,
        description: `MT5 Account Created: ${row.account_number}`
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get total count
    const depositCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM deposit_requests WHERE user_id = $1',
      [userId]
    );
    const withdrawalCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM withdrawals WHERE user_id = $1',
      [userId]
    );
    const accountCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM trading_accounts WHERE user_id = $1 AND platform = \'MT5\'',
      [userId]
    );
    const total = parseInt(depositCountResult.rows[0].count) + parseInt(withdrawalCountResult.rows[0].count) + parseInt(accountCountResult.rows[0].count);

    res.json({
      success: true,
      data: {
        transactions,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transaction history'
    });
  }
});

/**
 * GET /api/reports/mt5-account-statement
 * Get MT5 account statement (only MT5-related transactions)
 */
router.get('/mt5-account-statement', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountNumber, limit = 1000, offset = 0 } = req.query;

    let transactions = [];

    // Build query parameters
    const depositParams = accountNumber 
      ? [userId, parseInt(limit), parseInt(offset), accountNumber]
      : [userId, parseInt(limit), parseInt(offset)];

    // Fetch MT5 deposits (deposits made to MT5 accounts)
    const depositQuery = `
      SELECT 
        dr.id,
        dr.amount,
        dr.currency,
        dr.status,
        dr.mt5_account_id,
        dr.created_at,
        COALESCE(mg.name, ag.wallet_name) as gateway_name,
        COALESCE(mg.type, ag.gateway_type) as gateway_type,
        'deposit' as transaction_type,
        'credit' as operation_type
      FROM deposit_requests dr
      LEFT JOIN manual_payment_gateways mg ON dr.gateway_id = mg.id
      LEFT JOIN LATERAL (
        SELECT wallet_name, gateway_type
        FROM auto_gateway
        WHERE gateway_type = 'Cryptocurrency' 
          AND is_active = TRUE
        ORDER BY display_order ASC, created_at DESC
        LIMIT 1
      ) ag ON dr.cregis_order_id IS NOT NULL
      WHERE dr.user_id = $1 
        AND dr.deposit_to_type = 'mt5'
        ${accountNumber ? 'AND dr.mt5_account_id = $4' : ''}
      ORDER BY dr.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const depositResult = await pool.query(depositQuery, depositParams);

    // Fetch MT5 account balance changes from wallet_transactions (transfers to/from MT5)
    const transferQuery = `
      SELECT 
        wt.id,
        wt.amount,
        wt.currency,
        wt.type,
        wt.source,
        wt.target,
        wt.mt5_account_number,
        wt.reference,
        wt.created_at,
        CASE 
          WHEN wt.type = 'transfer_in' THEN 'deposit'
          WHEN wt.type = 'transfer_out' THEN 'withdrawal'
          ELSE wt.type
        END as transaction_type,
        CASE 
          WHEN wt.type = 'transfer_in' THEN 'credit'
          WHEN wt.type = 'transfer_out' THEN 'debit'
          ELSE 'credit'
        END as operation_type
      FROM wallet_transactions wt
      INNER JOIN wallets w ON wt.wallet_id = w.id
      WHERE w.user_id = $1 
        AND wt.mt5_account_number IS NOT NULL
        ${accountNumber ? 'AND wt.mt5_account_number = $4' : ''}
      ORDER BY wt.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const transferResult = await pool.query(transferQuery, depositParams);

    // Fetch MT5 withdrawals (withdrawals from MT5 accounts)
    const withdrawalQuery = `
      SELECT 
        w.id,
        w.amount,
        w.currency,
        w.method,
        w.payment_method,
        w.status,
        w.mt5_account_id,
        w.created_at
      FROM withdrawals w
      WHERE w.user_id = $1 
        AND w.mt5_account_id IS NOT NULL
        ${accountNumber ? 'AND w.mt5_account_id = $4' : ''}
      ORDER BY w.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const withdrawalResult = await pool.query(withdrawalQuery, depositParams);

    // Combine transactions
    transactions = [
      ...depositResult.rows.map(row => ({
        id: `deposit_${row.id}`,
        type: 'deposit',
        operationType: 'credit',
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        status: row.status,
        mt5AccountId: row.mt5_account_id,
        gatewayName: row.gateway_name,
        gatewayType: row.gateway_type,
        createdAt: row.created_at,
        description: `Deposit via ${formatGatewayName(row.gateway_name, row.gateway_type)}`,
        reference: `DEP-${row.id}`
      })),
      ...withdrawalResult.rows.map(row => {
        let description = 'Withdrawal';
        if (row.method === 'crypto') {
          description = `Withdrawal via ${row.payment_method || 'Crypto'}`;
        } else if (row.method === 'bank') {
          description = 'Withdrawal via Bank Transfer';
        } else {
          description = `Withdrawal via ${row.method || 'Unknown'}`;
        }
        return {
          id: `withdrawal_${row.id}`,
          type: 'withdrawal',
          operationType: 'debit',
          amount: parseFloat(row.amount),
          currency: row.currency || 'USD',
          status: row.status,
          mt5AccountId: row.mt5_account_id,
          createdAt: row.created_at,
          description: description,
          reference: `WD-${row.id}`
        };
      }),
      ...transferResult.rows.map(row => ({
        id: `transfer_${row.id}`,
        type: row.transaction_type,
        operationType: row.operation_type,
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        status: 'completed',
        mt5AccountId: row.mt5_account_number,
        createdAt: row.created_at,
        description: row.reference || `${row.source} → ${row.target}`,
        reference: row.reference || `TRF-${row.id}`
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get total count
    const depositCountResult = await pool.query(
      accountNumber
        ? 'SELECT COUNT(*) as count FROM deposit_requests WHERE user_id = $1 AND deposit_to_type = \'mt5\' AND mt5_account_id = $2'
        : 'SELECT COUNT(*) as count FROM deposit_requests WHERE user_id = $1 AND deposit_to_type = \'mt5\'',
      accountNumber ? [userId, accountNumber] : [userId]
    );

    const withdrawalCountResult = await pool.query(
      accountNumber
        ? 'SELECT COUNT(*) as count FROM withdrawals WHERE user_id = $1 AND mt5_account_id IS NOT NULL AND mt5_account_id = $2'
        : 'SELECT COUNT(*) as count FROM withdrawals WHERE user_id = $1 AND mt5_account_id IS NOT NULL',
      accountNumber ? [userId, accountNumber] : [userId]
    );

    const transferCountResult = await pool.query(
      accountNumber
        ? `SELECT COUNT(*) as count FROM wallet_transactions wt
           INNER JOIN wallets w ON wt.wallet_id = w.id
           WHERE w.user_id = $1 AND wt.mt5_account_number IS NOT NULL AND wt.mt5_account_number = $2`
        : `SELECT COUNT(*) as count FROM wallet_transactions wt
           INNER JOIN wallets w ON wt.wallet_id = w.id
           WHERE w.user_id = $1 AND wt.mt5_account_number IS NOT NULL`,
      accountNumber ? [userId, accountNumber] : [userId]
    );

    const total = parseInt(depositCountResult.rows[0].count) + parseInt(withdrawalCountResult.rows[0].count) + parseInt(transferCountResult.rows[0].count);

    res.json({
      success: true,
      data: {
        transactions,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get MT5 account statement error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch MT5 account statement'
    });
  }
});

/**
 * GET /api/reports/mt5-account-statement/download/pdf
 * Download MT5 account statement as PDF
 */
router.get('/mt5-account-statement/download/pdf', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const accountNumber = req.query.accountNumber || null;

    // Get the first active auto gateway for Cregis deposits
    const autoGatewayResult = await pool.query(
      `SELECT wallet_name, gateway_type FROM auto_gateway 
       WHERE gateway_type = 'Cryptocurrency' AND is_active = TRUE 
       ORDER BY display_order ASC, created_at DESC LIMIT 1`
    );
    const autoGateway = autoGatewayResult.rows[0] || null;

    // Fetch all MT5 transactions (no limit for PDF)
    const depositQuery = `
      SELECT 
        dr.id,
        dr.amount,
        dr.currency,
        dr.status,
        dr.mt5_account_id,
        dr.created_at,
        CASE 
          WHEN dr.gateway_id IS NOT NULL THEN mg.name
          WHEN dr.cregis_order_id IS NOT NULL THEN $${accountNumber ? '3' : '2'}
          ELSE NULL
        END as gateway_name,
        CASE 
          WHEN dr.gateway_id IS NOT NULL THEN mg.type
          WHEN dr.cregis_order_id IS NOT NULL THEN $${accountNumber ? '4' : '3'}
          ELSE NULL
        END as gateway_type,
        'deposit' as transaction_type
      FROM deposit_requests dr
      LEFT JOIN manual_payment_gateways mg ON dr.gateway_id = mg.id
      WHERE dr.user_id = $1 
        AND dr.deposit_to_type = 'mt5'
        ${accountNumber ? 'AND dr.mt5_account_id = $5' : ''}
      ORDER BY dr.created_at DESC
    `;

    const depositParams = accountNumber 
      ? [userId, accountNumber, autoGateway?.wallet_name || null, autoGateway?.gateway_type || null, accountNumber]
      : [userId, autoGateway?.wallet_name || null, autoGateway?.gateway_type || null];
    const depositResult = await pool.query(depositQuery, depositParams);

    const transferQuery = `
      SELECT 
        wt.id,
        wt.amount,
        wt.currency,
        wt.type,
        wt.mt5_account_number,
        wt.reference,
        wt.created_at
      FROM wallet_transactions wt
      INNER JOIN wallets w ON wt.wallet_id = w.id
      WHERE w.user_id = $1 
        AND wt.mt5_account_number IS NOT NULL
        ${accountNumber ? 'AND wt.mt5_account_number = $2' : ''}
      ORDER BY wt.created_at DESC
    `;

    const transferResult = await pool.query(transferQuery, depositParams);

    // Fetch MT5 withdrawals for PDF
    const withdrawalQuery = `
      SELECT 
        w.id,
        w.amount,
        w.currency,
        w.method,
        w.payment_method,
        w.status,
        w.mt5_account_id,
        w.created_at
      FROM withdrawals w
      WHERE w.user_id = $1 
        AND w.mt5_account_id IS NOT NULL
        ${accountNumber ? 'AND w.mt5_account_id = $2' : ''}
      ORDER BY w.created_at DESC
    `;

    const withdrawalParams = accountNumber ? [userId, accountNumber] : [userId];
    const withdrawalResult = await pool.query(withdrawalQuery, withdrawalParams);

    const transactions = [
      ...depositResult.rows.map(row => ({
        date: new Date(row.created_at).toLocaleDateString(),
        type: 'Deposit',
        description: `Deposit via ${formatGatewayName(row.gateway_name, row.gateway_type)}`,
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        status: row.status,
        account: row.mt5_account_id
      })),
      ...withdrawalResult.rows.map(row => {
        let description = 'Withdrawal';
        if (row.method === 'crypto') {
          description = `Withdrawal via ${row.payment_method || 'Crypto'}`;
        } else if (row.method === 'bank') {
          description = 'Withdrawal via Bank Transfer';
        } else {
          description = `Withdrawal via ${row.method || 'Unknown'}`;
        }
        return {
          date: new Date(row.created_at).toLocaleDateString(),
          type: 'Withdrawal',
          description: description,
          amount: parseFloat(row.amount),
          currency: row.currency || 'USD',
          status: row.status,
          account: row.mt5_account_id
        };
      }),
      ...transferResult.rows.map(row => ({
        date: new Date(row.created_at).toLocaleDateString(),
        type: row.type === 'transfer_in' ? 'Deposit' : 'Withdrawal',
        description: row.reference || `Transfer ${row.type}`,
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        status: 'Completed',
        account: row.mt5_account_number
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get user info
    const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    const filename = `MT5_Account_Statement_${accountNumber || 'All'}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Handle PDF generation errors
    doc.on('error', (error) => {
      console.error('PDF generation stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to generate PDF'
        });
      }
    });

    doc.pipe(res);

    try {
      // Header
      doc.fontSize(20).text('MT5 Account Statement', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Account: ${accountNumber || 'All Accounts'}`, { align: 'center' });
      doc.text(`User: ${user.first_name || ''} ${user.last_name || ''} (${user.email})`, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // Table header
      const tableTop = doc.y;
      const itemHeight = 20;
      let y = tableTop;

      doc.fontSize(10);
      doc.text('Date', 50, y);
      doc.text('Type', 120, y);
      doc.text('Description', 200, y);
      doc.text('Amount', 350, y, { width: 100, align: 'right' });
      doc.text('Status', 460, y);
      y += itemHeight;

      // Draw line
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 10;

      // Table rows
      transactions.forEach((tx) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        doc.text(tx.date || '-', 50, y);
        doc.text(tx.type || '-', 120, y);
        doc.text((tx.description || '-').substring(0, 30), 200, y, { width: 140 });
        doc.text(`${tx.currency || 'USD'} ${(tx.amount || 0).toFixed(2)}`, 350, y, { width: 100, align: 'right' });
        doc.text(tx.status || '-', 460, y);
        y += itemHeight;
      });

      doc.end();
    } catch (pdfError) {
      console.error('PDF content generation error:', pdfError);
      doc.end();
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to generate PDF content'
        });
      }
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate PDF'
    });
  }
});

/**
 * GET /api/reports/mt5-account-statement/download/excel
 * Download MT5 account statement as Excel
 */
router.get('/mt5-account-statement/download/excel', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const accountNumber = req.query.accountNumber || null;

    // Get the first active auto gateway for Cregis deposits
    const autoGatewayResult = await pool.query(
      `SELECT wallet_name, gateway_type FROM auto_gateway 
       WHERE gateway_type = 'Cryptocurrency' AND is_active = TRUE 
       ORDER BY display_order ASC, created_at DESC LIMIT 1`
    );
    const autoGateway = autoGatewayResult.rows[0] || null;

    // Fetch all MT5 transactions
    const depositQuery = `
      SELECT 
        dr.id,
        dr.amount,
        dr.currency,
        dr.status,
        dr.mt5_account_id,
        dr.created_at,
        CASE 
          WHEN dr.gateway_id IS NOT NULL THEN mg.name
          WHEN dr.cregis_order_id IS NOT NULL THEN $${accountNumber ? '3' : '2'}
          ELSE NULL
        END as gateway_name,
        CASE 
          WHEN dr.gateway_id IS NOT NULL THEN mg.type
          WHEN dr.cregis_order_id IS NOT NULL THEN $${accountNumber ? '4' : '3'}
          ELSE NULL
        END as gateway_type,
        'deposit' as transaction_type
      FROM deposit_requests dr
      LEFT JOIN manual_payment_gateways mg ON dr.gateway_id = mg.id
      WHERE dr.user_id = $1 
        AND dr.deposit_to_type = 'mt5'
        ${accountNumber ? 'AND dr.mt5_account_id = $5' : ''}
      ORDER BY dr.created_at DESC
    `;

    const depositParams = accountNumber 
      ? [userId, accountNumber, autoGateway?.wallet_name || null, autoGateway?.gateway_type || null, accountNumber]
      : [userId, autoGateway?.wallet_name || null, autoGateway?.gateway_type || null];
    const depositResult = await pool.query(depositQuery, depositParams);

    const transferQuery = `
      SELECT 
        wt.id,
        wt.amount,
        wt.currency,
        wt.type,
        wt.mt5_account_number,
        wt.reference,
        wt.created_at
      FROM wallet_transactions wt
      INNER JOIN wallets w ON wt.wallet_id = w.id
      WHERE w.user_id = $1 
        AND wt.mt5_account_number IS NOT NULL
        ${accountNumber ? 'AND wt.mt5_account_number = $2' : ''}
      ORDER BY wt.created_at DESC
    `;

    const transferResult = await pool.query(transferQuery, depositParams);

    // Fetch MT5 withdrawals for Excel
    const withdrawalQuery = `
      SELECT 
        w.id,
        w.amount,
        w.currency,
        w.method,
        w.payment_method,
        w.status,
        w.mt5_account_id,
        w.created_at
      FROM withdrawals w
      WHERE w.user_id = $1 
        AND w.mt5_account_id IS NOT NULL
        ${accountNumber ? 'AND w.mt5_account_id = $2' : ''}
      ORDER BY w.created_at DESC
    `;

    const withdrawalParams = accountNumber ? [userId, accountNumber] : [userId];
    const withdrawalResult = await pool.query(withdrawalQuery, withdrawalParams);

    const transactions = [
      ...depositResult.rows.map(row => ({
        date: new Date(row.created_at).toLocaleString(),
        type: 'Deposit',
        description: `Deposit via ${formatGatewayName(row.gateway_name, row.gateway_type)}`,
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        status: row.status,
        account: row.mt5_account_id
      })),
      ...withdrawalResult.rows.map(row => {
        let description = 'Withdrawal';
        if (row.method === 'crypto') {
          description = `Withdrawal via ${row.payment_method || 'Crypto'}`;
        } else if (row.method === 'bank') {
          description = 'Withdrawal via Bank Transfer';
        } else {
          description = `Withdrawal via ${row.method || 'Unknown'}`;
        }
        return {
          date: new Date(row.created_at).toLocaleString(),
          type: 'Withdrawal',
          description: description,
          amount: parseFloat(row.amount),
          currency: row.currency || 'USD',
          status: row.status,
          account: row.mt5_account_id
        };
      }),
      ...transferResult.rows.map(row => ({
        date: new Date(row.created_at).toLocaleString(),
        type: row.type === 'transfer_in' ? 'Deposit' : 'Withdrawal',
        description: row.reference || `Transfer ${row.type}`,
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        status: 'Completed',
        account: row.mt5_account_number
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get user info
    const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('MT5 Account Statement');

    // Add header row
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Account', key: 'account', width: 15 }
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF00A896' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data rows
    transactions.forEach(tx => {
      worksheet.addRow({
        date: tx.date,
        type: tx.type,
        description: tx.description.replace(/Manual Gateway/gi, 'Gateway'),
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        account: tx.account
      });
    });

    // Format amount column
    worksheet.getColumn('amount').numFmt = '#,##0.00';

    const filename = `MT5_Account_Statement_${accountNumber || 'All'}_${Date.now()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate Excel'
    });
  }
});

/**
 * GET /api/reports/transaction-history/download/pdf
 * Download Transaction History as PDF
 */
router.get('/transaction-history/download/pdf', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all transactions (no limit for PDF)
    const depositQuery = `
      SELECT 
        dr.id,
        dr.amount,
        dr.currency,
        dr.status,
        dr.deposit_to_type,
        dr.mt5_account_id,
        dr.wallet_number,
        dr.created_at,
        COALESCE(mg.name, ag.wallet_name) as gateway_name,
        COALESCE(mg.type, ag.gateway_type) as gateway_type
      FROM deposit_requests dr
      LEFT JOIN manual_payment_gateways mg ON dr.gateway_id = mg.id
      LEFT JOIN LATERAL (
        SELECT wallet_name, gateway_type
        FROM auto_gateway
        WHERE gateway_type = 'Cryptocurrency' 
          AND is_active = TRUE
        ORDER BY display_order ASC, created_at DESC
        LIMIT 1
      ) ag ON dr.cregis_order_id IS NOT NULL
      WHERE dr.user_id = $1
      ORDER BY dr.created_at DESC
    `;

    const depositResult = await pool.query(depositQuery, [userId]);

    const withdrawalQuery = `
      SELECT 
        w.id,
        w.amount,
        w.currency,
        w.method,
        w.payment_method,
        w.status,
        w.mt5_account_id,
        w.wallet_id,
        w.created_at,
        wt.wallet_number
      FROM withdrawals w
      LEFT JOIN wallets wt ON w.wallet_id = wt.id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
    `;

    const withdrawalResult = await pool.query(withdrawalQuery, [userId]);

    const accountQuery = `
      SELECT 
        id,
        account_number,
        platform,
        account_type,
        balance,
        equity,
        currency,
        created_at
      FROM trading_accounts
      WHERE user_id = $1 AND platform = 'MT5'
      ORDER BY created_at DESC
    `;

    const accountResult = await pool.query(accountQuery, [userId]);

    // Format transactions
    const transactions = [
      ...depositResult.rows.map(row => ({
        date: new Date(row.created_at).toLocaleDateString(),
        type: 'Deposit',
        description: `Deposit via ${formatGatewayName(row.gateway_name, row.gateway_type)}`,
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        status: row.status,
        account: row.mt5_account_id ? `MT5: ${row.mt5_account_id}` : (row.wallet_number ? `Wallet: ${row.wallet_number}` : '-')
      })),
      ...withdrawalResult.rows.map(row => {
        let description = 'Withdrawal';
        if (row.method === 'crypto') {
          description = `Withdrawal via ${row.payment_method || 'Crypto'}`;
        } else if (row.method === 'bank') {
          description = 'Withdrawal via Bank Transfer';
        }
        return {
          date: new Date(row.created_at).toLocaleDateString(),
          type: 'Withdrawal',
          description: description,
          amount: parseFloat(row.amount),
          currency: row.currency || 'USD',
          status: row.status,
          account: row.mt5_account_id ? `MT5: ${row.mt5_account_id}` : (row.wallet_number ? `Wallet: ${row.wallet_number}` : '-')
        };
      }),
      ...accountResult.rows.map(row => ({
        date: new Date(row.created_at).toLocaleDateString(),
        type: 'Account Creation',
        description: `MT5 Account Created: ${row.account_number}`,
        amount: parseFloat(row.balance || 0),
        currency: row.currency || 'USD',
        status: 'Completed',
        account: `MT5: ${row.account_number}`
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get user info
    const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    const filename = `Transaction_History_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.on('error', (error) => {
      console.error('PDF generation stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to generate PDF'
        });
      }
    });

    doc.pipe(res);

    try {
      // Header
      doc.fontSize(20).text('Transaction History', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`User: ${user.first_name || ''} ${user.last_name || ''} (${user.email})`, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // Table header
      const tableTop = doc.y;
      const itemHeight = 20;
      let y = tableTop;

      doc.fontSize(10);
      doc.text('Date', 50, y);
      doc.text('Type', 120, y);
      doc.text('Description', 200, y);
      doc.text('Amount', 350, y, { width: 100, align: 'right' });
      doc.text('Status', 460, y);
      doc.text('Account', 520, y);
      y += itemHeight;

      // Draw line
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 10;

      // Table rows
      transactions.forEach((tx) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        doc.text(tx.date || '-', 50, y);
        doc.text(tx.type || '-', 120, y);
        doc.text((tx.description || '-').substring(0, 30), 200, y, { width: 140 });
        doc.text(`${tx.currency || 'USD'} ${(tx.amount || 0).toFixed(2)}`, 350, y, { width: 100, align: 'right' });
        doc.text(tx.status || '-', 460, y);
        doc.text((tx.account || '-').substring(0, 20), 520, y, { width: 30 });
        y += itemHeight;
      });

      doc.end();
    } catch (pdfError) {
      console.error('PDF content generation error:', pdfError);
      doc.end();
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to generate PDF content'
        });
      }
    }
  } catch (error) {
    console.error('Transaction History PDF generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate PDF'
      });
    }
  }
});

/**
 * GET /api/reports/transaction-history/download/excel
 * Download Transaction History as Excel
 */
router.get('/transaction-history/download/excel', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all transactions (no limit for Excel)
    const depositQuery = `
      SELECT 
        dr.id,
        dr.amount,
        dr.currency,
        dr.status,
        dr.deposit_to_type,
        dr.mt5_account_id,
        dr.wallet_number,
        dr.created_at,
        COALESCE(mg.name, ag.wallet_name) as gateway_name,
        COALESCE(mg.type, ag.gateway_type) as gateway_type
      FROM deposit_requests dr
      LEFT JOIN manual_payment_gateways mg ON dr.gateway_id = mg.id
      LEFT JOIN LATERAL (
        SELECT wallet_name, gateway_type
        FROM auto_gateway
        WHERE gateway_type = 'Cryptocurrency' 
          AND is_active = TRUE
        ORDER BY display_order ASC, created_at DESC
        LIMIT 1
      ) ag ON dr.cregis_order_id IS NOT NULL
      WHERE dr.user_id = $1
      ORDER BY dr.created_at DESC
    `;

    const depositResult = await pool.query(depositQuery, [userId]);

    const withdrawalQuery = `
      SELECT 
        w.id,
        w.amount,
        w.currency,
        w.method,
        w.payment_method,
        w.status,
        w.mt5_account_id,
        w.wallet_id,
        w.created_at,
        wt.wallet_number
      FROM withdrawals w
      LEFT JOIN wallets wt ON w.wallet_id = wt.id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
    `;

    const withdrawalResult = await pool.query(withdrawalQuery, [userId]);

    const accountQuery = `
      SELECT 
        id,
        account_number,
        platform,
        account_type,
        balance,
        equity,
        currency,
        created_at
      FROM trading_accounts
      WHERE user_id = $1 AND platform = 'MT5'
      ORDER BY created_at DESC
    `;

    const accountResult = await pool.query(accountQuery, [userId]);

    // Format transactions
    const transactions = [
      ...depositResult.rows.map(row => ({
        date: new Date(row.created_at).toLocaleString(),
        type: 'Deposit',
        description: `Deposit via ${formatGatewayName(row.gateway_name, row.gateway_type)}`,
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        status: row.status,
        account: row.mt5_account_id ? `MT5: ${row.mt5_account_id}` : (row.wallet_number ? `Wallet: ${row.wallet_number}` : '-')
      })),
      ...withdrawalResult.rows.map(row => {
        let description = 'Withdrawal';
        if (row.method === 'crypto') {
          description = `Withdrawal via ${row.payment_method || 'Crypto'}`;
        } else if (row.method === 'bank') {
          description = 'Withdrawal via Bank Transfer';
        }
        return {
          date: new Date(row.created_at).toLocaleString(),
          type: 'Withdrawal',
          description: description,
          amount: parseFloat(row.amount),
          currency: row.currency || 'USD',
          status: row.status,
          account: row.mt5_account_id ? `MT5: ${row.mt5_account_id}` : (row.wallet_number ? `Wallet: ${row.wallet_number}` : '-')
        };
      }),
      ...accountResult.rows.map(row => ({
        date: new Date(row.created_at).toLocaleString(),
        type: 'Account Creation',
        description: `MT5 Account Created: ${row.account_number}`,
        amount: parseFloat(row.balance || 0),
        currency: row.currency || 'USD',
        status: 'Completed',
        account: `MT5: ${row.account_number}`
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get user info
    const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transaction History');

    // Add header row
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Account', key: 'account', width: 20 }
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF00A896' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data rows
    transactions.forEach(tx => {
      worksheet.addRow({
        date: tx.date,
        type: tx.type,
        description: tx.description,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        account: tx.account
      });
    });

    // Format amount column
    worksheet.getColumn('amount').numFmt = '#,##0.00';

    const filename = `Transaction_History_${Date.now()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Transaction History Excel generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate Excel'
      });
    }
  }
});

/**
 * GET /api/reports/trading-performance
 * Get trading performance summary with real-time data
 */
router.get('/trading-performance', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountNumber, timeframe = '365' } = req.query;
    
    // Calculate date range based on timeframe
    const days = parseInt(timeframe) || 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get real accounts only (not demo)
    let accountsQuery = `
      SELECT account_number, balance, equity, credit, is_demo
      FROM trading_accounts
      WHERE user_id = $1 AND platform = 'MT5' AND is_demo = FALSE
    `;
    let accountsParams = [userId];
    
    if (accountNumber && accountNumber !== 'all') {
      accountsQuery += ' AND account_number = $2';
      accountsParams.push(accountNumber);
    }
    
    const accountsResult = await pool.query(accountsQuery, accountsParams);
    const realAccounts = accountsResult.rows;
    const accountNumbers = realAccounts.map(acc => acc.account_number);
    
    if (accountNumbers.length === 0) {
      return res.json({
        success: true,
        data: {
          summary: {
            netProfit: 0,
            profit: 0,
            loss: 0,
            unrealisedPL: 0,
            closedOrders: 0,
            profitable: 0,
            unprofitable: 0,
            tradingVolume: 0,
            lifetimeVolume: 0,
            equity: 0
          },
          chartData: {
            netProfit: { labels: [], profit: [], loss: [] },
            closedOrders: { labels: [], profitable: [], unprofitable: [] },
            tradingVolume: { labels: [], volumes: [] },
            equity: { labels: [], values: [] }
          }
        }
      });
    }
    
    // Get approved deposits for MT5 accounts
    let depositsQuery = `
      SELECT 
        amount,
        currency,
        mt5_account_id,
        created_at
      FROM deposit_requests
      WHERE user_id = $1 
        AND status = 'approved'
        AND deposit_to_type = 'mt5'
        AND created_at >= $2
    `;
    let depositsParams = [userId, startDate];
    
    if (accountNumber && accountNumber !== 'all') {
      depositsQuery += ' AND mt5_account_id = $3';
      depositsParams.push(accountNumber);
    }
    
    const depositsResult = await pool.query(depositsQuery, depositsParams);
    
    // Get approved withdrawals from MT5 accounts
    let withdrawalsQuery = `
      SELECT 
        amount,
        currency,
        mt5_account_id,
        created_at
      FROM withdrawals
      WHERE user_id = $1 
        AND status = 'approved'
        AND mt5_account_id IS NOT NULL
        AND created_at >= $2
    `;
    let withdrawalsParams = [userId, startDate];
    
    if (accountNumber && accountNumber !== 'all') {
      withdrawalsQuery += ' AND mt5_account_id = $3';
      withdrawalsParams.push(accountNumber);
    }
    
    const withdrawalsResult = await pool.query(withdrawalsQuery, withdrawalsParams);
    
    // Calculate totals
    const totalDeposits = depositsResult.rows.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
    const totalWithdrawals = withdrawalsResult.rows.reduce((sum, w) => sum + parseFloat(w.amount || 0), 0);
    
    // Get current equity from accounts
    const totalEquity = realAccounts.reduce((sum, acc) => {
      const equity = parseFloat(acc.equity || 0);
      const balance = parseFloat(acc.balance || 0);
      const credit = parseFloat(acc.credit || 0);
      return sum + equity + balance + credit;
    }, 0);
    
    // Calculate net profit: Current equity - (Total Deposits - Total Withdrawals)
    // This represents the profit/loss from trading
    // Example: Deposited $1000, Withdrew $200, Current Equity $900
    // Net Profit = $900 - ($1000 - $200) = $900 - $800 = $100 (profit)
    const netProfit = totalEquity - (totalDeposits - totalWithdrawals);
    
    // For profit/loss breakdown:
    // Profit = positive net profit
    // Loss = negative net profit (as positive number)
    const profit = netProfit > 0 ? netProfit : 0;
    const loss = netProfit < 0 ? Math.abs(netProfit) : 0;
    
    // Get monthly data for charts
    const months = [];
    const monthlyData = {};
    
    // Generate month labels (last 12 months or based on timeframe)
    const numMonths = Math.ceil(days / 30);
    for (let i = numMonths - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const monthShort = date.toLocaleDateString('en-US', { month: 'short' });
      months.push(monthShort);
      monthlyData[monthKey] = {
        deposits: 0,
        withdrawals: 0,
        net: 0
      };
    }
    
    // Aggregate deposits by month
    depositsResult.rows.forEach(deposit => {
      const date = new Date(deposit.created_at);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].deposits += parseFloat(deposit.amount || 0);
      }
    });
    
    // Aggregate withdrawals by month
    withdrawalsResult.rows.forEach(withdrawal => {
      const date = new Date(withdrawal.created_at);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].withdrawals += parseFloat(withdrawal.amount || 0);
      }
    });
    
    // Calculate net for each month (deposits - withdrawals)
    Object.keys(monthlyData).forEach(key => {
      monthlyData[key].net = monthlyData[key].deposits - monthlyData[key].withdrawals;
    });
    
    // Build chart data arrays matching month labels
    // For net profit chart, we show monthly cash flow (deposits - withdrawals)
    // Positive = more deposits than withdrawals, Negative = more withdrawals than deposits
    const monthKeys = Object.keys(monthlyData);
    const netProfitData = {
      labels: months,
      profit: months.map((month) => {
        // Find matching month key (handle year differences)
        const matchingKey = monthKeys.find(key => {
          const keyMonth = key.split(' ')[0];
          return keyMonth === month;
        });
        if (matchingKey && monthlyData[matchingKey]) {
          const net = monthlyData[matchingKey].net;
          return net > 0 ? net : 0;
        }
        return 0;
      }),
      loss: months.map((month) => {
        const matchingKey = monthKeys.find(key => {
          const keyMonth = key.split(' ')[0];
          return keyMonth === month;
        });
        if (matchingKey && monthlyData[matchingKey]) {
          const net = monthlyData[matchingKey].net;
          return net < 0 ? Math.abs(net) : 0;
        }
        return 0;
      })
    };
    
    // For closed orders, we don't have trade data, so we'll show 0
    // This would need MT5 API integration to get actual trade history
    const closedOrdersData = {
      labels: months,
      profitable: months.map(() => 0),
      unprofitable: months.map(() => 0)
    };
    
    // Trading volume - use deposits + withdrawals as proxy
    const tradingVolumeData = {
      labels: months,
      volumes: months.map((month) => {
        const matchingKey = monthKeys.find(key => {
          const keyMonth = key.split(' ')[0];
          return keyMonth === month;
        });
        if (matchingKey && monthlyData[matchingKey]) {
          return monthlyData[matchingKey].deposits + monthlyData[matchingKey].withdrawals;
        }
        return 0;
      })
    };
    
    // Equity data - for now show current equity for all months
    // In future, could fetch historical equity from MT5 API
    const equityData = {
      labels: months,
      values: months.map(() => totalEquity)
    };
    
    // Get lifetime totals (all time, not just timeframe)
    let lifetimeDepositsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM deposit_requests
      WHERE user_id = $1 AND status = 'approved' AND deposit_to_type = 'mt5'
    `;
    let lifetimeDepositsParams = [userId];
    
    if (accountNumber && accountNumber !== 'all') {
      lifetimeDepositsQuery += ' AND mt5_account_id = $2';
      lifetimeDepositsParams.push(accountNumber);
    }
    
    const lifetimeDepositsResult = await pool.query(lifetimeDepositsQuery, lifetimeDepositsParams);
    
    // Get lifetime withdrawals for volume calculation
    let lifetimeWithdrawalsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM withdrawals
      WHERE user_id = $1 AND status = 'approved' AND mt5_account_id IS NOT NULL
    `;
    let lifetimeWithdrawalsParams = [userId];
    
    if (accountNumber && accountNumber !== 'all') {
      lifetimeWithdrawalsQuery += ' AND mt5_account_id = $2';
      lifetimeWithdrawalsParams.push(accountNumber);
    }
    
    const lifetimeWithdrawalsResult = await pool.query(lifetimeWithdrawalsQuery, lifetimeWithdrawalsParams);
    const lifetimeDeposits = parseFloat(lifetimeDepositsResult.rows[0]?.total || 0);
    const lifetimeWithdrawals = parseFloat(lifetimeWithdrawalsResult.rows[0]?.total || 0);
    const lifetimeVolume = lifetimeDeposits + lifetimeWithdrawals;
    
    res.json({
      success: true,
      data: {
        summary: {
          netProfit: parseFloat(netProfit.toFixed(2)),
          profit: parseFloat(profit.toFixed(2)),
          loss: parseFloat(loss.toFixed(2)),
          unrealisedPL: 0, // Would need open positions data
          closedOrders: 0, // Would need trade history
          profitable: 0,
          unprofitable: 0,
          tradingVolume: parseFloat((totalDeposits + totalWithdrawals).toFixed(2)),
          lifetimeVolume: parseFloat(lifetimeVolume.toFixed(2)),
          equity: parseFloat(totalEquity.toFixed(2))
        },
        chartData: {
          netProfit: netProfitData,
          closedOrders: closedOrdersData,
          tradingVolume: tradingVolumeData,
          equity: equityData
        }
      }
    });
  } catch (error) {
    console.error('Get trading performance error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch trading performance'
    });
  }
});

export default router;

