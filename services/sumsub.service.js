
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
const SUMSUB_API_URL = process.env.SUMSUB_API_URL ||
    (SUMSUB_APP_TOKEN && SUMSUB_APP_TOKEN.startsWith('prd:')
        ? 'https://api.sumsub.com'
        : 'https://test-api.sumsub.com');
const SUMSUB_LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME || 'id-only';
const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET || SUMSUB_SECRET_KEY;

// Helper to calculate signature
const createSignature = (config) => {
    const ts = Math.floor(Date.now() / 1000);
    if (!SUMSUB_SECRET_KEY) throw new Error('SUMSUB_SECRET_KEY is missing');

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

/**
 * Make API request to Sumsub with HMAC signature
 */
async function sumsubRequest(method, endpoint, body = null) {
    if (!SUMSUB_APP_TOKEN) throw new Error('SUMSUB_APP_TOKEN is missing');

    const config = {
        method,
        url: endpoint,
        data: body ? JSON.stringify(body) : null
    };

    const { ts, signature } = createSignature(config);
    const fullUrl = `${SUMSUB_API_URL}${endpoint}`;

    console.log(`[Sumsub] ${method} ${fullUrl}`);

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

    const response = await fetch(fullUrl, options);

    // Check if response is ok before parsing JSON
    let data;
    const text = await response.text();
    try {
        data = text ? JSON.parse(text) : {};
    } catch (parseError) {
        console.error('[Sumsub] Failed to parse response:', text.substring(0, 500));
        throw new Error(`Sumsub API returned invalid JSON. Status: ${response.status}`);
    }

    if (!response.ok) {
        console.error('[Sumsub] API error response:', {
            status: response.status,
            data,
            endpoint
        });

        // Attach error response data to error object
        const errorMsg = data.description || data.message || response.statusText;
        const error = new Error(`Sumsub API error (${response.status}): ${errorMsg}`);
        error.errorResponse = data;
        error.status = response.status;
        throw error;
    }

    return data;
}

/**
 * Helper to resolve Internal Applicant ID from External ID if needed
 * @param {string} applicantId - The ID stored in DB (could be internal hex or external 'user_59')
 * @returns {Promise<string>} The resolved Internal Hex ID
 */
async function resolveApplicantId(applicantId) {
    if (!applicantId) return null;

    // If it's already a 24-char hex string, assume it's Internal ID
    if (/^[0-9a-fA-F]{24}$/.test(applicantId)) {
        return applicantId;
    }

    console.log(`[Sumsub] Resolving Internal ID for: ${applicantId}`);

    // Try to resolve via DATA endpoint using externalUserId
    // Try simple ID (stripped) and with user_ prefix
    const cleanId = applicantId.toString().replace('user_', '');
    const userPrefixed = `user_${cleanId}`;
    const tryIds = [userPrefixed, cleanId];

    for (const tempId of tryIds) {
        try {
            const resolveUrl = `/resources/applicants/-;externalUserId=${encodeURIComponent(tempId)}/one`;
            const data = await sumsubRequest('GET', resolveUrl);
            if (data && data.id) {
                console.log(`[Sumsub] Resolved ${applicantId} -> ${data.id}`);
                return data.id;
            }
        } catch (e) {
            // Ignore 404/400 during resolution attempts
        }
    }

    // If resolution fails, assume the original ID might work (best effort)
    console.warn(`[Sumsub] Could not resolve Internal ID for ${applicantId}, using as is.`);
    return applicantId;
}

/**
 * Create access token
 */
export const createAccessToken = async (userId, levelName = SUMSUB_LEVEL_NAME) => {
    // Note: userId here is typically the External User ID (passed from req.user.id)
    // Sumsub will use it to link/create the applicant.

    // Check if we should prefix with user_ (usually yes for integer IDs)
    const externalUserId = userId.toString().startsWith('user_') ? userId : `user_${userId}`;

    const ttl = 3600;
    const endpoint = `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(levelName)}&ttlInSecs=${ttl}`;

    try {
        const result = await sumsubRequest('POST', endpoint);
        return result; // contains { token, userId }
    } catch (error) {
        console.error('Create access token error:', error);
        throw error;
    }
};

/**
 * Create applicant
 */
export async function createApplicant(userId, userData, levelName = null) {
    try {
        const verificationLevel = levelName || SUMSUB_LEVEL_NAME;

        let countryForSumsub = null;
        if (userData.country_code) {
            countryForSumsub = userData.country_code.toUpperCase();
        } else if (userData.country) {
            const countryStr = userData.country.trim().toUpperCase();
            if (countryStr.length === 2 || countryStr.length === 3) {
                countryForSumsub = countryStr;
            }
        }

        const applicantData = {
            externalUserId: `user_${userId}`,
            email: userData.email,
            phone: userData.phone_code && userData.phone_number
                ? `${userData.phone_code}${userData.phone_number}`
                : null,
            fixedInfo: {
                firstName: userData.first_name || '',
                lastName: userData.last_name || ''
            }
        };

        if (countryForSumsub) {
            applicantData.fixedInfo.country = countryForSumsub;
        }

        // Clean data (omitted deep clean for brevity, assuming main fields are enough)

        const endpoint = `/resources/applicants?levelName=${encodeURIComponent(verificationLevel)}`;
        const result = await sumsubRequest('POST', endpoint, applicantData);
        return result;
    } catch (error) {
        console.error('Create applicant error:', error);
        throw error;
    }
}

/**
 * Get applicant status
 */
export async function getApplicantStatus(applicantId) {
    try {
        const internalId = await resolveApplicantId(applicantId);
        const result = await sumsubRequest('GET', `/resources/applicants/${internalId}/status`);
        return result;
    } catch (error) {
        console.error('Get applicant status error:', error);
        if (error.errorResponse) throw error;
        throw error;
    }
}

/**
 * Get applicant full data
 */
export async function getApplicantData(applicantId) {
    try {
        const internalId = await resolveApplicantId(applicantId);
        const result = await sumsubRequest('GET', `/resources/applicants/${internalId}/one`);
        return result;
    } catch (error) {
        console.error('Get applicant data error:', error);
        if (error.errorResponse) throw error;
        throw error;
    }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload, signature) {
    try {
        if (!SUMSUB_WEBHOOK_SECRET) {
            console.warn('SUMSUB_WEBHOOK_SECRET not set, skipping verification');
            return true;
        }

        // Handle if payload is object
        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

        const hmac = crypto.createHmac('sha256', SUMSUB_WEBHOOK_SECRET);
        hmac.update(payloadStr);
        const calculatedSignature = hmac.digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(calculatedSignature)
        );
    } catch (error) {
        console.error('Webhook signature verification error:', error);
        return false;
    }
}

/**
 * Handle webhook event
 */
export function handleWebhookEvent(eventData) {
    try {
        const { type, applicantId, reviewResult, reviewStatus } = eventData;
        return {
            type,
            applicantId, // This is usually the Internal ID from webhook
            reviewResult: reviewResult || null,
            reviewStatus: reviewStatus || null,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Handle webhook event error:', error);
        throw error;
    }
}

// Temporary export to maintain compatibility if imports expect default (though we use named)
const sumsubService = {
    createAccessToken,
    createApplicant,
    getApplicantStatus,
    getApplicantData,
    verifyWebhookSignature,
    handleWebhookEvent
};
export default sumsubService;
