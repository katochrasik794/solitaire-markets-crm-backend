-- Admin Logs Table
-- Tracks all actions performed by admins with full details

CREATE TABLE IF NOT EXISTS logs_of_admin (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admin(id) ON DELETE SET NULL,
    admin_email VARCHAR(255),
    action_type VARCHAR(100) NOT NULL, -- e.g., 'user_create', 'user_update', 'deposit_approve', 'withdrawal_reject'
    action_category VARCHAR(50) NOT NULL, -- e.g., 'user_management', 'deposit_management', 'mt5_management', 'reports'
    target_type VARCHAR(50), -- e.g., 'user', 'deposit', 'withdrawal', 'mt5_account'
    target_id INTEGER, -- ID of the affected record
    target_identifier VARCHAR(255), -- Email, account number, etc.
    description TEXT NOT NULL, -- Human-readable description
    request_method VARCHAR(10), -- GET, POST, PUT, PATCH, DELETE
    request_path VARCHAR(500),
    request_body JSONB, -- Full request body
    response_status INTEGER, -- HTTP status code
    response_body JSONB, -- Full response body
    before_data JSONB, -- State before change
    after_data JSONB, -- State after change
    ip_address VARCHAR(45),
    user_agent TEXT,
    session_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_logs_admin_admin_id ON logs_of_admin(admin_id);
CREATE INDEX IF NOT EXISTS idx_logs_admin_action_type ON logs_of_admin(action_type);
CREATE INDEX IF NOT EXISTS idx_logs_admin_action_category ON logs_of_admin(action_category);
CREATE INDEX IF NOT EXISTS idx_logs_admin_target_type ON logs_of_admin(target_type);
CREATE INDEX IF NOT EXISTS idx_logs_admin_target_id ON logs_of_admin(target_id);
CREATE INDEX IF NOT EXISTS idx_logs_admin_created_at ON logs_of_admin(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_admin_admin_email ON logs_of_admin(admin_email);

-- Trigger to automatically update updated_at
CREATE TRIGGER update_logs_admin_updated_at BEFORE UPDATE ON logs_of_admin
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

