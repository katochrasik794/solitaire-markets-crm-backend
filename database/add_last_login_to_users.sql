-- Migration: Add last_login column to users table
-- This allows tracking when a user last logged in

-- Add last_login column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Create index on last_login for faster queries
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);

-- Add comment
COMMENT ON COLUMN users.last_login IS 'Timestamp of the user''s last successful login';

