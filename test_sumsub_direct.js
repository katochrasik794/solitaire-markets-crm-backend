import dotenv from 'dotenv';
import { createAccessToken } from './services/sumsub.service.js';

dotenv.config();

async function testToken() {
    console.log('Testing Sumsub Token Generation...');
    try {
        const userId = 'test-user-123';
        const levelName = 'basic-kyc-level'; // Hardcoded test level

        console.log('User ID:', userId);
        console.log('Level Name:', levelName);
        console.log('App Token:', process.env.SUMSUB_APP_TOKEN ? 'Present' : 'Missing');
        console.log('Secret Key:', process.env.SUMSUB_SECRET_KEY ? 'Present' : 'Missing');
        console.log('API URL:', process.env.SUMSUB_API_URL);

        // Modify service logic inside test (mocking is hard, so we just run the test script again and trust the logging I added to service.js? No, I need to see the URL inside service.js).
        // I will modify service.js to log the URL it calls.

        const token = await createAccessToken(userId, levelName);
        console.log('Success! Token Data:', token);
    } catch (error) {
        console.error('Error generating token:', error.message);
        if (error.cause) console.error('Cause:', error.cause);
    }
}

testToken();
