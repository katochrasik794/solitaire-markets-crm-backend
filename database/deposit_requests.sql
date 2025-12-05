
-- Deposit Requests Table
CREATE TABLE IF NOT EXISTS deposit_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gateway_id INTEGER NOT NULL REFERENCES manual_payment_gateways(id) ON DELETE CASCADE,
    amount DECIMAL(18, 8) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    converted_amount DECIMAL(18, 8),
    converted_currency VARCHAR(3),
    transaction_id VARCHAR(255),
    transaction_hash VARCHAR(255),
    proof_path VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_id ON deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_gateway_id ON deposit_requests(gateway_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_status ON deposit_requests(status);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_created_at ON deposit_requests(created_at);

-- Trigger for updated_at
CREATE TRIGGER update_deposit_requests_updated_at 
    BEFORE UPDATE ON deposit_requests
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

