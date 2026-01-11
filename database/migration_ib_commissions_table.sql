-- Migration: Create ib_commissions table
-- This table stores individual commission entries calculated from client trades

CREATE TABLE IF NOT EXISTS ib_commissions (
    id SERIAL PRIMARY KEY,
    ib_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mt5_account_id VARCHAR(50) NOT NULL,
    trade_ticket BIGINT NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    lots DECIMAL(18, 8) NOT NULL,
    profit DECIMAL(18, 8),
    commission_amount DECIMAL(18, 8) NOT NULL,
    group_id INTEGER REFERENCES mt5_groups(id) ON DELETE SET NULL,
    pip_rate DECIMAL(18, 8), -- The rate used at time of calculation
    pip_value DECIMAL(18, 8), -- The pip value at time of calculation
    trade_open_time TIMESTAMP,
    trade_close_time TIMESTAMP,
    duration_seconds INTEGER,
    status VARCHAR(20) DEFAULT 'processed', -- processed, excluded
    exclusion_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure we don't duplicate commission for the same trade
    CONSTRAINT unique_trade_commission UNIQUE (trade_ticket)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ib_commissions_ib_id ON ib_commissions(ib_id);
CREATE INDEX IF NOT EXISTS idx_ib_commissions_client_id ON ib_commissions(client_id);
CREATE INDEX IF NOT EXISTS idx_ib_commissions_created_at ON ib_commissions(created_at);
CREATE INDEX IF NOT EXISTS idx_ib_commissions_status ON ib_commissions(status);
