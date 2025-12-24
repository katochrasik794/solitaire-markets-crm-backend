-- Promotions/Banners Table
-- For managing promotional banners displayed on user dashboard

CREATE TABLE IF NOT EXISTS promotions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255), -- For admin reference only
    image_url VARCHAR(500) NOT NULL,
    button_text VARCHAR(100),
    button_link VARCHAR(500),
    button_position VARCHAR(20) DEFAULT 'right-center', -- right-center, left-center, etc.
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on is_active for faster filtering
CREATE INDEX IF NOT EXISTS idx_promotions_is_active ON promotions(is_active);

-- Create index on priority and display_order for sorting
CREATE INDEX IF NOT EXISTS idx_promotions_priority ON promotions(priority DESC, display_order ASC);

-- Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_promotions_updated_at 
    BEFORE UPDATE ON promotions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

