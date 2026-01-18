import dotenv from 'dotenv';
import path from 'path';
import pool from '../config/database.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Base MT5 URL (same as mt5.service.js)
const MT5_API_URL = process.env.MT5_API_URL || 'http://13.43.216.232:5003/api';

// Tokens for different account / group types
// TODO: move these to environment variables in production
const ECN_TOKEN =
  process.env.MT5_ECN_SYMBOLS_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiJjbGllbnRfNjM5MDMzNjU5MDE0MzY5ODIyXzc5NjYiLCJhY2NvdW50X2lkIjoiNzk1MDQzIiwiZW1haWwiOiIiLCJ1bmlxdWVfbmFtZSI6Ik1UNSBBY2NvdW50IDc5NTA0MyIsInJvbGUiOiJDbGllbnQiLCJ0b2tlbl90eXBlIjoiY2xpZW50IiwibmJmIjoxNzY3NzY5MTAxLCJleHAiOjE3OTkzMDUxMDEsImlhdCI6MTc2Nzc2OTEwMSwiaXNzIjoiTVQ1TWFuYWdlckFQSSIsImF1ZCI6Ik1UNU1hbmFnZXJBUElVc2VycyJ9.MdC0WtQYL2hlxWkU6W7a3p1cxv28GM7j24Eo5DxjGVg';

const STANDARD_TOKEN =
  process.env.MT5_STANDARD_SYMBOLS_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiJjbGllbnRfNjM5MDMzNjYxNzg0MDMxNDE3XzI1NTUiLCJhY2NvdW50X2lkIjoiNzk1MDQ0IiwiZW1haWwiOiIiLCJ1bmlxdWVfbmFtZSI6Ik1UNSBBY2NvdW50IDc5NTA0NCIsInJvbGUiOiJDbGllbnQiLCJ0b2tlbl90eXBlIjoiY2xpZW50IiwibmJmIjoxNzY3NzY5Mzc4LCJleHAiOjE3OTkzMDUzNzgsImlhdCI6MTc2Nzc2OTM3OCwiaXNzIjoiTVQ1TWFuYWdlckFQSSIsImF1ZCI6Ik1UNU1hbmFnZXJBUElVc2VycyJ9.hX1WdaqZqNkAEmxJGWGscBgACgF3MLLnSfl5i5xxAIc';

const ACCOUNT_CREDENTIALS = {
  ECN: {
    accountId: 795049,
    password: 'Finovo@123'
  },
  STANDARD: {
    accountId: 795050,
    password: 'Finovo@123'
  }
};

const forexSymbols = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
const metalsSymbols = ['XAU', 'XAG', 'GOLD', 'SILVER'];
const indicesSymbols = ['US30', 'US500', 'NAS100', 'UK100', 'GER30', 'SPX', 'DJI', 'NDX'];
const cryptoSymbols = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOGE', 'SOL', 'BNB'];

async function getMT5Token(accountId, password) {
  console.log(`🔑 Logging in to MT5 for account ${accountId}...`);
  try {
    const res = await fetch(`${MT5_API_URL}/client/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed');
    }

    if (data.Token) return data.Token;
    if (data.data && data.data.token) return data.data.token;
    if (data.data && typeof data.data === 'string') return data.data;

    throw new Error('No token returned from MT5 login');
  } catch (error) {
    console.error(`❌ MT5 Login failed for ${accountId}:`, error.message);
    throw error;
  }
}

function categorizeSymbol(symbol = '') {
  const s = symbol.toUpperCase();

  if (cryptoSymbols.some((c) => s.includes(c))) return 'Cryptocurrencies';
  if (metalsSymbols.some((m) => s.includes(m))) return 'Metals';
  if (indicesSymbols.some((i) => s.includes(i))) return 'Indices';

  // Simple forex detection: contains '/' or is 6 letters currency pair
  if (s.includes('/') || (s.length >= 6 && forexSymbols.some((c) => s.startsWith(c)))) {
    return 'Forex';
  }

  return 'Other';
}

async function fetchSymbolsForToken(accountType, token) {
  console.log(`🔄 Fetching symbols for ${accountType} from MT5 API...`);

  const res = await fetch(`${MT5_API_URL}/Symbols`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON from MT5 /Symbols (${accountType}): ${text.substring(0, 500)}`);
  }

  if (!res.ok) {
    const msg = data.Message || data.error || JSON.stringify(data).substring(0, 500);
    throw new Error(`Failed to fetch symbols for ${accountType}: ${msg}`);
  }

  const symbols = Array.isArray(data) ? data : data.data || data.Symbols || [];
  console.log(`✅ Received ${symbols.length} symbols for ${accountType}`);
  return symbols;
}

async function upsertSymbols(accountType, symbols, onProgress = null) {
  const client = await pool.connect();
  let inserted = 0;
  let skipped = 0;
  const total = symbols.length;

  try {
    const batchSize = 50;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      await client.query('BEGIN');

      for (const sym of batch) {
        const symbol = sym.symbol || sym.Symbol || sym.name;
        if (!symbol) continue;

        let groupName = accountType.toUpperCase() === 'ECN' ? 'ECN' : 'Standard';
        if (sym.Path) {
          const upPath = sym.Path.toUpperCase();
          if (upPath.includes('ECN')) groupName = 'ECN';
          else if (upPath.includes('STD')) groupName = 'Standard';
        }

        const existingQuery = await client.query(
          `SELECT id FROM symbols_with_categories WHERE symbol = $1 AND group_name = $2 LIMIT 1`,
          [symbol, groupName]
        );

        if (existingQuery.rows.length > 0) {
          skipped++;
          if (onProgress) {
            onProgress({
              status: 'inserting',
              current: inserted + skipped,
              total,
              symbol,
              accountType,
              skipped,
              msg: 'already found'
            });
          }
          continue;
        }

        const pair = sym.pair || sym.Pair || sym.description || sym.Description || sym.SymbolDescription || null;
        const category = sym.category || sym.Category || categorizeSymbol(symbol);
        const pipPerLotRaw = sym.pip_per_lot ?? sym.PipPerLot ?? 1.0;
        const pipValueRaw = sym.pip_value ?? sym.PipValue ?? null;
        const commissionRaw = sym.commission ?? sym.Commission ?? 0;

        const pip_per_lot = Number(pipPerLotRaw) || 1.0;
        const pip_value = pipValueRaw !== null && pipValueRaw !== undefined ? Number(pipValueRaw) : null;
        // Auto-calculate commission if not provided, or override based on formula: Commission = PipValue * PipPerLot
        // We use the calculated value to ensure consistency with the user's request
        let commission = Number(commissionRaw) || 0;
        if (pip_value !== null) {
          commission = pip_per_lot * pip_value;
        }

        const currency = sym.currency || sym.Currency || sym.CurrencyProfit || 'USD';
        const status = sym.status || sym.Status || 'active';

        const contractSizeRaw = sym.contract_size ?? sym.ContractSize ?? sym.VolumeStep ?? null;
        const digitsRaw = sym.digits ?? sym.Digits ?? null;
        const spreadRaw = sym.spread ?? sym.Spread ?? null;

        const contract_size = contractSizeRaw !== null && contractSizeRaw !== undefined ? Number(contractSizeRaw) : null;
        const digits = digitsRaw !== null && digitsRaw !== undefined ? Number(digitsRaw) : null;
        const spread = spreadRaw !== null && spreadRaw !== undefined ? Number(spreadRaw) : null;

        const profit_mode = sym.profit_mode || sym.ProfitMode || null;

        await client.query(
          `INSERT INTO symbols_with_categories
            (symbol, pair, group_name, category, pip_per_lot, pip_value, commission, currency, status, contract_size, digits, spread, profit_mode, is_override, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false, NOW(), NOW())`,
          [symbol, pair, groupName, category, pip_per_lot, pip_value, commission, currency, status, contract_size, digits, spread, profit_mode]
        );

        inserted++;
        if (onProgress) {
          onProgress({
            status: 'inserting',
            current: inserted + skipped,
            total,
            symbol,
            accountType,
            skipped
          });
        }
      }
      await client.query('COMMIT');
    }
    console.log(`✅ Sync for ${accountType}: ${inserted} inserted, ${skipped} skipped (total ${total})`);
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error(`❌ Error upserting symbols for ${accountType}:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main(targetType = null, onProgress = null) {
  try {
    const targets = targetType
      ? { [targetType.toUpperCase()]: ACCOUNT_CREDENTIALS[targetType.toUpperCase()] }
      : ACCOUNT_CREDENTIALS;

    for (const [accountType, creds] of Object.entries(targets)) {
      if (!creds) {
        console.warn(`⚠️  Skipping ${accountType} – no credentials configured or invalid type`);
        continue;
      }
      try {
        if (onProgress) onProgress({ status: 'logging_in', accountType });
        const token = await getMT5Token(creds.accountId, creds.password);

        if (onProgress) onProgress({ status: 'fetching', accountType });
        const symbols = await fetchSymbolsForToken(accountType, token);

        if (symbols.length === 0) {
          console.warn(`⚠️  No symbols returned for ${accountType}`);
          if (onProgress) onProgress({ status: 'no_symbols', accountType });
          continue;
        }

        await upsertSymbols(accountType, symbols, onProgress);
      } catch (err) {
        console.error(`❌ Failed sync for ${accountType}:`, err.message);
        if (onProgress) onProgress({ status: 'error', accountType, message: err.message });
      }
    }

    if (onProgress) onProgress({ status: 'completed' });
    console.log('✅ Symbols sync completed.');
  } catch (error) {
    console.error('❌ Symbols sync failed:', error);
    if (onProgress) onProgress({ status: 'failed', error: error.message });
    process.exitCode = 1;
  } finally {
    // Note: If running from API, don't exit process
    if (import.meta.url === `file://${process.argv[1]}`) {
      setTimeout(() => process.exit(process.exitCode || 0), 100);
    }
  }
}

// Run only when called directly via node
if (import.meta.url === `file://${process.argv[1]}`) {
  const argType = process.argv[2]; // e.g. node sync_symbols.js ECN
  main(argType);
}

export default main;


