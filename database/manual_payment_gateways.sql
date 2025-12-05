-- ============================================
-- Manual Payment Gateways Table
-- ============================================
-- This table stores manual payment gateway configurations
-- for different payment methods like UPI, USDT, Bank Transfer, etc.

CREATE TABLE IF NOT EXISTS manual_payment_gateways (
    id SERIAL PRIMARY KEY,
    
    -- Gateway Type (UPI, USDT_TRC20, USDT_ERC20, USDT_BEP20, Bank Transfer, etc.)
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
    
    -- Gateway Name/Label (e.g., "UPI PAYMENT", "USDT TRC20")
    name VARCHAR(255) NOT NULL,
    
    -- Type-specific data stored as JSONB for flexibility
    -- For UPI: {"vpa": "username@bank"}
    -- For USDT: {"address": "Txxxxxxxxxxxxx", "network": "TRC20"}
    -- For Bank: {"account_number": "xxx", "ifsc": "xxx", "bank_name": "xxx", "account_holder": "xxx"}
    type_data JSONB DEFAULT '{}'::jsonb,
    
    -- Icon file path/URL
    icon_path VARCHAR(500),
    
    -- QR Code file path/URL
    qr_code_path VARCHAR(500),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Display order (for sorting gateways)
    display_order INTEGER DEFAULT 0,
    
    -- Additional notes/instructions for users
    instructions TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_manual_gateways_type ON manual_payment_gateways(type);
CREATE INDEX IF NOT EXISTS idx_manual_gateways_active ON manual_payment_gateways(is_active);
CREATE INDEX IF NOT EXISTS idx_manual_gateways_display_order ON manual_payment_gateways(display_order);

-- Create unique constraint on name to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_gateways_name_unique ON manual_payment_gateways(LOWER(name));

-- Trigger to automatically update updated_at
CREATE TRIGGER update_manual_gateways_updated_at BEFORE UPDATE ON manual_payment_gateways
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Example Inserts (commented out - uncomment to add sample data)
-- ============================================

-- UPI Example
-- INSERT INTO manual_payment_gateways (type, name, type_data, is_active, display_order)
-- VALUES (
--     'UPI',
--     'UPI PAYMENT',
--     '{"vpa": "payments@solitaire"}',
--     TRUE,
--     1
-- );

-- USDT TRC20 Example
-- INSERT INTO manual_payment_gateways (type, name, type_data, is_active, display_order)
-- VALUES (
--     'USDT_TRC20',
--     'USDT TRC20',
--     '{"address": "Txxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "network": "TRC20"}',
--     TRUE,
--     2
-- );

-- Bank Transfer Example
-- INSERT INTO manual_payment_gateways (type, name, type_data, is_active, display_order)
-- VALUES (
--     'Bank_Transfer',
--     'Bank Transfer',
--     '{"account_number": "1234567890", "ifsc": "BANK0001234", "bank_name": "Example Bank", "account_holder": "Solitaire Markets"}',
--     TRUE,
--     3
-- );

