-- Unified Actions Table
-- Simple list of all email-triggering actions in the system
-- Each row represents one type of email that can be sent

CREATE TABLE IF NOT EXISTS unified_actions (
    id SERIAL PRIMARY KEY,
    
    -- Action name (human-readable description of the email action)
    action_name VARCHAR(255) NOT NULL UNIQUE, -- e.g., 'Welcome Email - Create Account', 'Forgot Password Email - on Forgot Password'
    
    -- System type where this action occurs
    system_type VARCHAR(50) NOT NULL, -- 'crm_admin', 'crm_user', 'ib_client', 'ib_admin'
    
    -- Email template assignment
    template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL, -- Assigned email template
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_unified_actions_system_type ON unified_actions(system_type);
CREATE INDEX IF NOT EXISTS idx_unified_actions_action_name ON unified_actions(action_name);
CREATE INDEX IF NOT EXISTS idx_unified_actions_system_action ON unified_actions(system_type, action_name);
CREATE INDEX IF NOT EXISTS idx_unified_actions_template_id ON unified_actions(template_id);

-- Trigger to automatically update updated_at
CREATE TRIGGER update_unified_actions_updated_at BEFORE UPDATE ON unified_actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comment on table
COMMENT ON TABLE unified_actions IS 'List of all email-triggering actions in the system. Each action can be assigned to an email template.';






