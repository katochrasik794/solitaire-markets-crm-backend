
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;

// Import Sumsub service logic (simplified for script)
const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
const SUMSUB_API_URL = process.env.SUMSUB_API_URL || 'https://api.sumsub.com';

// Helper to calculate signature
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

async function sumsubRequest(method, endpoint, body = null) {
    const url = `${SUMSUB_API_URL}${endpoint}`;

    // Config for signature - sumsub expects url part (e.g. /resources/...)
    const config = {
        method,
        url: endpoint,
        data: body ? JSON.stringify(body) : null
    };

    const { ts, signature } = createSignature(config);

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-App-Token': SUMSUB_APP_TOKEN,
            'X-App-Access-Ts': ts,
            'X-App-Access-Sig': signature
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    console.log(`[Sumsub] ${method} ${url}`);
    const response = await fetch(url, options);

    if (!response.ok) {
        const text = await response.text();
        console.error('Sumsub Error Body:', text);
        try {
            const data = JSON.parse(text);
            if (data.description) throw new Error(`${response.status} ${data.description}`);
            if (data.message) throw new Error(`${response.status} ${data.message}`);
        } catch (e) {
            // ignore parse error or previous throw
        }
        throw new Error(`Sumsub API error: ${response.status} ${response.statusText} - ${text}`);
    }

    return response.json();
}

async function syncUserStatus(userId) {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    try {
        console.log(`Checking user ID: ${userId}`);

        // 1. Get user and applicant ID
        const userRes = await pool.query('SELECT id, kyc_status, sumsub_applicant_id FROM users WHERE id = $1', [userId]);

        if (userRes.rows.length === 0) {
            console.log('User not found');
            return;
        }

        const user = userRes.rows[0];
        let applicantId = user.sumsub_applicant_id;

        console.log(`Current DB Status: ${user.kyc_status}`);
        console.log(`Applicant ID in DB: ${applicantId}`);

        if (!applicantId) {
            console.error('No sumsub_applicant_id found for this user in DB. Creating token to resolve it...');
        }

        let statusUrl;

        // If it looks like external ID (integer or user_), try to RESOLVE it first via Search/Data Endpoint
        if (!applicantId || !/^[0-9a-fA-F]{24}$/.test(applicantId)) {
            console.log(`ID ${applicantId} looks external. Attempting to resolve via Data Endpoint...`);

            // Try getting applicant DATA by externalUserId
            // GET /resources/applicants/-;externalUserId={externalId}/one
            let resolved = false;
            try {
                // Try simple ID first if applicantId has user_ prefix, try clearing it? 
                // Actually try both variants
                const cleanId = applicantId ? applicantId.toString().replace('user_', '') : user.id.toString();
                const userPrefixed = `user_${cleanId}`;

                const tryIds = [userPrefixed, cleanId];

                for (const tempId of tryIds) {
                    try {
                        const resolveUrl = `/resources/applicants/-;externalUserId=${encodeURIComponent(tempId)}/one`;
                        console.log(`Resolving via Data Endpoint: ${resolveUrl}`);
                        const applicantData = await sumsubRequest('GET', resolveUrl);
                        if (applicantData && applicantData.id) {
                            console.log(`Resolved! Internal ID: ${applicantData.id}`);
                            applicantId = applicantData.id;
                            resolved = true;
                            // Update DB
                            await pool.query('UPDATE users SET sumsub_applicant_id = $1 WHERE id = $2', [applicantId, userId]);
                            break;
                        }
                    } catch (e) {
                        console.log(`Failed resolution with ${tempId}: ${e.message}`);
                    }
                }

                if (!resolved) {
                    // Try createAccessToken approach as last ditch?
                    // We already tried and it returns user_59.
                    throw new Error('Could not resolve Internal ID via /one endpoint.');
                }

            } catch (resolveError) {
                console.error('ID Resolution failed:', resolveError.message);
                throw resolveError;
            }
        }

        // Now we should have internal ID
        statusUrl = `/resources/applicants/${applicantId}/status`;
        console.log(`Fetching status from Sumsub (${statusUrl})...`);

        const statusData = await sumsubRequest('GET', statusUrl);
        console.log('Sumsub Status Data:', JSON.stringify(statusData, null, 2));

        let reviewResult = null;
        let reviewComment = null;
        let status = 'pending';

        if (statusData.reviewResult) {
            reviewResult = statusData.reviewResult.reviewAnswer;
            reviewComment = statusData.reviewResult.reviewComment;
        } else if (statusData.review) {
            reviewResult = statusData.review.reviewAnswer;
            reviewComment = statusData.review.reviewComment;
        }

        if (reviewResult === 'GREEN' || reviewResult === 'approved') {
            status = 'approved';
        } else if (reviewResult === 'RED' || reviewResult === 'rejected') {
            status = 'rejected';
        }

        console.log(`Determined Status: ${status}`);

        // 3. Update DB
        await pool.query('BEGIN');

        // Update users table
        await pool.query(
            'UPDATE users SET kyc_status = $1, updated_at = NOW() WHERE id = $2',
            [status, userId]
        );

        // Update kyc_verifications
        // Check if exists
        const kycRes = await pool.query('SELECT id FROM kyc_verifications WHERE user_id = $1', [userId]);

        // Fetch full data for detailed record (always use Internal ID now)
        const dataUrl = `/resources/applicants/${applicantId}/one`;
        const fullData = await sumsubRequest('GET', dataUrl);

        const sumsubData = {
            status: statusData,
            fullApplicantData: fullData,
            idDocs: fullData.idDocs
        };

        if (kycRes.rows.length > 0) {
            await pool.query(
                `UPDATE kyc_verifications 
                 SET status = $1,
                     sumsub_applicant_id = $7,
                     sumsub_review_result = $2,
                     sumsub_review_comment = $3,
                     sumsub_verification_status = $4,
                     sumsub_verification_result = $5,
                     reviewed_at = CASE WHEN $1 = 'approved' OR $1 = 'rejected' THEN NOW() ELSE reviewed_at END,
                     updated_at = NOW()
                 WHERE user_id = $6`,
                [status, reviewResult, reviewComment, statusData.reviewStatus, JSON.stringify(sumsubData), userId, applicantId]
            );
            console.log('Updated existing kyc_verifications record');
        } else {
            await pool.query(
                `INSERT INTO kyc_verifications 
                 (user_id, status, sumsub_applicant_id, sumsub_review_result, sumsub_review_comment, sumsub_verification_status, sumsub_verification_result, reviewed_at, updated_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $2 = 'approved' OR $2 = 'rejected' THEN NOW() ELSE NULL END, NOW(), NOW())`,
                [userId, status, applicantId, reviewResult, reviewComment, statusData.reviewStatus, JSON.stringify(sumsubData)]
            );
            console.log('Created new kyc_verifications record');
        }

        await pool.query('COMMIT');
        console.log(`Successfully synced user ${userId} to status: ${status}`);

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error syncing status:', error);
    } finally {
        await pool.end();
    }
}

// Run for user 59
const userId = process.argv[2] || 59;
syncUserStatus(userId);
