-- Admin roles and permissions

CREATE TABLE IF NOT EXISTS admin_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,           -- e.g. 'admin', 'support'
  description TEXT,
  -- JSON permissions structure, currently: { "features": ["path1","path2", ...] }
  permissions JSONB NOT NULL DEFAULT '{"features": []}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,    -- true for protected roles like superadmin
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_roles_name ON admin_roles(name);

-- Map admin accounts to roles (admin table already stores admin users)
CREATE TABLE IF NOT EXISTS admin_role_assignments (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_role_assignments_admin_id
  ON admin_role_assignments(admin_id);

CREATE INDEX IF NOT EXISTS idx_admin_role_assignments_role_id
  ON admin_role_assignments(role_id);

-- Trigger to maintain updated_at on admin_roles
CREATE OR REPLACE FUNCTION update_admin_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_admin_roles_updated_at
BEFORE UPDATE ON admin_roles
FOR EACH ROW
EXECUTE FUNCTION update_admin_roles_updated_at();


