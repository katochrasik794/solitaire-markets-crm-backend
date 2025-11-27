-- Migration: Add MetaAPI fields to trading_accounts table and city to users table
-- Run this migration to update existing database

-- Add city field to users table (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'city'
    ) THEN
        ALTER TABLE users ADD COLUMN city VARCHAR(100);
    END IF;
END $$;

-- Add new MetaAPI fields to trading_accounts table
DO $$ 
BEGIN
    -- Add name field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'name'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN name VARCHAR(255);
    END IF;

    -- Add group field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'group'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN "group" VARCHAR(255);
    END IF;

    -- Change leverage from VARCHAR to INTEGER
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' 
        AND column_name = 'leverage' 
        AND data_type = 'character varying'
    ) THEN
        -- Convert existing leverage values (e.g., '1:2000' -> 2000)
        ALTER TABLE trading_accounts 
        ALTER COLUMN leverage TYPE INTEGER 
        USING CASE 
            WHEN leverage LIKE '1:%' THEN 
                CAST(SUBSTRING(leverage FROM 3) AS INTEGER)
            ELSE 
                2000
        END;
    END IF;

    -- Add master_password field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'master_password'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN master_password VARCHAR(255);
    END IF;

    -- Add password field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'password'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN password VARCHAR(255);
    END IF;

    -- Add email field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'email'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN email VARCHAR(255);
    END IF;

    -- Add country field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'country'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN country VARCHAR(100);
    END IF;

    -- Add city field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'city'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN city VARCHAR(100);
    END IF;

    -- Add phone field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'phone'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN phone VARCHAR(50);
    END IF;

    -- Add comment field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'comment'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN comment TEXT;
    END IF;

    -- Add api_account_number field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'api_account_number'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN api_account_number VARCHAR(50);
    END IF;

    -- Add investor_password field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_accounts' AND column_name = 'investor_password'
    ) THEN
        ALTER TABLE trading_accounts ADD COLUMN investor_password VARCHAR(255);
    END IF;
END $$;

-- Create index on api_account_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_api_account_number ON trading_accounts(api_account_number);

-- Create index on group for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_group ON trading_accounts("group");


