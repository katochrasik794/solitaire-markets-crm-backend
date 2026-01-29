-- Add missing CRM transaction email actions to unified_actions without truncating existing data
-- This script safely adds new transaction email actions without affecting existing entries

-- Insert new CRM transaction email actions (only if they don't already exist)
INSERT INTO unified_actions (action_name, system_type) VALUES
-- Deposits - Missing actions
('Deposit Rejected Email - on Deposit Rejection', 'crm_admin'),
('Deposit Cancelled Email - on Deposit Cancellation', 'crm_user'),

-- Withdrawals - Missing actions
('Withdrawal Rejected Email - on Withdrawal Rejection', 'crm_admin'),
('Withdrawal Cancelled Email - on Withdrawal Cancellation', 'crm_user')
ON CONFLICT (action_name) DO NOTHING;

-- Verify the new actions were added
SELECT action_name, system_type, template_id 
FROM unified_actions 
WHERE action_name LIKE '%Deposit%' OR action_name LIKE '%Withdrawal%'
ORDER BY action_name;
