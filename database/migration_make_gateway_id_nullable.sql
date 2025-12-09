-- Migration: Make gateway_id nullable to support Cregis deposits
-- Cregis deposits don't use manual_payment_gateways, so gateway_id should be nullable

ALTER TABLE deposit_requests 
ALTER COLUMN gateway_id DROP NOT NULL;

-- Add comment
COMMENT ON COLUMN deposit_requests.gateway_id IS 'Payment gateway ID (NULL for Cregis deposits)';

