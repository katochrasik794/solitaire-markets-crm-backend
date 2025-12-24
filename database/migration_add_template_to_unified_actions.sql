-- Migration: Add template_id to unified_actions table
-- This links email templates to actions

-- Add template_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'unified_actions' AND column_name = 'template_id') THEN
        ALTER TABLE unified_actions ADD COLUMN template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for template_id
CREATE INDEX IF NOT EXISTS idx_unified_actions_template_id ON unified_actions(template_id);

-- Update table comment
COMMENT ON TABLE unified_actions IS 'List of all email-triggering actions in the system. Each action can be assigned to an email template.';

