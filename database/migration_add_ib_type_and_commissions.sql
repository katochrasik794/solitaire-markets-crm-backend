-- Migration: Add IB Type and Commission fields to ib_requests table
-- This migration adds columns for IB type classification, referrer tracking, and group-wise pip commissions

-- Add ib_type column
ALTER TABLE ib_requests 
ADD COLUMN IF NOT EXISTS ib_type VARCHAR(20) CHECK (ib_type IN ('normal', 'master', 'sub_ib'));

-- Add referrer_ib_id column for Sub-IB referrer tracking
ALTER TABLE ib_requests 
ADD COLUMN IF NOT EXISTS referrer_ib_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Add group_pip_commissions JSONB column to store group-wise pip commission allocations
ALTER TABLE ib_requests 
ADD COLUMN IF NOT EXISTS group_pip_commissions JSONB DEFAULT '{}'::jsonb;

-- Add approved_at timestamp
ALTER TABLE ib_requests 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

-- Create index on ib_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_ib_requests_ib_type ON ib_requests(ib_type);

-- Create index on referrer_ib_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_ib_requests_referrer_ib_id ON ib_requests(referrer_ib_id);

-- Create index on approved_at for sorting
CREATE INDEX IF NOT EXISTS idx_ib_requests_approved_at ON ib_requests(approved_at DESC);

-- Add comment to columns
COMMENT ON COLUMN ib_requests.ib_type IS 'Type of IB: normal (Normal/Master IB), master (Master IB), or sub_ib (Sub-IB referred by another IB)';
COMMENT ON COLUMN ib_requests.referrer_ib_id IS 'User ID of the Master IB who referred this Sub-IB (only for sub_ib type)';
COMMENT ON COLUMN ib_requests.group_pip_commissions IS 'JSON object storing group-wise pip commission allocations: {"group_id": pip_value, ...}';
COMMENT ON COLUMN ib_requests.approved_at IS 'Timestamp when the IB request was approved';


