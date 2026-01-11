import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const secret = process.env.JWT_SECRET || 'your-secret-key';
const token = jwt.sign(
    {
        adminId: 1,
        email: 'admin@solitaire.com',
        role: 'superadmin'
    },
    secret,
    { expiresIn: '1h' }
);

console.log('Token:', token);

async function test() {
    const res = await fetch('http://localhost:5000/api/admin/group-management?is_active=true', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', data);
}

test();
