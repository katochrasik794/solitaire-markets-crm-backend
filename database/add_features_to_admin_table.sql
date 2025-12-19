-- Add features column to admin table
-- This allows storing features directly in the admin table as JSON

ALTER TABLE admin 
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;

-- Create index for faster queries on features
CREATE INDEX IF NOT EXISTS idx_admin_features ON admin USING GIN (features);

-- Add comment
COMMENT ON COLUMN admin.features IS 'Array of feature paths that this admin can access. Stored as JSON array.';

