-- Populate unified_actions with all email-triggering actions
-- This creates a simple list of all email actions in the system

-- Clear existing data (if any)
TRUNCATE TABLE unified_actions;

-- Insert all email-triggering actions
INSERT INTO unified_actions (action_name, system_type) VALUES
-- Account Management
('Welcome Email - Create Account', 'crm_user'),
('Forgot Password Email - on Forgot Password', 'crm_user'),

-- MT5 Account
('MT5 Account Creation Email - on New MT5 Account', 'crm_user'),
('MT5 Account Creation Email - on New MT5 Account', 'crm_admin'),

-- Deposits
('Deposit Request Email - on Deposit Request', 'crm_user'),
('Deposit Approved Email - on Deposit Approval', 'crm_admin'),
('Transaction Completed Email - Deposit', 'crm_admin'),

-- Withdrawals
('Withdrawal Request Email - on Withdrawal Request', 'crm_user'),
('Withdrawal Approved Email - on Withdrawal Approval', 'crm_admin'),
('Transaction Completed Email - Withdrawal', 'crm_admin'),

-- Transfers
('Internal Transfer Email - on Internal Transfer', 'crm_user'),

-- KYC
('KYC Email - on KYC Submission', 'crm_user'),
('KYC Completion Email - on KYC Approval', 'crm_admin'),

-- IB (Introducing Broker)
('IB Request Email - on IB Request', 'ib_client'),
('IB Request Accepted Email - on IB Request Approval', 'ib_admin'),

-- Support/Tickets
('Ticket Email - on Ticket Creation', 'crm_user'),
('Ticket Response Email - on Ticket Response', 'crm_admin'),

-- Authentication
('OTP Verification Email - on OTP Request', 'crm_user'),

-- Admin Actions
('Custom Email - on Admin Send Email', 'crm_admin')

ON CONFLICT (action_name) DO NOTHING;

-- Verify the data
SELECT system_type, COUNT(*) as count 
FROM unified_actions 
GROUP BY system_type 
ORDER BY system_type;

