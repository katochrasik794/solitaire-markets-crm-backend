-- Create tickers table for content management
CREATE TABLE IF NOT EXISTS tickers (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  image_url VARCHAR(500),
  link_url VARCHAR(500),
  position VARCHAR(20) NOT NULL DEFAULT 'top' CHECK (position IN ('top', 'middle')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_duration INTEGER DEFAULT 5, -- seconds to display
  animation_speed INTEGER DEFAULT 50, -- pixels per second for scrolling
  priority INTEGER DEFAULT 0, -- higher priority shows first
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickers_active ON tickers(is_active);
CREATE INDEX IF NOT EXISTS idx_tickers_position ON tickers(position);
CREATE INDEX IF NOT EXISTS idx_tickers_priority ON tickers(priority DESC);

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tickers_updated_at 
    BEFORE UPDATE ON tickers
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

