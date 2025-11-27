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

-- Create unique constraint - one active verification per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_user_active ON kyc_verifications(user_id) 
WHERE status = 'pending';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_kyc_updated_at BEFORE UPDATE ON kyc_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

