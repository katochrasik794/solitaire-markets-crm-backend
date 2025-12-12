-- Withdrawals Table Schema
-- This table stores all withdrawal requests from users

CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Amount details
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  
  -- Payment method details
  method VARCHAR(50) NOT NULL, -- 'crypto', 'bank', 'debit_card', 'skrill', 'neteller'
  payment_method VARCHAR(100), -- e.g., 'USDT-TRC20', 'Bank Transfer'
  
  -- Bank details (for bank transfers)
  bank_name VARCHAR(255),
  account_name VARCHAR(255),
  account_number VARCHAR(100),
  ifsc_swift_code VARCHAR(50),
  account_type VARCHAR(50),
  bank_details TEXT,
  
  -- Crypto details
  crypto_address VARCHAR(255),
  wallet_address VARCHAR(255),
  pm_currency VARCHAR(20), -- e.g., 'USDT', 'BTC'
  pm_network VARCHAR(50), -- e.g., 'TRC20', 'ERC20'
  pm_address VARCHAR(255),
  
  -- MT5 account details
  mt5_account_id VARCHAR(50),
  
  -- Status and tracking
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'processing', 'completed'
  external_transaction_id VARCHAR(255), -- Blockchain hash or bank reference
  
  -- Admin actions
  approved_by INTEGER REFERENCES admin(id),
  approved_at TIMESTAMP,
  rejected_by INTEGER REFERENCES admin(id),
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT positive_amount CHECK (amount > 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_mt5_account ON withdrawals(mt5_account_id);

-- Comments for documentation
COMMENT ON TABLE withdrawals IS 'Stores all withdrawal requests from users';
COMMENT ON COLUMN withdrawals.status IS 'pending, approved, rejected, processing, completed';
COMMENT ON COLUMN withdrawals.method IS 'crypto, bank, debit_card, skrill, neteller';
COMMENT ON COLUMN withdrawals.external_transaction_id IS 'Blockchain hash or bank reference number';
