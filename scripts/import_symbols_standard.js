import dotenv from 'dotenv';
import pool from '../config/database.js';

dotenv.config();

// MT5 Symbols endpoint
// IMPORTANT: If MT5_API_URL is not set, fall back cleanly to hardcoded URL.
let MT5_SYMBOLS_URL;
if (process.env.MT5_API_URL && process.env.MT5_API_URL.trim().length > 0) {
  MT5_SYMBOLS_URL = process.env.MT5_API_URL.replace(/\/+$/, '') + '/Symbols';
} else {
  MT5_SYMBOLS_URL = 'http://13.43.216.232:5003/api/Symbols';
}

// Standard account bearer token (can be overridden via env)
const STANDARD_TOKEN =
  process.env.MT5_STANDARD_SYMBOLS_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiJjbGllbnRfNjM5MDMzNjYxNzg0MDMxNDE3XzI1NTUiLCJhY2NvdW50X2lkIjoiNzk1MDQ0IiwiZW1haWwiOiIiLCJ1bmlxdWVfbmFtZSI6Ik1UNSBBY2NvdW50IDc5NTA0NCIsInJvbGUiOiJDbGllbnQiLCJ0b2tlbl90eXBlIjoiY2xpZW50IiwibmJmIjoxNzY3NzY5Mzc4LCJleHAiOjE3OTkzMDUzNzgsImlhdCI6MTc2Nzc2OTM3OCwiaXNzIjoiTVQ1TWFuYWdlckFQSSIsImF1ZCI6Ik1UNU1hbmFnZXJBUElVc2VycyJ9.hX1WdaqZqNkAEmxJGWGscBgACgF3MLLnSfl5i5xxAIc';

const ACCOUNT_TYPE = 'Standard';

async function fetchStandardSymbols() {
  console.log('🔄 Fetching STANDARD symbols from MT5 API...');

  const res = await fetch(MT5_SYMBOLS_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STANDARD_TOKEN}`
    }
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Invalid JSON from MT5 /Symbols: ${text.substring(0, 500)}`
    );
  }

  if (!res.ok) {
    const msg = data.Message || data.error || JSON.stringify(data).substring(0, 500);
    throw new Error(`Failed to fetch symbols: ${msg}`);
  }

  const symbols = Array.isArray(data) ? data : data.data || data.Symbols || [];
  console.log(`✅ Received ${symbols.length} STANDARD symbols`);
  return symbols;
}

async function upsertStandardSymbols(symbols) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const sym of symbols) {
      const symbol = sym.Symbol || sym.symbol;
      if (!symbol) continue;

      const pair = sym.Description || sym.description || null;
      const groupName = ACCOUNT_TYPE; // mark as Standard
      const category = sym.Category || sym.category || null;

      // We don't get direct pip-per-lot or pip-value from this API, keep null for now
      const pip_per_lot = null;
      const pip_value = null;
      const commission = 0;

      const currency =
        sym.CurrencyProfit ||
        sym.CurrencyMargin ||
        sym.Currency ||
        'USD';

      const status = 'active';
      const contract_size = sym.ContractSize ?? null;
      const digits = sym.Digits ?? null;
      const spread = sym.Spread ?? null;
      const profit_mode = sym.ProfitMode || null;

      // Upsert manually (no DB unique constraint required)
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
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,NOW(),NOW())`,
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
    console.log(`✅ Upserted ${symbols.length} STANDARD symbols into symbols_with_categories`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error inserting STANDARD symbols:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    const symbols = await fetchStandardSymbols();
    if (!symbols.length) {
      console.warn('⚠️ No STANDARD symbols returned from API');
      return;
    }
    await upsertStandardSymbols(symbols);
    console.log('✅ STANDARD symbols import finished.');
  } catch (error) {
    console.error('❌ STANDARD symbols import failed:', error);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;


