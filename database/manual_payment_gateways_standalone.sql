-- ============================================
-- Manual Payment Gateways Table
-- Standalone SQL - Run this directly in your database
-- ============================================

-- Create the table
CREATE TABLE IF NOT EXISTS manual_payment_gateways (
    id SERIAL PRIMARY KEY,
    
    -- Gateway Type
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'UPI',
        'USDT_TRC20',
        'USDT_ERC20',
        'USDT_BEP20',
        'Bank_Transfer',
        'Bitcoin',
        'Ethereum',
        'Other_Crypto',
        'Debit_Card',
        'Other'
    )),
    
    -- Gateway Name/Label
    name VARCHAR(255) NOT NULL,
    
    -- Type-specific data (JSONB for flexibility)
    -- UPI: {"vpa": "username@bank"}
    -- USDT: {"address": "Txxxxxxxxxxxxx", "network": "TRC20"}
    -- Bank: {"account_number": "xxx", "ifsc": "xxx", "bank_name": "xxx", "account_holder": "xxx"}
    type_data JSONB DEFAULT '{}'::jsonb,
    
    -- Icon file path/URL
    icon_path VARCHAR(500),
    
    -- QR Code file path/URL
    qr_code_path VARCHAR(500),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Display order
    display_order INTEGER DEFAULT 0,
    
    -- Instructions for users
    instructions TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_manual_gateways_type ON manual_payment_gateways(type);
CREATE INDEX IF NOT EXISTS idx_manual_gateways_active ON manual_payment_gateways(is_active);
CREATE INDEX IF NOT EXISTS idx_manual_gateways_display_order ON manual_payment_gateways(display_order);

-- Unique constraint on name
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_gateways_name_unique ON manual_payment_gateways(LOWER(name));

-- Ensure update_updated_at_column function exists (if not already created)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_manual_gateways_updated_at ON manual_payment_gateways;
CREATE TRIGGER update_manual_gateways_updated_at 
    BEFORE UPDATE ON manual_payment_gateways
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

