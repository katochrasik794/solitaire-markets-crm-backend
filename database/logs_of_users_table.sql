-- User Logs Table
-- Tracks all actions performed by users with full details

CREATE TABLE IF NOT EXISTS logs_of_users (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    action_type VARCHAR(100) NOT NULL, -- e.g., 'deposit_request', 'withdrawal_request', 'mt5_account_create', 'report_view'
    action_category VARCHAR(50) NOT NULL, -- e.g., 'deposit', 'withdrawal', 'mt5', 'reports', 'wallet'
    target_type VARCHAR(50), -- e.g., 'deposit', 'withdrawal', 'mt5_account', 'wallet'
    target_id INTEGER, -- ID of the affected record
    target_identifier VARCHAR(255), -- Account number, transaction ID, etc.
    description TEXT NOT NULL,
    request_method VARCHAR(10),
    request_path VARCHAR(500),
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    before_data JSONB,
    after_data JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    session_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_logs_users_user_id ON logs_of_users(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_users_action_type ON logs_of_users(action_type);
CREATE INDEX IF NOT EXISTS idx_logs_users_action_category ON logs_of_users(action_category);
CREATE INDEX IF NOT EXISTS idx_logs_users_target_type ON logs_of_users(target_type);
CREATE INDEX IF NOT EXISTS idx_logs_users_target_id ON logs_of_users(target_id);
CREATE INDEX IF NOT EXISTS idx_logs_users_created_at ON logs_of_users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_users_user_email ON logs_of_users(user_email);

-- Trigger to automatically update updated_at
CREATE TRIGGER update_logs_users_updated_at BEFORE UPDATE ON logs_of_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

