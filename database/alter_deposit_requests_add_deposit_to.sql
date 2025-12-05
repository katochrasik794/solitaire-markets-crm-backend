-- Alter deposit_requests table to add deposit_to_type and mt5_account_id columns

-- Add deposit_to_type column
ALTER TABLE deposit_requests 
ADD COLUMN IF NOT EXISTS deposit_to_type VARCHAR(20) NOT NULL DEFAULT 'wallet';

-- Add check constraint for deposit_to_type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'deposit_requests_deposit_to_type_check'
    ) THEN
        ALTER TABLE deposit_requests 
        ADD CONSTRAINT deposit_requests_deposit_to_type_check 
        CHECK (deposit_to_type IN ('wallet', 'mt5'));
    END IF;
END $$;

-- Add mt5_account_id column
ALTER TABLE deposit_requests 
ADD COLUMN IF NOT EXISTS mt5_account_id VARCHAR(50);

-- Add wallet_id column
ALTER TABLE deposit_requests 
ADD COLUMN IF NOT EXISTS wallet_id INTEGER REFERENCES wallets(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_deposit_requests_deposit_to_type ON deposit_requests(deposit_to_type);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_mt5_account_id ON deposit_requests(mt5_account_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_wallet_id ON deposit_requests(wallet_id);

