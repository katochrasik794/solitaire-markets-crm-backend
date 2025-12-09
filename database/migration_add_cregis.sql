-- Migration: Add Cregis Gateway Support
-- This migration adds support for Cregis payment gateway integration

-- Add Cregis-related columns to deposit_requests table
ALTER TABLE deposit_requests 
ADD COLUMN IF NOT EXISTS cregis_order_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS cregis_status VARCHAR(50);

-- Create index for cregis_order_id
CREATE INDEX IF NOT EXISTS idx_deposit_requests_cregis_order_id ON deposit_requests(cregis_order_id);

-- Create cregis_transactions table
CREATE TABLE IF NOT EXISTS cregis_transactions (
    id SERIAL PRIMARY KEY,
    deposit_request_id INTEGER NOT NULL REFERENCES deposit_requests(id) ON DELETE CASCADE,
    cregis_order_id VARCHAR(255) NOT NULL UNIQUE,
    cregis_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    amount DECIMAL(18, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USDT',
    payment_url TEXT,
    qr_code_url TEXT,
    expires_at TIMESTAMP,
    webhook_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for cregis_transactions
CREATE INDEX IF NOT EXISTS idx_cregis_transactions_deposit_request_id ON cregis_transactions(deposit_request_id);
CREATE INDEX IF NOT EXISTS idx_cregis_transactions_cregis_order_id ON cregis_transactions(cregis_order_id);
CREATE INDEX IF NOT EXISTS idx_cregis_transactions_cregis_status ON cregis_transactions(cregis_status);
CREATE INDEX IF NOT EXISTS idx_cregis_transactions_created_at ON cregis_transactions(created_at);

-- Create trigger to automatically update updated_at for cregis_transactions
CREATE OR REPLACE FUNCTION update_cregis_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cregis_transactions_updated_at 
    BEFORE UPDATE ON cregis_transactions
    FOR EACH ROW 
    EXECUTE FUNCTION update_cregis_transactions_updated_at();

-- Add comment to columns
COMMENT ON COLUMN deposit_requests.cregis_order_id IS 'Cregis payment order ID';
COMMENT ON COLUMN deposit_requests.cregis_status IS 'Cregis payment status (pending, paid, expired, failed)';
COMMENT ON TABLE cregis_transactions IS 'Stores Cregis payment gateway transaction data';

