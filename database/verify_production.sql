-- Quick verification script for production database
-- Run these queries in your Render.com PostgreSQL database to verify tables exist

-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'trading_accounts', 'mt5_groups', 'countries', 'kyc_documents')
ORDER BY table_name;

-- Check trading_accounts columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trading_accounts'
ORDER BY ordinal_position;

-- Check mt5_groups columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'mt5_groups'
ORDER BY ordinal_position;

-- Check if mt5_groups has data
SELECT COUNT(*) as total_groups, 
       COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_groups
FROM mt5_groups;

-- Check if trading_accounts table exists and has the mt5_group_name column
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'trading_accounts' 
AND column_name = 'mt5_group_name';


