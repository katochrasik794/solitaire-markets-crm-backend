-- Create database (run this manually if database doesn't exist)
-- CREATE DATABASE solitaire;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone_code VARCHAR(10),
    phone_number VARCHAR(20),
    country VARCHAR(100),
    city VARCHAR(100),
    referral_code VARCHAR(20) UNIQUE,
    referred_by VARCHAR(20),
    is_email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create index on referral_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- Create index on referred_by for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- Function to generate random referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR(20) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..10 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to ensure unique referral code
CREATE OR REPLACE FUNCTION get_unique_referral_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_code VARCHAR(20);
    code_exists BOOLEAN;
BEGIN
    LOOP
        new_code := generate_referral_code();
        SELECT EXISTS(SELECT 1 FROM users WHERE referral_code = new_code) INTO code_exists;
        EXIT WHEN NOT code_exists;
    END LOOP;
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-generate referral code on user creation
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
        NEW.referral_code := get_unique_referral_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate referral code
CREATE TRIGGER trigger_set_referral_code
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_referral_code();

-- Create index on token for faster lookups
CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);

-- Create index on user_id for password reset tokens
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Countries table
CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2) NOT NULL UNIQUE,
    phone_code VARCHAR(10) NOT NULL,
    is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on country_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_countries_country_code ON countries(country_code);

-- Create index on is_active for filtering active countries
CREATE INDEX IF NOT EXISTS idx_countries_is_active ON countries(is_active);

-- Trigger to automatically update updated_at for countries
CREATE TRIGGER update_countries_updated_at BEFORE UPDATE ON countries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- KYC (Know Your Customer) Verification Table
CREATE TABLE IF NOT EXISTS kyc_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Trading Experience
    has_trading_experience BOOLEAN,
    
    -- Employment and Financial Background
    employment_status VARCHAR(50),
    annual_income VARCHAR(50),
    total_net_worth VARCHAR(50),
    source_of_wealth VARCHAR(100),
    
    -- Document Information
    document_type VARCHAR(50), -- 'passport', 'drivers_license', 'identity_card'
    document_front_path VARCHAR(500), -- File path/URL for front of document
    document_back_path VARCHAR(500), -- File path/URL for back of document (if applicable)
    
    -- Verification Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT, -- Reason if rejected
    
    -- Sumsub Integration Fields
    sumsub_applicant_id VARCHAR(255), -- Unique Sumsub applicant identifier
    sumsub_inspection_id VARCHAR(255), -- Sumsub verification inspection ID
    sumsub_verification_status VARCHAR(50), -- Status from Sumsub API (init, pending, completed, etc.)
    sumsub_verification_result JSONB, -- Full verification response data from Sumsub
    sumsub_webhook_received_at TIMESTAMP, -- Timestamp when webhook was received from Sumsub
    sumsub_review_result VARCHAR(50), -- Review result from Sumsub (approved/rejected)
    sumsub_review_comment TEXT, -- Review comments from Sumsub
    sumsub_level_name VARCHAR(100), -- Verification level name used in Sumsub
    
    -- Timestamps
    submitted_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_verifications(user_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_verifications(status);

-- Create indexes for Sumsub fields
CREATE INDEX IF NOT EXISTS idx_kyc_sumsub_applicant_id ON kyc_verifications(sumsub_applicant_id);
CREATE INDEX IF NOT EXISTS idx_kyc_sumsub_status ON kyc_verifications(sumsub_verification_status);

-- Create unique constraint - one active verification per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_user_active ON kyc_verifications(user_id) 
WHERE status = 'pending';

-- Trigger to automatically update updated_at for KYC
CREATE TRIGGER update_kyc_updated_at BEFORE UPDATE ON kyc_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- MT5 Server Groups Table (must be created before trading_accounts)
CREATE TABLE IF NOT EXISTS mt5_groups (
    id SERIAL PRIMARY KEY,
    group_name VARCHAR(255) NOT NULL UNIQUE,
    dedicated_name VARCHAR(255), -- Admin-defined friendly name for the group
    server INTEGER DEFAULT 1,
    permissions_flags INTEGER DEFAULT 0,
    auth_mode INTEGER DEFAULT 0,
    auth_password_min INTEGER DEFAULT 8,
    company VARCHAR(255),
    company_page VARCHAR(255),
    company_email VARCHAR(255),
    company_support_page VARCHAR(500),
    company_support_email VARCHAR(255),
    company_catalog VARCHAR(255),
    currency VARCHAR(10) DEFAULT 'USD',
    currency_digits INTEGER DEFAULT 2,
    reports_mode INTEGER DEFAULT 0,
    reports_flags INTEGER DEFAULT 0,
    reports_smtp VARCHAR(255),
    reports_smtp_login VARCHAR(255),
    news_mode INTEGER DEFAULT 2,
    news_category VARCHAR(255),
    mail_mode INTEGER DEFAULT 1,
    trade_flags INTEGER DEFAULT 0,
    trade_interestrate DECIMAL(10, 2) DEFAULT 0,
    trade_virtual_credit DECIMAL(10, 2) DEFAULT 0,
    margin_free_mode INTEGER DEFAULT 1,
    margin_so_mode INTEGER DEFAULT 0,
    margin_call DECIMAL(5, 2) DEFAULT 100,
    margin_stop_out DECIMAL(5, 2) DEFAULT 30,
    demo_leverage INTEGER DEFAULT 0,
    demo_deposit DECIMAL(10, 2) DEFAULT 0,
    limit_history INTEGER DEFAULT 0,
    limit_orders INTEGER DEFAULT 0,
    limit_symbols INTEGER DEFAULT 0,
    limit_positions INTEGER DEFAULT 0,
    margin_mode INTEGER DEFAULT 0,
    margin_flags INTEGER DEFAULT 0,
    trade_transfer_mode INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on group_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_mt5_groups_name ON mt5_groups(group_name);

-- Create index on currency for filtering
CREATE INDEX IF NOT EXISTS idx_mt5_groups_currency ON mt5_groups(currency);

-- Create index on is_active for filtering
CREATE INDEX IF NOT EXISTS idx_mt5_groups_active ON mt5_groups(is_active);

-- Trigger to automatically update updated_at for mt5_groups
CREATE TRIGGER update_mt5_groups_updated_at BEFORE UPDATE ON mt5_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- Trigger to automatically update updated_at for accounts
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

