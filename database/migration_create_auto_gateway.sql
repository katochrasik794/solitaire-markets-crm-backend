-- Migration: Create auto_gateway table for automatic payment gateways (like Cregis)
-- This table stores API-based payment gateway configurations

CREATE TABLE IF NOT EXISTS auto_gateway (
    id SERIAL PRIMARY KEY,
    wallet_name VARCHAR(255) NOT NULL,
    gateway_type VARCHAR(50) NOT NULL CHECK (gateway_type IN ('Cryptocurrency', 'Fiat', 'Other')),
    deposit_wallet_address TEXT,
    api_key VARCHAR(500),
    secret_key VARCHAR(500),
    project_id VARCHAR(255), -- For Cregis: Project ID
    gateway_url VARCHAR(500), -- For Cregis: Gateway URL
    webhook_secret VARCHAR(500), -- For Cregis: Webhook secret
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_auto_gateway_type ON auto_gateway(gateway_type);
CREATE INDEX IF NOT EXISTS idx_auto_gateway_active ON auto_gateway(is_active);
CREATE INDEX IF NOT EXISTS idx_auto_gateway_display_order ON auto_gateway(display_order);

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_auto_gateway_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_auto_gateway_updated_at 
    BEFORE UPDATE ON auto_gateway
    FOR EACH ROW 
    EXECUTE FUNCTION update_auto_gateway_updated_at();

-- Add comments
COMMENT ON TABLE auto_gateway IS 'Stores automatic payment gateway configurations (API-based gateways like Cregis)';
COMMENT ON COLUMN auto_gateway.wallet_name IS 'Display name for the gateway (e.g., USDT TRC20, Bitcoin Wallet)';
COMMENT ON COLUMN auto_gateway.gateway_type IS 'Type of gateway: Cryptocurrency, Fiat, or Other';
COMMENT ON COLUMN auto_gateway.project_id IS 'Project ID for gateways like Cregis';
COMMENT ON COLUMN auto_gateway.gateway_url IS 'Base URL for the gateway API';
COMMENT ON COLUMN auto_gateway.webhook_secret IS 'Secret key for webhook verification';

