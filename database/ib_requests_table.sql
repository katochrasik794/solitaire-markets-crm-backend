-- IB Partnership Requests Table
CREATE TABLE IF NOT EXISTS ib_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Application Details
    ib_experience TEXT, -- Describe your IB experience
    previous_clients_count INTEGER, -- How many IB clients you have with previous partner
    willing_to_become_ib VARCHAR(20) CHECK (willing_to_become_ib IN ('yes', 'no')), -- Are you willing to become an IB with OXO MARKETS?
    willing_to_sign_agreement VARCHAR(20) CHECK (willing_to_sign_agreement IN ('yes', 'no')), -- Are you willing to sign IB Agreement?
    
    -- Status and Review
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT, -- Reason if rejected
    reviewed_by INTEGER REFERENCES admin(id) ON DELETE SET NULL, -- Admin who reviewed the request
    reviewed_at TIMESTAMP, -- When the request was reviewed
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_ib_requests_user_id ON ib_requests(user_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_ib_requests_status ON ib_requests(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_ib_requests_created_at ON ib_requests(created_at DESC);

-- Add column to users table to track IB status (optional, can be derived from ib_requests table)
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ib BOOLEAN DEFAULT FALSE;
-- CREATE INDEX IF NOT EXISTS idx_users_is_ib ON users(is_ib);




