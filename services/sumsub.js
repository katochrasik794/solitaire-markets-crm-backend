import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
// Auto-detect API URL based on token prefix (prd: = production, sbx: = sandbox)
const SUMSUB_API_URL = process.env.SUMSUB_API_URL || 
  (SUMSUB_APP_TOKEN && SUMSUB_APP_TOKEN.startsWith('prd:') 
    ? 'https://api.sumsub.com' 
    : 'https://test-api.sumsub.com');
const SUMSUB_LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME || 'id-only';
const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET || SUMSUB_SECRET_KEY;

/**
 * Create Basic Auth header for Sumsub API
 */
function getAuthHeader() {
  const credentials = Buffer.from(`${SUMSUB_APP_TOKEN}:${SUMSUB_SECRET_KEY}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Make API request to Sumsub
 */
async function sumsubRequest(method, endpoint, body = null) {
  try {
    if (!SUMSUB_APP_TOKEN || !SUMSUB_SECRET_KEY) {
      throw new Error('Sumsub credentials not configured. Please set SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY environment variables.');
    }

    const url = `${SUMSUB_API_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    console.log(`[Sumsub] ${method} ${url}`);
    if (body) {
      console.log('[Sumsub] Request body:', JSON.stringify(body, null, 2));
    }

    const response = await fetch(url, options);
    
    // Check if response is ok before parsing JSON
    let data;
    const text = await response.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseError) {
      console.error('[Sumsub] Failed to parse response. Response text:', text.substring(0, 500));
      // If it's HTML, it's likely an error page
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error(`Sumsub API returned HTML error page (Status: ${response.status}). This usually means: 1) Invalid credentials, 2) Level doesn't exist, 3) No permission. Check your Sumsub dashboard.`);
      }
      throw new Error(`Sumsub API returned invalid JSON. Status: ${response.status} ${response.statusText}. Response: ${text.substring(0, 200)}`);
    }

    if (!response.ok) {
      console.error('[Sumsub] API error response:', {
        status: response.status,
        statusText: response.statusText,
        data: data,
        url: url
      });
      
      // Store error response data for database storage
      const errorResponse = {
        error: true,
        status: response.status,
        statusText: response.statusText,
        code: data.code || response.status,
        description: data.description || data.message || response.statusText,
        correlationId: data.correlationId || null,
        data: data
      };
      
      // Attach error response to error object so it can be stored in database
      const error = new Error(`Sumsub API error (${response.status}): ${errorResponse.description}`);
      error.errorResponse = errorResponse;
      
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[Sumsub] API request error:', {
      message: error.message,
      endpoint: endpoint,
      method: method,
      apiUrl: SUMSUB_API_URL,
      hasToken: !!SUMSUB_APP_TOKEN,
      hasSecret: !!SUMSUB_SECRET_KEY
    });
    
    // Provide more helpful error messages
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      throw new Error(`Cannot connect to Sumsub API at ${SUMSUB_API_URL}. Please check your network connection and API URL.`);
    }
    
    throw error;
  }
}

/**
 * Create applicant in Sumsub
 * @param {number} userId - Local user ID
 * @param {Object} userData - User data from database
 * @param {string} levelName - Verification level name (optional, defaults to SUMSUB_LEVEL_NAME)
 * @returns {Promise<Object>} Sumsub applicant data
 */
export async function createApplicant(userId, userData, levelName = null) {
  try {
    const verificationLevel = levelName || SUMSUB_LEVEL_NAME;
    
    // Map user data to Sumsub format
    // Sumsub requires ISO 3166-1 alpha-2 (2-letter) or alpha-3 (3-letter) country codes
    // Use country_code if available (2-letter), otherwise try to use country name
    let countryForSumsub = null;
    if (userData.country_code) {
      // Use 2-letter ISO code
      countryForSumsub = userData.country_code.toUpperCase();
    } else if (userData.country) {
      // If country is already a code (2-3 letters), use it
      const countryStr = userData.country.trim().toUpperCase();
      if (countryStr.length === 2 || countryStr.length === 3) {
        countryForSumsub = countryStr;
      }
      // Otherwise, skip country (Sumsub will handle it)
    }
    
    const applicantData = {
      externalUserId: `user_${userId}`, // Unique external ID
      email: userData.email,
      phone: userData.phone_code && userData.phone_number 
        ? `${userData.phone_code}${userData.phone_number}` 
        : null,
      fixedInfo: {
        firstName: userData.first_name || '',
        lastName: userData.last_name || ''
      }
    };
    
    // Only add country if we have a valid code
    if (countryForSumsub) {
      applicantData.fixedInfo.country = countryForSumsub;
    }

    // Remove null/undefined fields
    Object.keys(applicantData).forEach(key => {
      if (applicantData[key] === null || applicantData[key] === undefined) {
        delete applicantData[key];
      }
    });

    if (applicantData.fixedInfo) {
      Object.keys(applicantData.fixedInfo).forEach(key => {
        if (applicantData.fixedInfo[key] === null || applicantData.fixedInfo[key] === undefined) {
          delete applicantData.fixedInfo[key];
        }
      });
      if (Object.keys(applicantData.fixedInfo).length === 0) {
        delete applicantData.fixedInfo;
      }
    }

    // Pass levelName as query parameter (Sumsub API requirement)
    const endpoint = `/resources/applicants${verificationLevel ? `?levelName=${encodeURIComponent(verificationLevel)}` : ''}`;
    const result = await sumsubRequest('POST', endpoint, applicantData);
    return result;
  } catch (error) {
    console.error('Create applicant error:', error);
    throw error;
  }
}

/**
 * Generate access token for Sumsub SDK
 * @param {string} applicantId - Sumsub applicant ID
 * @param {string} levelName - Verification level name
 * @param {number} ttl - Time to live in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>} Access token
 */
export async function generateAccessToken(applicantId, levelName = SUMSUB_LEVEL_NAME, ttl = 3600) {
  try {
    // Pass levelName as query parameter if provided
    const verificationLevel = levelName || SUMSUB_LEVEL_NAME;
    const endpoint = verificationLevel 
      ? `/resources/accessTokens?levelName=${encodeURIComponent(verificationLevel)}`
      : '/resources/accessTokens';
    
    const result = await sumsubRequest('POST', endpoint, {
      userId: applicantId,
      ttlInSecs: ttl
    });
    return result.token;
  } catch (error) {
    console.error('Generate access token error:', error);
    throw error;
  }
}

/**
 * Get applicant status from Sumsub
 * @param {string} applicantId - Sumsub applicant ID
 * @returns {Promise<Object>} Applicant status data
 */
export async function getApplicantStatus(applicantId) {
  try {
    const result = await sumsubRequest('GET', `/resources/applicants/${applicantId}/status`);
    return result;
  } catch (error) {
    console.error('Get applicant status error:', error);
    // Preserve error response data if available
    if (error.errorResponse) {
      throw error;
    }
    throw error;
  }
}

/**
 * Get full applicant data from Sumsub
 * @param {string} applicantId - Sumsub applicant ID
 * @returns {Promise<Object>} Full applicant data
 */
export async function getApplicantData(applicantId) {
  try {
    const result = await sumsubRequest('GET', `/resources/applicants/${applicantId}/one`);
    return result;
  } catch (error) {
    console.error('Get applicant data error:', error);
    // Preserve error response data if available
    if (error.errorResponse) {
      throw error;
    }
    throw error;
  }
}

/**
 * Verify webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - X-Payload-Digest header value
 * @returns {boolean} True if signature is valid
 */
export function verifyWebhookSignature(payload, signature) {
  try {
    if (!SUMSUB_WEBHOOK_SECRET) {
      console.warn('SUMSUB_WEBHOOK_SECRET not set, skipping signature verification');
      return true; // Allow if secret not configured
    }

    const hmac = crypto.createHmac('sha256', SUMSUB_WEBHOOK_SECRET);
    hmac.update(payload);
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
 * Handle webhook event from Sumsub
 * @param {Object} eventData - Webhook event data
 * @returns {Object} Processed event data
 */
export function handleWebhookEvent(eventData) {
  try {
    const { type, applicantId, reviewResult, reviewStatus } = eventData;

    return {
      type,
      applicantId,
      reviewResult: reviewResult || null,
      reviewStatus: reviewStatus || null,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Handle webhook event error:', error);
    throw error;
  }
}





