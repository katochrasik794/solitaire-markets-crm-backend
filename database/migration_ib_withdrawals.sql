CREATE TABLE IF NOT EXISTS ib_withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount NUMERIC(15, 2) NOT NULL,
    payment_method VARCHAR(50),
    payment_detail_id INTEGER REFERENCES payment_details(id),
    status VARCHAR(20) DEFAULT 'pending',
    admin_id INTEGER REFERENCES users(id),
    rejection_reason TEXT,
    is_auto_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ib_withdrawals_user_id ON ib_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_ib_withdrawals_status ON ib_withdrawals(status);
