import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
const SUMSUB_API_URL = process.env.SUMSUB_API_URL || 'https://test-api.sumsub.com';
const SUMSUB_LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level';
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
    const url = `${SUMSUB_API_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Sumsub API error: ${data.description || response.statusText}`);
    }

    return data;
  } catch (error) {
    console.error('Sumsub API request error:', error);
    throw error;
  }
}

/**
 * Create applicant in Sumsub
 * @param {number} userId - Local user ID
 * @param {Object} userData - User data from database
 * @returns {Promise<Object>} Sumsub applicant data
 */
export async function createApplicant(userId, userData) {
  try {
    // Map user data to Sumsub format
    const applicantData = {
      externalUserId: `user_${userId}`, // Unique external ID
      email: userData.email,
      phone: userData.phone_code && userData.phone_number 
        ? `${userData.phone_code}${userData.phone_number}` 
        : null,
      fixedInfo: {
        firstName: userData.first_name || '',
        lastName: userData.last_name || '',
        country: userData.country || null,
        city: userData.city || null
      }
    };

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

    const result = await sumsubRequest('POST', '/resources/applicants', applicantData);
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
    const result = await sumsubRequest('POST', '/resources/accessTokens', {
      userId: applicantId,
      ttlInSecs: ttl,
      levelName: levelName
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


