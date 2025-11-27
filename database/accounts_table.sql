-- Trading Accounts Table
CREATE TABLE IF NOT EXISTS trading_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Account Details
    account_number VARCHAR(50) UNIQUE NOT NULL,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('MT4', 'MT5')),
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('standard', 'premier')),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Account Settings
    is_swap_free BOOLEAN DEFAULT FALSE,
    is_copy_account BOOLEAN DEFAULT FALSE,
    leverage INTEGER DEFAULT 2000, -- Changed from VARCHAR to INTEGER
    
    -- MetaAPI Fields
    name VARCHAR(255), -- Account name
    group VARCHAR(255), -- MT5 group name from API
    master_password VARCHAR(255), -- Master password (encrypted)
    password VARCHAR(255), -- Main password (encrypted)
    email VARCHAR(255), -- User email
    country VARCHAR(100), -- User country
    city VARCHAR(100), -- User city
    phone VARCHAR(50), -- User phone (combined phone_code + phone_number)
    comment TEXT, -- Reason for account
    api_account_number VARCHAR(50), -- Account number returned from MetaAPI
    investor_password VARCHAR(255), -- Investor password from API response (encrypted)
    
    -- Additional Info (legacy field, kept for backward compatibility)
    reason_for_account TEXT,
    
    -- Account Status
    account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'inactive', 'suspended')),
    is_demo BOOLEAN DEFAULT FALSE,
    
    -- Trading Server
    trading_server VARCHAR(100) DEFAULT 'Solitaire Markets-Live',
    
    -- MT5 Group Reference
    mt5_group_id INTEGER REFERENCES mt5_groups(id) ON DELETE SET NULL,
    mt5_group_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON trading_accounts(user_id);

-- Create index on account_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON trading_accounts(account_number);

-- Create index on account_status
CREATE INDEX IF NOT EXISTS idx_accounts_status ON trading_accounts(account_status);

-- Create index on api_account_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_api_account_number ON trading_accounts(api_account_number);

-- Create index on group for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_group ON trading_accounts("group");

-- Trigger to automatically update updated_at
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON trading_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique account number
CREATE OR REPLACE FUNCTION generate_account_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    new_account_number VARCHAR(50);
    exists_check INTEGER;
BEGIN
    LOOP
        -- Generate 10-digit account number
        new_account_number := LPAD(FLOOR(RANDOM() * 10000000000)::TEXT, 10, '0');
        
        -- Check if it already exists
        SELECT COUNT(*) INTO exists_check
        FROM trading_accounts
        WHERE account_number = new_account_number;
        
        -- Exit loop if unique
        EXIT WHEN exists_check = 0;
    END LOOP;
    
    RETURN new_account_number;
END;
$$ LANGUAGE plpgsql;

