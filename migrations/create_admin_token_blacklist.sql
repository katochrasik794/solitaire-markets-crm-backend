-- Create admin token blacklist table for managing logout sessions
CREATE TABLE IF NOT EXISTS admin_token_blacklist (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL, -- SHA256 hash of the JWT token
  token_jti VARCHAR(255), -- JWT ID if available
  ip_address VARCHAR(45),
  user_agent TEXT,
  logout_type VARCHAR(20) NOT NULL CHECK (logout_type IN ('device', 'all')), -- 'device' for single device, 'all' for all devices
  expires_at TIMESTAMPTZ NOT NULL, -- Token expiration time
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_admin_token_blacklist_admin_id ON admin_token_blacklist(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_token_blacklist_token_hash ON admin_token_blacklist(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_token_blacklist_expires_at ON admin_token_blacklist(expires_at);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_admin_token_blacklist_admin_logout_type ON admin_token_blacklist(admin_id, logout_type);

