-- Unified Actions Table
-- Stores all actions from CRM Admin, IB Client, and IB Admin systems
-- This table can be populated from existing logs or used for new logging

CREATE TABLE IF NOT EXISTS unified_actions (
    id SERIAL PRIMARY KEY,
    
    -- System identification
    system_type VARCHAR(50) NOT NULL, -- 'crm_admin', 'crm_user', 'ib_client', 'ib_admin'
    
    -- Actor information
    actor_id INTEGER, -- ID of the person who performed the action (admin_id, user_id, ib_id, etc.)
    actor_email VARCHAR(255),
    actor_name VARCHAR(255),
    actor_type VARCHAR(50), -- 'admin', 'user', 'ib_client', 'ib_admin'
    
    -- Action details
    action_type VARCHAR(100) NOT NULL, -- e.g., 'user_create', 'deposit_request', 'ib_apply', etc.
    action_category VARCHAR(50) NOT NULL, -- e.g., 'user_management', 'deposit', 'ib_management'
    action_name VARCHAR(255), -- Human-readable action name
    
    -- Target information
    target_type VARCHAR(50), -- e.g., 'user', 'deposit', 'ib_request', 'client'
    target_id INTEGER, -- ID of the affected record
    target_identifier VARCHAR(255), -- Email, account number, etc.
    
    -- Description and details
    description TEXT NOT NULL,
    details JSONB, -- Additional details as JSON
    
    -- Request/Response information
    request_method VARCHAR(10), -- GET, POST, PUT, PATCH, DELETE
    request_path VARCHAR(500),
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    
    -- State changes
    before_data JSONB,
    after_data JSONB,
    
    -- Technical details
    ip_address VARCHAR(45),
    user_agent TEXT,
    session_id VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_unified_actions_system_type ON unified_actions(system_type);
CREATE INDEX IF NOT EXISTS idx_unified_actions_actor_id ON unified_actions(actor_id);
CREATE INDEX IF NOT EXISTS idx_unified_actions_actor_email ON unified_actions(actor_email);
CREATE INDEX IF NOT EXISTS idx_unified_actions_action_type ON unified_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_unified_actions_action_category ON unified_actions(action_category);
CREATE INDEX IF NOT EXISTS idx_unified_actions_target_type ON unified_actions(target_type);
CREATE INDEX IF NOT EXISTS idx_unified_actions_target_id ON unified_actions(target_id);
CREATE INDEX IF NOT EXISTS idx_unified_actions_created_at ON unified_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_actions_system_actor ON unified_actions(system_type, actor_id);

-- Trigger to automatically update updated_at
CREATE TRIGGER update_unified_actions_updated_at BEFORE UPDATE ON unified_actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comment on table
COMMENT ON TABLE unified_actions IS 'Unified table storing all actions from CRM Admin, CRM User, IB Client, and IB Admin systems';

