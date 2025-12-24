-- Add feature_permissions column to admin table
-- This stores granular permissions (view, add, edit, delete) for each feature
-- Structure: { "feature_path": { "view": true, "add": false, "edit": false, "delete": false }, ... }

ALTER TABLE admin 
ADD COLUMN IF NOT EXISTS feature_permissions JSONB DEFAULT '{}'::jsonb;

-- Create index for faster queries on feature_permissions
CREATE INDEX IF NOT EXISTS idx_admin_feature_permissions ON admin USING GIN (feature_permissions);

-- Add comment
COMMENT ON COLUMN admin.feature_permissions IS 'Granular permissions for each feature. Format: { "feature_path": { "view": boolean, "add": boolean, "edit": boolean, "delete": boolean }, ... }. All permissions default to false.';

