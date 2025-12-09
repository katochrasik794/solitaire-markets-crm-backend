-- Migration: Add Sumsub KYC Integration Fields
-- This migration adds Sumsub-specific columns to the kyc_verifications table

-- Add Sumsub-specific columns to kyc_verifications table
ALTER TABLE kyc_verifications
ADD COLUMN IF NOT EXISTS sumsub_applicant_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS sumsub_inspection_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS sumsub_verification_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS sumsub_verification_result JSONB,
ADD COLUMN IF NOT EXISTS sumsub_webhook_received_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS sumsub_review_result VARCHAR(50),
ADD COLUMN IF NOT EXISTS sumsub_review_comment TEXT,
ADD COLUMN IF NOT EXISTS sumsub_level_name VARCHAR(100);

-- Add comments explaining each field
COMMENT ON COLUMN kyc_verifications.sumsub_applicant_id IS 'Unique Sumsub applicant identifier';
COMMENT ON COLUMN kyc_verifications.sumsub_inspection_id IS 'Sumsub verification inspection ID';
COMMENT ON COLUMN kyc_verifications.sumsub_verification_status IS 'Status from Sumsub API (init, pending, completed, etc.)';
COMMENT ON COLUMN kyc_verifications.sumsub_verification_result IS 'Full verification response data from Sumsub';
COMMENT ON COLUMN kyc_verifications.sumsub_webhook_received_at IS 'Timestamp when webhook was received from Sumsub';
COMMENT ON COLUMN kyc_verifications.sumsub_review_result IS 'Review result from Sumsub (approved/rejected)';
COMMENT ON COLUMN kyc_verifications.sumsub_review_comment IS 'Review comments from Sumsub';
COMMENT ON COLUMN kyc_verifications.sumsub_level_name IS 'Verification level name used in Sumsub';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_kyc_sumsub_applicant_id ON kyc_verifications(sumsub_applicant_id);
CREATE INDEX IF NOT EXISTS idx_kyc_sumsub_status ON kyc_verifications(sumsub_verification_status);





