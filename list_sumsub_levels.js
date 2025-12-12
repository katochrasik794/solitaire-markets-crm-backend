import crypto from 'crypto';
import dotenv from 'dotenv';
// Native fetch is available in Node.js 18+

dotenv.config();

const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
const SUMSUB_BASE_URL = process.env.SUMSUB_API_URL || 'https://api.sumsub.com';

const createSignature = (config) => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac('sha256', SUMSUB_SECRET_KEY);
    signature.update(ts + config.method.toUpperCase() + config.url);
    if (config.data) {
        signature.update(config.data);
    }
    return {
        ts,
        signature: signature.digest('hex')
    };
};

const listLevels = async () => {
    try {
        // Attempt 1: /resources/applicants/-/levels (Get available levels)
        const url = '/resources/applicants/-/levels';
        const method = 'GET';

        const { ts, signature } = createSignature({ method, url, data: null });

        console.log(`Fetching levels from ${SUMSUB_BASE_URL}${url}...`);
        // Use native fetch if available (Node 18+), else might need import.
        // Assuming Node 22 env has fetch.
        const response = await fetch(`${SUMSUB_BASE_URL}${url}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-App-Token': SUMSUB_APP_TOKEN,
                'X-App-Access-Ts': ts,
                'X-App-Access-Sig': signature
            }
        });

        const data = await response.json();
        console.log('Response Status:', response.status);
        if (data.items) {
            console.log('Level Names:', data.items.map(item => item.name).join(', '));
            console.log('Level IDs:', data.items.map(item => item.id).join(', ')); // Some logic uses id?
        } else {
            console.log('No items found in response or error:', JSON.stringify(data));
        }

    } catch (err) {
        console.error('Error:', err);
    }
};

listLevels();
