-- Add deposit and withdrawal limit columns to mt5_groups table
-- These limits will be enforced per group for all accounts in that group

-- Add minimum_deposit column
ALTER TABLE mt5_groups 
ADD COLUMN IF NOT EXISTS minimum_deposit DECIMAL(15,2) DEFAULT 0 NOT NULL;

-- Add maximum_deposit column (NULL means no maximum limit)
ALTER TABLE mt5_groups 
ADD COLUMN IF NOT EXISTS maximum_deposit DECIMAL(15,2) DEFAULT NULL;

-- Add minimum_withdrawal column
ALTER TABLE mt5_groups 
ADD COLUMN IF NOT EXISTS minimum_withdrawal DECIMAL(15,2) DEFAULT 0 NOT NULL;

-- Add maximum_withdrawal column (NULL means no maximum limit)
ALTER TABLE mt5_groups 
ADD COLUMN IF NOT EXISTS maximum_withdrawal DECIMAL(15,2) DEFAULT NULL;

-- Add CHECK constraints to ensure minimum < maximum (when maximum is not NULL)
ALTER TABLE mt5_groups
ADD CONSTRAINT check_deposit_limits 
CHECK (maximum_deposit IS NULL OR minimum_deposit <= maximum_deposit);

ALTER TABLE mt5_groups
ADD CONSTRAINT check_withdrawal_limits 
CHECK (maximum_withdrawal IS NULL OR minimum_withdrawal <= maximum_withdrawal);

-- Add CHECK constraints to ensure all values are non-negative
ALTER TABLE mt5_groups
ADD CONSTRAINT check_min_deposit_positive 
CHECK (minimum_deposit >= 0);

ALTER TABLE mt5_groups
ADD CONSTRAINT check_max_deposit_positive 
CHECK (maximum_deposit IS NULL OR maximum_deposit >= 0);

ALTER TABLE mt5_groups
ADD CONSTRAINT check_min_withdrawal_positive 
CHECK (minimum_withdrawal >= 0);

ALTER TABLE mt5_groups
ADD CONSTRAINT check_max_withdrawal_positive 
CHECK (maximum_withdrawal IS NULL OR maximum_withdrawal >= 0);

-- Add comments for documentation
COMMENT ON COLUMN mt5_groups.minimum_deposit IS 'Minimum deposit amount allowed for accounts in this group';
COMMENT ON COLUMN mt5_groups.maximum_deposit IS 'Maximum deposit amount allowed for accounts in this group (NULL = no maximum)';
COMMENT ON COLUMN mt5_groups.minimum_withdrawal IS 'Minimum withdrawal amount allowed for accounts in this group';
COMMENT ON COLUMN mt5_groups.maximum_withdrawal IS 'Maximum withdrawal amount allowed for accounts in this group (NULL = no maximum)';

