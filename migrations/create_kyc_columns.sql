-- Add KYC columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS sumsub_applicant_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_profile JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'unverified';
