-- Migration: Add email-specific fields to unified_actions table
-- This migration updates the unified_actions table to focus on email-triggering actions

-- Add email-specific columns if they don't exist
DO $$ 
BEGIN
    -- Add recipient_email if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'unified_actions' AND column_name = 'recipient_email') THEN
        ALTER TABLE unified_actions ADD COLUMN recipient_email VARCHAR(255);
    END IF;

    -- Add recipient_name if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'unified_actions' AND column_name = 'recipient_name') THEN
        ALTER TABLE unified_actions ADD COLUMN recipient_name VARCHAR(255);
    END IF;

    -- Add email_status if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'unified_actions' AND column_name = 'email_status') THEN
        ALTER TABLE unified_actions ADD COLUMN email_status VARCHAR(20) DEFAULT 'pending';
    END IF;

    -- Add email_template if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'unified_actions' AND column_name = 'email_template') THEN
        ALTER TABLE unified_actions ADD COLUMN email_template VARCHAR(100);
    END IF;

    -- Add email_subject if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'unified_actions' AND column_name = 'email_subject') THEN
        ALTER TABLE unified_actions ADD COLUMN email_subject VARCHAR(500);
    END IF;

    -- Add email_sent_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'unified_actions' AND column_name = 'email_sent_at') THEN
        ALTER TABLE unified_actions ADD COLUMN email_sent_at TIMESTAMP;
    END IF;

    -- Add email_error if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'unified_actions' AND column_name = 'email_error') THEN
        ALTER TABLE unified_actions ADD COLUMN email_error TEXT;
    END IF;

    -- Add email_message_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'unified_actions' AND column_name = 'email_message_id') THEN
        ALTER TABLE unified_actions ADD COLUMN email_message_id VARCHAR(255);
    END IF;
END $$;

-- Create indexes for email fields if they don't exist
CREATE INDEX IF NOT EXISTS idx_unified_actions_recipient_email ON unified_actions(recipient_email);
CREATE INDEX IF NOT EXISTS idx_unified_actions_email_status ON unified_actions(email_status);
CREATE INDEX IF NOT EXISTS idx_unified_actions_email_template ON unified_actions(email_template);
CREATE INDEX IF NOT EXISTS idx_unified_actions_email_sent_at ON unified_actions(email_sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_actions_action_email_status ON unified_actions(action_type, email_status);

-- Update table comment
COMMENT ON TABLE unified_actions IS 'Unified table storing all tasks/actions that require emails to be sent. Tracks email-triggering events across the system with email delivery status.';

