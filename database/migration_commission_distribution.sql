-- Create group_commission_distribution table
CREATE TABLE IF NOT EXISTS group_commission_distribution (
    id SERIAL PRIMARY KEY,
    group_path VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    pip_value NUMERIC(10, 2) DEFAULT 0.00,
    availability VARCHAR(50) DEFAULT 'All Users', -- 'All Users' or 'Selected Users'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create group_commission_users table for user-specific availability
CREATE TABLE IF NOT EXISTS group_commission_users (
    id SERIAL PRIMARY KEY,
    distribution_id INTEGER REFERENCES group_commission_distribution(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(distribution_id, user_id)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_group_comm_dist_path ON group_commission_distribution(group_path);
CREATE INDEX IF NOT EXISTS idx_group_comm_dist_active ON group_commission_distribution(is_active);
CREATE INDEX IF NOT EXISTS idx_group_comm_users_dist_id ON group_commission_users(distribution_id);
CREATE INDEX IF NOT EXISTS idx_group_comm_users_user_id ON group_commission_users(user_id);

-- Insert initial data from existing groups in group_management if table is empty
INSERT INTO group_commission_distribution (group_path, display_name, pip_value, availability, is_active)
SELECT 
    "group", 
    dedicated_name, 
    0.00, 
    'All Users', 
    is_active
FROM group_management
WHERE NOT EXISTS (SELECT 1 FROM group_commission_distribution);
