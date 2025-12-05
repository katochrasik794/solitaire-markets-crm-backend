-- Add wallet_number column to deposit_requests table
-- This allows storing the wallet number (e.g., "W-8-853522") directly in deposit_requests
-- instead of only storing the wallet_id primary key

ALTER TABLE deposit_requests 
ADD COLUMN IF NOT EXISTS wallet_number VARCHAR(50);

-- Create index for wallet_number for faster queries
CREATE INDEX IF NOT EXISTS idx_deposit_requests_wallet_number ON deposit_requests(wallet_number);

-- Optional: Add comment to the column
COMMENT ON COLUMN deposit_requests.wallet_number IS 'Wallet number (e.g., W-8-853522) stored directly from wallets table';
