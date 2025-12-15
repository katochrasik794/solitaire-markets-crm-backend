-- Migration: Add status column to users table
-- This allows tracking if a user is active, banned, or inactive

-- Add status column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'banned', 'inactive'));

-- Create index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Update existing users to have 'active' status if they don't have one
UPDATE users 
SET status = 'active' 
WHERE status IS NULL;

-- Set NOT NULL constraint after updating existing rows
ALTER TABLE users 
ALTER COLUMN status SET NOT NULL;

-- Add comment
COMMENT ON COLUMN users.status IS 'User account status: active, banned, or inactive';

