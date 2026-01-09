import dotenv from 'dotenv';
import pool from '../config/database.js';

dotenv.config();

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

const ACCOUNT_TYPES = {
  ECN: ECN_TOKEN,
  STANDARD: STANDARD_TOKEN
};

const forexSymbols = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
const metalsSymbols = ['XAU', 'XAG', 'GOLD', 'SILVER'];
const indicesSymbols = ['US30', 'US500', 'NAS100', 'UK100', 'GER30', 'SPX', 'DJI', 'NDX'];
const cryptoSymbols = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOGE', 'SOL', 'BNB'];

function categorizeSymbol(symbol = '') {
  const s = symbol.toUpperCase();

  if (cryptoSymbols.some((c) => s.includes(c))) return 'Cryptocurrencies';
  if (metalsSymbols.some((m) => s.includes(m))) return 'Metals';
  if (indicesSymbols.some((i) => s.includes(i))) return 'Indices';

  // Simple forex detection: contains '/' or is 6 letters currency pair
  if (s.includes('/') || (s.length === 6 && forexSymbols.some((c) => s.startsWith(c)))) {
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

async function upsertSymbols(accountType, symbols) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const sym of symbols) {
      const symbol = sym.symbol || sym.Symbol || sym.name;
      if (!symbol) continue;

      const pair =
        sym.pair || sym.Pair || sym.description || sym.Description || sym.SymbolDescription || null;

      // Group from API if present; otherwise fall back to accountType
      const groupName =
        sym.group_name || sym.Group || sym.group || sym.symbolGroup || accountType;

      const category = sym.category || categorizeSymbol(symbol);

      const pipPerLotRaw = sym.pip_per_lot ?? sym.PipPerLot ?? null;
      const pipValueRaw = sym.pip_value ?? sym.PipValue ?? null;
      const commissionRaw = sym.commission ?? sym.Commission ?? null;

      const pip_per_lot =
        pipPerLotRaw !== null && pipPerLotRaw !== undefined
          ? Number(pipPerLotRaw) || 0
          : null;
      const pip_value =
        pipValueRaw !== null && pipValueRaw !== undefined ? Number(pipValueRaw) || 0 : null;
      const commission =
        commissionRaw !== null && commissionRaw !== undefined
          ? Number(commissionRaw) || 0
          : null;

      const currency = sym.currency || sym.Currency || 'USD';
      const status = sym.status || sym.Status || 'active';

      const contract_size =
        sym.contract_size ?? sym.ContractSize ?? sym.VolumeStep ?? null;
      const digits = sym.digits ?? sym.Digits ?? null;
      const spread = sym.spread ?? sym.Spread ?? null;
      const profit_mode = sym.profit_mode || sym.ProfitMode || null;

      // Upsert into symbols_with_categories without relying on a DB UNIQUE constraint
      // First try to find an existing row by natural key (symbol + group_name)
      const existing = await client.query(
        `SELECT id FROM symbols_with_categories WHERE symbol = $1 AND group_name = $2 LIMIT 1`,
        [symbol, groupName]
      );

      if (existing.rows.length > 0) {
        const id = existing.rows[0].id;
        await client.query(
          `UPDATE symbols_with_categories
             SET pair = $2,
                 category = $3,
                 pip_per_lot = $4,
                 pip_value = $5,
                 commission = $6,
                 currency = $7,
                 status = $8,
                 contract_size = $9,
                 digits = $10,
                 spread = $11,
                 profit_mode = $12,
                 updated_at = NOW()
           WHERE id = $1`,
          [
            id,
            pair,
            category,
            pip_per_lot,
            pip_value,
            commission,
            currency,
            status,
            contract_size,
            digits,
            spread,
            profit_mode
          ]
        );
      } else {
        await client.query(
          `INSERT INTO symbols_with_categories
            (symbol, pair, group_name, category, pip_per_lot, pip_value, commission, currency, status, contract_size, digits, spread, profit_mode, is_override, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false, NOW(), NOW())`,
          [
            symbol,
            pair,
            groupName,
            category,
            pip_per_lot,
            pip_value,
            commission,
            currency,
            status,
            contract_size,
            digits,
            spread,
            profit_mode
          ]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Upserted ${symbols.length} symbols for ${accountType} into symbols_with_categories`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Error upserting symbols for ${accountType}:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    for (const [accountType, token] of Object.entries(ACCOUNT_TYPES)) {
      if (!token) {
        console.warn(`⚠️  Skipping ${accountType} – no token configured`);
        continue;
      }
      const symbols = await fetchSymbolsForToken(accountType, token);
      if (symbols.length === 0) {
        console.warn(`⚠️  No symbols returned for ${accountType}`);
        continue;
      }
      await upsertSymbols(accountType, symbols);
    }

    console.log('✅ Symbols sync completed for all configured account types.');
  } catch (error) {
    console.error('❌ Symbols sync failed:', error);
    process.exitCode = 1;
  } finally {
    // Allow pool to close
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  }
}

// Run only when called directly via node
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;


