-- Alter trading_accounts table to change default trading_server
ALTER TABLE trading_accounts 
ALTER COLUMN trading_server SET DEFAULT 'Solitaire Markets-Live';

-- Update existing records (if any)
UPDATE trading_accounts 
SET trading_server = 'Solitaire Markets-Live' 
WHERE trading_server LIKE '%Equiti%' OR trading_server IS NULL;

