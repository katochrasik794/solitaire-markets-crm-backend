-- Migration: Add 'cancelled' status to deposit_requests table
-- This allows deposits to be marked as cancelled when they expire

-- First, drop the existing check constraint
ALTER TABLE deposit_requests 
DROP CONSTRAINT IF EXISTS deposit_requests_status_check;

-- Add the new check constraint with 'cancelled' included
ALTER TABLE deposit_requests 
ADD CONSTRAINT deposit_requests_status_check 
CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- Update any existing deposits that should be cancelled (older than 60 minutes and pending with cregis_order_id)
UPDATE deposit_requests 
SET status = 'cancelled', 
    cregis_status = 'expired',
    updated_at = NOW()
WHERE status = 'pending' 
  AND cregis_order_id IS NOT NULL
  AND created_at < NOW() - INTERVAL '60 minutes';

