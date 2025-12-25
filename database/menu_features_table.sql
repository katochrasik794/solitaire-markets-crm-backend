-- Menu Features Table
-- Stores client-side menu items and their enabled/disabled status

CREATE TABLE IF NOT EXISTS menu_features (
    id SERIAL PRIMARY KEY,
    route_path VARCHAR(255) NOT NULL UNIQUE, -- e.g., "dashboard", "analysis/signal-centre"
    display_name VARCHAR(255) NOT NULL, -- e.g., "Dashboard", "Signal Centre"
    is_enabled BOOLEAN DEFAULT TRUE,
    icon_name VARCHAR(100), -- Optional: store icon identifier
    parent_path VARCHAR(255), -- For sub-menus: e.g., "analysis" for "analysis/signal-centre"
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_menu_features_parent ON menu_features(parent_path);
CREATE INDEX IF NOT EXISTS idx_menu_features_enabled ON menu_features(is_enabled);
CREATE INDEX IF NOT EXISTS idx_menu_features_route_path ON menu_features(route_path);

-- Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_menu_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_menu_features_updated_at
    BEFORE UPDATE ON menu_features
    FOR EACH ROW
    EXECUTE FUNCTION update_menu_features_updated_at();

