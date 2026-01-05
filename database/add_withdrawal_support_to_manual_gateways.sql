-- ============================================
-- Add Withdrawal Support to Manual Payment Gateways
-- ============================================
-- This migration adds fields to control which gateways are available for deposits vs withdrawals

-- Add fields to indicate if gateway is enabled for deposits and withdrawals
ALTER TABLE manual_payment_gateways 
ADD COLUMN IF NOT EXISTS is_deposit_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS is_withdrawal_enabled BOOLEAN DEFAULT FALSE;

-- Create indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_manual_gateways_deposit_enabled ON manual_payment_gateways(is_deposit_enabled) WHERE is_deposit_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_manual_gateways_withdrawal_enabled ON manual_payment_gateways(is_withdrawal_enabled) WHERE is_withdrawal_enabled = TRUE;

-- Update existing records: if is_active = TRUE, set is_deposit_enabled = TRUE (maintain backward compatibility)
-- Existing gateways will remain enabled for deposits by default
UPDATE manual_payment_gateways 
SET is_deposit_enabled = COALESCE(is_deposit_enabled, is_active),
    is_withdrawal_enabled = COALESCE(is_withdrawal_enabled, FALSE)
WHERE is_deposit_enabled IS NULL OR is_withdrawal_enabled IS NULL;

-- Add comments
COMMENT ON COLUMN manual_payment_gateways.is_deposit_enabled IS 'Indicates if this gateway is available for deposit transactions';
COMMENT ON COLUMN manual_payment_gateways.is_withdrawal_enabled IS 'Indicates if this gateway is available for withdrawal transactions';




