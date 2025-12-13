
const fetch = require('node-fetch');

async function test() {
    const baseUrl = 'http://localhost:5001/api';
    const email = `test${Date.now()}@example.com`;

    console.log('Registering user:', email);

    // 1. Register
    const regRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            password: 'Password123!',
            firstName: 'Test',
            lastName: 'User',
            phoneNumber: '1234567890',
            country: 'US'
        })
    });

    const regData = await regRes.json();
    if (!regData.success) {
        console.error('Register failed:', regData);
        // Try login if user exists (unlikely with timestamp)
        return;
    }

    const token = regData.token;
    console.log('Got token');

    // 2. Get Groups
    const groupsRes = await fetch(`${baseUrl}/accounts/groups`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const groupsData = await groupsRes.json();
    console.log('Groups Data:', JSON.stringify(groupsData, null, 2));
}

test();
