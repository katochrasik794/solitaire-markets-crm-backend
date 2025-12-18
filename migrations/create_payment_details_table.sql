-- Payment Details Table
-- Stores user payment methods (Bank Transfer, USDT TRC20, etc.) in JSON format
CREATE TABLE IF NOT EXISTS payment_details (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Payment method type
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('bank_transfer', 'usdt_trc20')),
    
    -- All payment details stored in JSON format
    payment_details JSONB NOT NULL,
    
    -- Status: pending (awaiting admin approval), approved, rejected
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    
    -- Admin review
    reviewed_by INTEGER REFERENCES admin(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_details_user_id ON payment_details(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_details_status ON payment_details(status);
CREATE INDEX IF NOT EXISTS idx_payment_details_method ON payment_details(payment_method);

-- Create trigger to update updated_at
CREATE TRIGGER update_payment_details_updated_at BEFORE UPDATE ON payment_details
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: Maximum 3 payment details per user is enforced at application level
-- Users can have multiple payment methods of the same type (e.g., multiple bank accounts)


