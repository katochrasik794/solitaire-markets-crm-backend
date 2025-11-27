-- MT5 Server Groups Table
CREATE TABLE IF NOT EXISTS mt5_groups (
    id SERIAL PRIMARY KEY,
    group_name VARCHAR(255) NOT NULL UNIQUE,
    dedicated_name VARCHAR(255), -- Admin-defined friendly name for the group
    server INTEGER DEFAULT 1,
    permissions_flags INTEGER DEFAULT 0,
    auth_mode INTEGER DEFAULT 0,
    auth_password_min INTEGER DEFAULT 8,
    company VARCHAR(255),
    company_page VARCHAR(255),
    company_email VARCHAR(255),
    company_support_page VARCHAR(500),
    company_support_email VARCHAR(255),
    company_catalog VARCHAR(255),
    currency VARCHAR(10) DEFAULT 'USD',
    currency_digits INTEGER DEFAULT 2,
    reports_mode INTEGER DEFAULT 0,
    reports_flags INTEGER DEFAULT 0,
    reports_smtp VARCHAR(255),
    reports_smtp_login VARCHAR(255),
    news_mode INTEGER DEFAULT 2,
    news_category VARCHAR(255),
    mail_mode INTEGER DEFAULT 1,
    trade_flags INTEGER DEFAULT 0,
    trade_interestrate DECIMAL(10, 2) DEFAULT 0,
    trade_virtual_credit DECIMAL(10, 2) DEFAULT 0,
    margin_free_mode INTEGER DEFAULT 1,
    margin_so_mode INTEGER DEFAULT 0,
    margin_call DECIMAL(5, 2) DEFAULT 100,
    margin_stop_out DECIMAL(5, 2) DEFAULT 30,
    demo_leverage INTEGER DEFAULT 0,
    demo_deposit DECIMAL(10, 2) DEFAULT 0,
    limit_history INTEGER DEFAULT 0,
    limit_orders INTEGER DEFAULT 0,
    limit_symbols INTEGER DEFAULT 0,
    limit_positions INTEGER DEFAULT 0,
    margin_mode INTEGER DEFAULT 0,
    margin_flags INTEGER DEFAULT 0,
    trade_transfer_mode INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on group_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_mt5_groups_name ON mt5_groups(group_name);

-- Create index on currency for filtering
CREATE INDEX IF NOT EXISTS idx_mt5_groups_currency ON mt5_groups(currency);

-- Create index on is_active for filtering
CREATE INDEX IF NOT EXISTS idx_mt5_groups_active ON mt5_groups(is_active);

-- Trigger to automatically update updated_at
CREATE TRIGGER update_mt5_groups_updated_at BEFORE UPDATE ON mt5_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert all MT5 groups
INSERT INTO mt5_groups (
    group_name, dedicated_name, server, permissions_flags, auth_mode, auth_password_min,
    company, company_page, company_email, company_support_page, company_support_email,
    company_catalog, currency, currency_digits, reports_mode, reports_flags,
    reports_smtp, reports_smtp_login, news_mode, news_category, mail_mode,
    trade_flags, trade_interestrate, trade_virtual_credit, margin_free_mode,
    margin_so_mode, margin_call, margin_stop_out, demo_leverage, demo_deposit,
    limit_history, limit_orders, limit_symbols, limit_positions, margin_mode,
    margin_flags, trade_transfer_mode, is_active
) VALUES
('managers\\administrators', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 31, 0, 0, 1, 0, 50, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, FALSE),
('managers\\administrators', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 31, 0, 0, 1, 0, 50, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, FALSE),
('managers\\dealers', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 31, 0, 0, 1, 0, 50, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, FALSE),
('preliminary', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', 'preliminary', 'USD', 2, 0, 0, '', '', 2, '', 1, 31, 0, 0, 1, 0, 50, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, FALSE),
('demo\\PROP-DEMO-USD-100x', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 23, 0, 0, 1, 0, 100, 30, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real\\ISL-USD-100x-Bbook-SwapFree', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 210, 0, 0, 1, 0, 100, 30, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real\\ECN-USD-200x-Abook', NULL, 1, 506, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 30, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real\\STD-USD-100x-Bbook', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 23, 0, 0, 1, 0, 100, 30, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('demo\\DEMO-USD-100x', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 23, 0, 0, 1, 0, 100, 30, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 23, 0, 0, 1, 0, 100, 30, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('demo\\DEMO-USD-2000x', NULL, 1, 2, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 0, 0, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 30, 1000, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real\\Bbook\\Standard\\dynamic-2000x-20Pips', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 0, 100, 0, 0, 0, 0, 0, 2, 0, 0, TRUE),
('real\\Bbook\\Cent\\dynamic-2000x-3Pips', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USC', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 5, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('demo\\Pro\\dynamic-2000x-10PAbook', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 5, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('demo\\Standard\\dynamic-2000x-20PAbook', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 5, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real\\Tattvam\\Standard\\dynamic-2000x-20Pips', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 5, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real\\USDINR-Tattvam\\Standard\\dynamic-500x-20Pips', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'INR', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 5, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real\\USDINR-Tattvam\\Pro\\dynamic-500x-20Pips', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'INR', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 5, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real\\Bbook\\Pro\\dynamic-2000x-10P', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 0, 100, 0, 0, 0, 0, 0, 2, 0, 0, TRUE),
('real\\Tattvam\\Pro\\dynamic-2000x-10P', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 5, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE),
('real\\Bbook\\Startup\\dynamic-2000x-20Pips', NULL, 1, 450, 0, 8, 'Zuperior FX Limited', 'MT5-ZUPER-01-ENTRY', '', 'https://www.mql5.com/[lang:en|ru|es|pt|zh|ja|de|ko|fr|it|tr]', '', '', 'USD', 2, 1, 5, '', '', 2, '', 1, 2135, 0, 0, 1, 0, 100, 0, 100, 0, 0, 0, 0, 0, 2, 0, 0, FALSE)
ON CONFLICT (group_name) DO NOTHING;

