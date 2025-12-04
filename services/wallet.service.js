import pool from '../config/database.js';

// Helper: generate a wallet number like W-<userId>-<random>
function generateWalletNumber(userId) {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `W-${userId}-${random}`;
}

export async function createWalletForUser(userId, client = pool) {
  // Check if wallet already exists
  const existing = await client.query(
    'SELECT id, wallet_number, currency, balance, status FROM wallets WHERE user_id = $1',
    [userId]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const walletNumber = generateWalletNumber(userId);
  const result = await client.query(
    `INSERT INTO wallets (user_id, wallet_number)
     VALUES ($1, $2)
     RETURNING id, wallet_number, currency, balance, status, created_at, updated_at`,
    [userId, walletNumber]
  );
  return result.rows[0];
}

export async function getWalletByUserId(userId, client = pool) {
  const result = await client.query(
    'SELECT id, user_id, wallet_number, currency, balance, status, created_at, updated_at FROM wallets WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

// Adjust wallet balance and record a transaction atomically
export async function adjustWalletBalance(
  {
    walletId,
    amount,
    type,
    source,
    target,
    currency = 'USD',
    mt5AccountNumber = null,
    reference = null
  },
  client = pool
) {
  if (!walletId) {
    throw new Error('walletId is required');
  }
  if (!amount || Number(amount) <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  const numericAmount = Number(amount);

  const dbClient = await client.connect();
  try {
    await dbClient.query('BEGIN');

    // Lock row
    const walletRes = await dbClient.query(
      'SELECT id, balance, currency, status FROM wallets WHERE id = $1 FOR UPDATE',
      [walletId]
    );
    if (walletRes.rows.length === 0) {
      throw new Error('Wallet not found');
    }
    const wallet = walletRes.rows[0];
    if (wallet.status !== 'active') {
      throw new Error('Wallet is not active');
    }

    let newBalance = Number(wallet.balance);
    if (type === 'deposit' || type === 'transfer_in') {
      newBalance += numericAmount;
    } else if (type === 'withdrawal' || type === 'transfer_out') {
      if (numericAmount > newBalance) {
        throw new Error('Insufficient wallet balance');
      }
      newBalance -= numericAmount;
    } else {
      throw new Error(`Unsupported wallet transaction type: ${type}`);
    }

    await dbClient.query(
      'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
      [newBalance, walletId]
    );

    await dbClient.query(
      `INSERT INTO wallet_transactions
         (wallet_id, type, source, target, amount, currency, mt5_account_number, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [walletId, type, source, target, numericAmount, currency, mt5AccountNumber, reference]
    );

    await dbClient.query('COMMIT');

    return {
      walletId,
      balance: newBalance
    };
  } catch (error) {
    await dbClient.query('ROLLBACK');
    throw error;
  } finally {
    dbClient.release();
  }
}


