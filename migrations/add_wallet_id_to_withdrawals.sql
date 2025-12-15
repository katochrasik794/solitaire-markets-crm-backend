-- Add wallet_id column to withdrawals table
ALTER TABLE withdrawals 
ADD COLUMN IF NOT EXISTS wallet_id INTEGER REFERENCES wallets(id) ON DELETE SET NULL;

-- Create index for wallet_id
CREATE INDEX IF NOT EXISTS idx_withdrawals_wallet_id ON withdrawals(wallet_id);

