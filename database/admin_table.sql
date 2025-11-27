-- Admin table for admin panel authentication and management
CREATE TABLE IF NOT EXISTS admin (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    admin_role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Admin login logs table for tracking admin login attempts
CREATE TABLE IF NOT EXISTS admin_login_log (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,  -- IPv6 max length
    user_agent TEXT,
    location VARCHAR(255),
    device VARCHAR(255),
    browser VARCHAR(255),
    os VARCHAR(255),
    success BOOLEAN DEFAULT TRUE,
    failure_reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_admin_email ON admin(email);
CREATE INDEX IF NOT EXISTS idx_admin_username ON admin(username);
CREATE INDEX IF NOT EXISTS idx_admin_role ON admin(admin_role);
CREATE INDEX IF NOT EXISTS idx_admin_is_active ON admin(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_login_log_admin_id ON admin_login_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_login_log_created_at ON admin_login_log(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_admin_updated_at
    BEFORE UPDATE ON admin
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_updated_at();

-- Country admins table for country-specific admin management
CREATE TABLE IF NOT EXISTS country_admins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    country_code VARCHAR(2),  -- ISO country code (references countries.code)
    features TEXT,  -- Comma-separated list of feature paths
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for country_admins
CREATE INDEX IF NOT EXISTS idx_country_admins_email ON country_admins(email);
CREATE INDEX IF NOT EXISTS idx_country_admins_country_code ON country_admins(country_code);
CREATE INDEX IF NOT EXISTS idx_country_admins_status ON country_admins(status);

-- Function to update country_admins updated_at timestamp
CREATE OR REPLACE FUNCTION update_country_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update country_admins updated_at
CREATE TRIGGER trigger_update_country_admins_updated_at
    BEFORE UPDATE ON country_admins
    FOR EACH ROW
    EXECUTE FUNCTION update_country_admins_updated_at();

