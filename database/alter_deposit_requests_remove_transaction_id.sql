-- Remove transaction_id column from deposit_requests table

ALTER TABLE deposit_requests 
DROP COLUMN IF EXISTS transaction_id;

