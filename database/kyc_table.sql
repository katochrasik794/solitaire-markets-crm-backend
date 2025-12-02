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
    
    -- Sumsub Integration Fields
    sumsub_applicant_id VARCHAR(255), -- Unique Sumsub applicant identifier
    sumsub_inspection_id VARCHAR(255), -- Sumsub verification inspection ID
    sumsub_verification_status VARCHAR(50), -- Status from Sumsub API (init, pending, completed, etc.)
    sumsub_verification_result JSONB, -- Full verification response data from Sumsub
    sumsub_webhook_received_at TIMESTAMP, -- Timestamp when webhook was received from Sumsub
    sumsub_review_result VARCHAR(50), -- Review result from Sumsub (approved/rejected)
    sumsub_review_comment TEXT, -- Review comments from Sumsub
    sumsub_level_name VARCHAR(100), -- Verification level name used in Sumsub
    
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

-- Create indexes for Sumsub fields
CREATE INDEX IF NOT EXISTS idx_kyc_sumsub_applicant_id ON kyc_verifications(sumsub_applicant_id);
CREATE INDEX IF NOT EXISTS idx_kyc_sumsub_status ON kyc_verifications(sumsub_verification_status);

-- Create unique constraint - one active verification per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_user_active ON kyc_verifications(user_id) 
WHERE status = 'pending';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_kyc_updated_at BEFORE UPDATE ON kyc_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

