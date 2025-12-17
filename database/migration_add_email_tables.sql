-- Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    html_code TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    is_default BOOLEAN DEFAULT FALSE,
    from_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Sent Emails Table
CREATE TABLE IF NOT EXISTS sent_emails (
    id SERIAL PRIMARY KEY,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    subject VARCHAR(255) NOT NULL,
    content_body TEXT,
    is_html BOOLEAN DEFAULT TRUE,
    recipient_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    attachments_count INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(name);
CREATE INDEX IF NOT EXISTS idx_sent_emails_recipient ON sent_emails(recipient_email);
CREATE INDEX IF NOT EXISTS idx_sent_emails_status ON sent_emails(status);
CREATE INDEX IF NOT EXISTS idx_sent_emails_created_at ON sent_emails(created_at);

-- Trigger to automatically update updated_at
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sent_emails_updated_at BEFORE UPDATE ON sent_emails
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
