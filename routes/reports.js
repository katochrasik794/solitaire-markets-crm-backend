import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

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
    const accountCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM trading_accounts WHERE user_id = $1 AND platform = \'MT5\'',
      [userId]
    );
    const total = parseInt(depositCountResult.rows[0].count) + parseInt(accountCountResult.rows[0].count);

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

    const total = parseInt(depositCountResult.rows[0].count) + parseInt(transferCountResult.rows[0].count);

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

    doc.pipe(res);

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
      doc.text(tx.date, 50, y);
      doc.text(tx.type, 120, y);
      doc.text(tx.description.substring(0, 30), 200, y, { width: 140 });
      doc.text(`${tx.currency} ${tx.amount.toFixed(2)}`, 350, y, { width: 100, align: 'right' });
      doc.text(tx.status, 460, y);
      y += itemHeight;
    });

    doc.end();
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

export default router;

