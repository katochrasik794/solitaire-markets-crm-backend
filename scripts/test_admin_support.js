import axios from 'axios';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:5000/api/support/admin/all';
const SECRET = process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'your-secret-key';

async function testAdminSupport() {
    console.log('🧪 Testing Admin Support API...');

    // 1. Generate Admin Token
    const token = jwt.sign(
        {
            adminId: 1, // Assuming admin ID 1 exists (verified in previous step)
            email: 'admin@example.com',
            role: 'super_admin'
        },
        SECRET,
        { expiresIn: '1h' }
    );
    console.log('🔑 Generated Test Token');

    // 2. Call API
    try {
        console.log(`📡 GET ${API_URL}?status=open`);
        const response = await axios.get(`${API_URL}?status=open`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log('✅ Response Status:', response.status);
        console.log('📦 Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('❌ Request Failed:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        } else {
            console.error('   Error:', error.message);
        }
    }
}

testAdminSupport();
