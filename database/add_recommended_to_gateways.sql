-- Add is_recommended column to manual_payment_gateways table
ALTER TABLE manual_payment_gateways 
ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT FALSE;

-- Create index for recommended gateways
CREATE INDEX IF NOT EXISTS idx_manual_gateways_recommended ON manual_payment_gateways(is_recommended);

