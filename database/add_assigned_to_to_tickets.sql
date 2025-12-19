-- Add assigned_to column to support_tickets table
-- This column stores the admin user ID who is assigned to handle the ticket

ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES admin(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);

-- Add comment
COMMENT ON COLUMN support_tickets.assigned_to IS 'Admin user ID that this ticket is assigned to. NULL means unassigned.';

