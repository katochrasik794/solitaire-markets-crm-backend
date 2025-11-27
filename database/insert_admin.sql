-- Insert default admin user
-- Email: admin@Solitaire.com
-- Password: Admin@000 (bcrypt hash: $2y$10$pDKYJsFkr457Fxnp990V/.cKXIpNNAWBZTtbnshZMUfhrUilE8Vbu)

INSERT INTO admin (
    username,
    email,
    password_hash,
    admin_role,
    is_active,
    login_attempts,
    created_at,
    updated_at
) VALUES (
    'admin',
    'admin@Solitaire.com',
    '$2y$10$pDKYJsFkr457Fxnp990V/.cKXIpNNAWBZTtbnshZMUfhrUilE8Vbu',
    'admin',
    TRUE,
    0,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Verify the admin was inserted
SELECT id, username, email, admin_role, is_active, created_at 
FROM admin 
WHERE email = 'admin@Solitaire.com';

