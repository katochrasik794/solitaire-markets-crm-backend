-- Migration: Remove is_admin and add referral_code, referred_by columns

-- Step 1: Drop is_admin column
ALTER TABLE users DROP COLUMN IF EXISTS is_admin;

-- Step 2: Add referral_code column (unique, auto-generated)
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;

-- Step 3: Add referred_by column (nullable, stores referral code of referrer)
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(20);

-- Step 4: Create index on referral_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- Step 5: Create index on referred_by for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- Step 6: Function to generate random referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR(20) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..10 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Function to ensure unique referral code
CREATE OR REPLACE FUNCTION get_unique_referral_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_code VARCHAR(20);
    code_exists BOOLEAN;
BEGIN
    LOOP
        new_code := generate_referral_code();
        SELECT EXISTS(SELECT 1 FROM users WHERE referral_code = new_code) INTO code_exists;
        EXIT WHEN NOT code_exists;
    END LOOP;
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Trigger function to auto-generate referral code on user creation
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
        NEW.referral_code := get_unique_referral_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Create trigger to auto-generate referral code
DROP TRIGGER IF EXISTS trigger_set_referral_code ON users;
CREATE TRIGGER trigger_set_referral_code
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_referral_code();

-- Step 10: Update existing users without referral codes (if any)
UPDATE users 
SET referral_code = get_unique_referral_code() 
WHERE referral_code IS NULL OR referral_code = '';

