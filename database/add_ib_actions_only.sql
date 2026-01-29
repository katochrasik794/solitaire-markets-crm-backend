-- Add only new IB actions to unified_actions without truncating existing data
-- This script safely adds new IB actions without affecting existing entries

-- Insert new IB actions (only if they don't already exist)
INSERT INTO unified_actions (action_name, system_type) VALUES
-- IB (Introducing Broker) - New actions only
('IB Request Rejected Email - on IB Request Rejection', 'ib_admin'),
('IB Locked Email - on IB Lock', 'ib_admin'),
('IB Unlocked Email - on IB Unlock', 'ib_admin'),
('IB Withdrawal Request Email - on IB Withdrawal Request', 'ib_client'),
('IB Withdrawal Approved Email - on IB Withdrawal Approval', 'ib_admin'),
('IB Withdrawal Rejected Email - on IB Withdrawal Rejection', 'ib_admin')
ON CONFLICT (action_name) DO NOTHING;

-- Verify the new IB actions were added
SELECT action_name, system_type, template_id 
FROM unified_actions 
WHERE action_name LIKE 'IB%'
ORDER BY action_name;
