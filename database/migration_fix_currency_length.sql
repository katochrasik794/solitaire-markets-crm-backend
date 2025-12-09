-- Migration: Fix currency column length to support longer currency codes like USDT
-- This migration updates the currency column in deposit_requests and cregis_transactions tables

-- Fix deposit_requests.currency column
ALTER TABLE deposit_requests 
ALTER COLUMN currency TYPE VARCHAR(10);

-- Fix cregis_transactions.currency column
ALTER TABLE cregis_transactions 
ALTER COLUMN currency TYPE VARCHAR(10);

-- Add comment
COMMENT ON COLUMN deposit_requests.currency IS 'Currency code (USD, EUR, USDT, etc.) - supports up to 10 characters';
COMMENT ON COLUMN cregis_transactions.currency IS 'Currency code (USD, EUR, USDT, etc.) - supports up to 10 characters';

