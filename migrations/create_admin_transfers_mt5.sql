-- Admin MT5 & wallet transfer history
CREATE TABLE IF NOT EXISTS admin_transfers_mt5 (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES admin(id) ON DELETE SET NULL,
  from_type VARCHAR(20) NOT NULL, -- 'wallet' or 'mt5'
  from_ref TEXT NOT NULL,         -- wallet_number or mt5_login
  to_type VARCHAR(20) NOT NULL,
  to_ref TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_transfers_mt5_created_at
  ON admin_transfers_mt5(created_at DESC);


