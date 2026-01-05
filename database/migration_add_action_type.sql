-- Migration: Add action_type column to email_templates table
-- This allows admins to assign templates to specific CRM actions

-- Add action_type column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'email_templates' 
        AND column_name = 'action_type'
    ) THEN
        ALTER TABLE email_templates ADD COLUMN action_type VARCHAR(100);
        CREATE INDEX IF NOT EXISTS idx_email_templates_action_type ON email_templates(action_type);
        COMMENT ON COLUMN email_templates.action_type IS 'CRM action that triggers this template (e.g., account_creation, deposit_request, ticket_created)';
    END IF;
END $$;






