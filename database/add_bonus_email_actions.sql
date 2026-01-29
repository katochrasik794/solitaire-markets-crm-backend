-- Add Bonus Email Actions to unified_actions table
-- These actions will be used for bonus add/deduct email notifications

INSERT INTO unified_actions (action_name, system_type) VALUES
('Bonus Added Email - on Bonus Add', 'crm_admin'),
('Bonus Deducted Email - on Bonus Deduct', 'crm_admin')
ON CONFLICT (action_name) DO NOTHING;
