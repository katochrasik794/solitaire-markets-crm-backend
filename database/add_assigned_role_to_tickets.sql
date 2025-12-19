-- Add assigned_role_id column to support_tickets table
-- This allows tickets to be assigned to specific admin roles

ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS assigned_role_id INTEGER REFERENCES admin_roles(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_role_id ON support_tickets(assigned_role_id);

-- Add comment
COMMENT ON COLUMN support_tickets.assigned_role_id IS 'Role ID that this ticket is assigned to. NULL means unassigned. Super admins can see all tickets.';

