-- Add token_hash column to admin_login_log table to track current sessions
ALTER TABLE admin_login_log
ADD COLUMN IF NOT EXISTS token_hash VARCHAR(255);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_login_log_token_hash ON admin_login_log(token_hash);

