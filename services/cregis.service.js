import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

/**
 * Cregis Payment Gateway Service
 * API Documentation: https://t-fumzndoo.cregis.io
 */

// Default values (fallback if not provided via config)
const DEFAULT_CREGIS_PROJECT_ID = process.env.CREGIS_PROJECT_ID || '1445920661479424';
const DEFAULT_CREGIS_API_KEY = process.env.CREGIS_API_KEY || '0794b200b7d34acca7c06a72ee2cf58c';
const DEFAULT_CREGIS_GATEWAY_URL = process.env.CREGIS_GATEWAY_URL || 'https://t-fumzndoo.cregis.io';
const DEFAULT_CREGIS_WEBHOOK_SECRET = process.env.CREGIS_WEBHOOK_SECRET || '';

/**
 * Generate a 6-character random nonce
 */
const generateNonce = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 6; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
};

/**
 * Generate 13-digit unix timestamp
 */
const generateTimestamp = () => {
  return Date.now();
};

/**
 * Generate signature for Cregis API requests
 * Method: Sort parameters alphabetically, create query string, HMAC-SHA256 with API key
 * Note: Values should be converted to strings and URL-encoded if needed
 * @param {Object} params - Request parameters (sign field will be excluded)
 * @returns {string} Signature
 */
/**
 * Generate signature for Cregis API requests
 * According to Cregis documentation:
 * 1. Exclude 'sign' and all null/empty parameters
 * 2. Sort parameters lexicographically (alphabetically)
 * 3. Concatenate as "key1value1key2value2..." (NO = or &)
 * 4. Prepend API Key to the string
 * 5. Calculate MD5 hash (lowercase)
 * @param {Object} params - Request parameters (sign field will be excluded)
 * @param {string} apiKey - API key to use for signing (from gateway config or env)
 * @returns {string} Signature (MD5 hash in lowercase)
 */
const generateSignature = (params, apiKey = null) => {
  // Use provided API key or fallback to default
  const signingKey = apiKey || DEFAULT_CREGIS_API_KEY;
  // Step 1: Remove sign and filter out null/empty values
  const { sign, ...paramsToSign } = params;
  
  const filteredParams = {};
  Object.keys(paramsToSign).forEach(key => {
    const value = paramsToSign[key];
    // Exclude null, undefined, and empty string values
    if (value !== null && value !== undefined && value !== '') {
      filteredParams[key] = value;
    }
  });
  
  // Step 2: Sort parameters lexicographically (alphabetically)
  const sortedKeys = Object.keys(filteredParams).sort();
  
  // Step 3: Concatenate as "key1value1key2value2..." (NO equals signs, NO ampersands)
  let concatenatedString = '';
  sortedKeys.forEach(key => {
    let value = filteredParams[key];
    
    // Convert to string
    if (typeof value === 'object' && value !== null) {
      // For objects/arrays, stringify them (like tokens JSON string)
      value = JSON.stringify(value);
    } else {
      value = String(value);
    }
    
    // Concatenate as key1value1key2value2...
    concatenatedString += key + value;
  });
  
  // Step 4: Prepend API Key to the string
  const stringToHash = signingKey + concatenatedString;
  
  console.log('=== CREGIS SIGNATURE GENERATION ===');
  console.log('Filtered parameters:', sortedKeys);
  console.log('Concatenated string (first 200 chars):', concatenatedString.substring(0, 200));
  console.log('String to hash (first 250 chars):', stringToHash.substring(0, 250));
  console.log('API Key length:', signingKey?.length);
  
  // Step 5: Calculate MD5 hash (lowercase)
  const signature = crypto
    .createHash('md5')
    .update(stringToHash)
    .digest('hex')
    .toLowerCase(); // Ensure lowercase
  
  console.log('Generated signature (MD5):', signature);
  console.log('=== END SIGNATURE DEBUG ===');
  
  return signature;
};

/**
 * Generate a unique order ID
 */
export const generateOrderId = (depositRequestId) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `DEPOSIT-${depositRequestId}-${timestamp}-${random}`.toUpperCase();
};

/**
 * Create a payment order with Cregis
 * POST /api/v2/checkout
 * @param {Object} params - Payment parameters
 * @param {string} params.orderId - Unique order ID
 * @param {number} params.amount - Amount to pay
 * @param {string} params.currency - Currency code (USDT, USD, etc.)
 * @param {string} params.payerId - Payer ID
 * @param {string} params.callbackUrl - Webhook callback URL
 * @param {string} params.successUrl - Success redirect URL
 * @param {string} params.cancelUrl - Cancel redirect URL
 * @param {number} params.validTime - Valid time in minutes (10-1440)
 * @returns {Promise<Object>} Payment order data
 */
export const createPayment = async ({
  orderId,
  amount,
  currency = 'USDT',
  payerId,
  payerName = null,
  payerEmail = null,
  callbackUrl,
  successUrl,
  cancelUrl,
  validTime = 60, // 60 minutes default
  tokens = ['USDT-TRC20'], // Default to USDT TRC20
  gatewayConfig = null // Gateway config from database
}) => {
  // Declare variables outside try block so they're accessible in catch block
  let CREGIS_PROJECT_ID, CREGIS_API_KEY, CREGIS_GATEWAY_URL, CREGIS_WEBHOOK_SECRET;
  
  try {
    // Use gateway config from database if provided, otherwise use env variables
    CREGIS_PROJECT_ID = gatewayConfig?.project_id || DEFAULT_CREGIS_PROJECT_ID;
    CREGIS_API_KEY = gatewayConfig?.api_key || DEFAULT_CREGIS_API_KEY;
    CREGIS_GATEWAY_URL = gatewayConfig?.gateway_url || DEFAULT_CREGIS_GATEWAY_URL;
    CREGIS_WEBHOOK_SECRET = gatewayConfig?.webhook_secret || DEFAULT_CREGIS_WEBHOOK_SECRET;

    // Validate that gateway URL is set
    if (!CREGIS_GATEWAY_URL) {
      throw new Error('CREGIS_GATEWAY_URL is not defined. Please configure gateway_url in the database.');
    }

    const nonce = generateNonce();
    const timestamp = generateTimestamp();
    const pid = parseInt(CREGIS_PROJECT_ID, 10);

    // Build request payload
    const payload = {
      pid,
      nonce,
      timestamp,
      order_id: orderId,
      order_amount: String(parseFloat(amount)),
      order_currency: currency.toUpperCase(),
      payer_id: String(payerId),
      valid_time: validTime,
      success_url: successUrl || `${process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com'}/user/deposits/cregis-usdt-trc20`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com'}/user/deposits`,
      tokens: JSON.stringify(tokens)
    };

    // Add optional fields
    if (callbackUrl) {
      payload.callback_url = callbackUrl;
    }
    if (payerName) {
      payload.payer_name = payerName;
    }
    if (payerEmail) {
      payload.payer_email = payerEmail;
    }

    // Generate signature using API key from gateway config
    payload.sign = generateSignature(payload, CREGIS_API_KEY);

    console.log('Cregis createPayment request:', {
      url: `${CREGIS_GATEWAY_URL}/api/v2/checkout`,
      payload: { ...payload, sign: '[REDACTED]' }
    });

    // Cregis requires X-Project-Id and X-Api-Key headers
    const response = await fetch(`${CREGIS_GATEWAY_URL}/api/v2/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Id': String(CREGIS_PROJECT_ID),
        'X-Api-Key': CREGIS_API_KEY
      },
      body: JSON.stringify(payload)
    });

    let data;
    const responseText = await response.text();
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Cregis API response is not JSON:', responseText);
      throw new Error(`Invalid response from Cregis API: ${responseText.substring(0, 200)}`);
    }

    console.log('Cregis createPayment response:', {
      status: response.status,
      statusText: response.statusText,
      code: data.code,
      msg: data.msg,
      hasData: !!data.data
    });

    // Log full response for debugging
    console.log('Cregis full response:', JSON.stringify(data, null, 2));

    // Check response code (Cregis uses "00000" for success)
    if (data.code !== '00000' || !data.data) {
      const errorMsg = data.msg || data.message || `Failed to create payment: ${response.status}`;
      console.error('❌ CREGIS API ERROR ❌');
      console.error('HTTP Status:', response.status, response.statusText);
      console.error('Cregis Code:', data.code);
      console.error('Cregis Message:', data.msg);
      console.error('Full Response:', JSON.stringify(data, null, 2));
      console.error('Request URL:', `${CREGIS_GATEWAY_URL}/api/v2/checkout`);
      console.error('Request Headers:', {
        'X-Project-Id': String(CREGIS_PROJECT_ID),
        'X-Api-Key': CREGIS_API_KEY?.substring(0, 10) + '...',
        'Content-Type': 'application/json'
      });
      console.error('Request Payload (without sign):', JSON.stringify({ ...payload, sign: '[REDACTED]' }, null, 2));
      console.error('⚠️  IMPORTANT: If error is "Signature Error":');
      console.error('   1. Check if your IP is whitelisted in Cregis dashboard');
      console.error('   2. Verify API Key and Project ID are correct');
      console.error('   3. Check server logs above for all signature methods tried');
      console.error('   4. Try different signature method by changing return in generateSignature()');
      console.error('❌ END ERROR DETAILS ❌');
      throw new Error(errorMsg);
    }

    const responseData = data.data;

    // Extract payment info (first payment address for QR code)
    const firstPaymentInfo = responseData.payment_info && responseData.payment_info.length > 0
      ? responseData.payment_info[0]
      : null;

    return {
      success: true,
      data: {
        cregisId: responseData.cregis_id,
        orderId: orderId,
        checkoutUrl: responseData.checkout_url,
        paymentUrl: responseData.checkout_url, // Alias for compatibility
        // Generate QR code from payment address (preferred) or checkout URL
        qrCodeUrl: firstPaymentInfo?.payment_address 
          ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(firstPaymentInfo.payment_address)}`
          : responseData.checkout_url 
            ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(responseData.checkout_url)}`
            : null,
        paymentAddress: firstPaymentInfo?.payment_address || null,
        amount: responseData.order_amount,
        currency: responseData.order_currency,
        expiresAt: new Date(responseData.expire_time),
        createdTime: new Date(responseData.created_time),
        status: 'new', // Initial status
        paymentInfo: responseData.payment_info || []
      }
    };
  } catch (error) {
    // Use DEFAULT values if variables weren't initialized (in case of early error)
    const gatewayUrl = CREGIS_GATEWAY_URL || DEFAULT_CREGIS_GATEWAY_URL;
    const projectId = CREGIS_PROJECT_ID || DEFAULT_CREGIS_PROJECT_ID;
    
    console.error('Cregis createPayment error:', {
      message: error.message,
      stack: error.stack,
      url: `${gatewayUrl}/api/v2/checkout`,
      projectId: projectId
    });
    return {
      success: false,
      error: error.message || 'Failed to create payment order',
      details: process.env.NODE_ENV === 'development' ? {
        url: `${gatewayUrl}/api/v2/checkout`,
        error: error.message
      } : undefined
    };
  }
};

/**
 * Check payment status from Cregis
 * POST /api/v2/order/info
 * @param {string} cregisId - Cregis unique ID (cregis_id)
 * @param {Object} gatewayConfig - Gateway configuration from database (optional)
 * @returns {Promise<Object>} Payment status data
 */
export const checkPaymentStatus = async (cregisId, gatewayConfig = null) => {
  try {
    // Use gateway config from database if provided, otherwise use env variables
    const CREGIS_PROJECT_ID = gatewayConfig?.project_id || DEFAULT_CREGIS_PROJECT_ID;
    const CREGIS_API_KEY = gatewayConfig?.api_key || DEFAULT_CREGIS_API_KEY;
    const CREGIS_GATEWAY_URL = gatewayConfig?.gateway_url || DEFAULT_CREGIS_GATEWAY_URL;

    // Validate that gateway URL is set
    if (!CREGIS_GATEWAY_URL) {
      throw new Error('CREGIS_GATEWAY_URL is not defined. Please configure gateway_url in the database.');
    }

    const nonce = generateNonce();
    const timestamp = generateTimestamp();
    const pid = parseInt(CREGIS_PROJECT_ID, 10);

    const payload = {
      pid,
      nonce,
      timestamp,
      cregis_id: cregisId
    };

    // Generate signature using API key from gateway config
    payload.sign = generateSignature(payload, CREGIS_API_KEY);

    console.log('Cregis checkPaymentStatus request:', {
      url: `${CREGIS_GATEWAY_URL}/api/v2/order/info`,
      cregisId
    });

    const response = await fetch(`${CREGIS_GATEWAY_URL}/api/v2/order/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Id': String(pid),
        'X-Api-Key': CREGIS_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Cregis API response is not JSON:', responseText);
      throw new Error(`Invalid response from Cregis API: ${responseText.substring(0, 200)}`);
    }

    // Check response code
    if (data.code !== '00000' || !data.data) {
      throw new Error(
        data.msg || data.message || `Failed to check payment status: ${response.status}`
      );
    }

    const responseData = data.data;

    return {
      success: true,
      data: {
        cregisId: responseData.cregis_id,
        orderId: responseData.order_id,
        status: responseData.status, // new, paid, expired, paid_over, paid_partial
        orderAmount: responseData.order_amount,
        orderCurrency: responseData.order_currency,
        createdTime: responseData.created_time ? new Date(responseData.created_time) : null,
        transactTime: responseData.transact_time ? new Date(responseData.transact_time) : null,
        cancelTime: responseData.cancel_time ? new Date(responseData.cancel_time) : null,
        paymentDetail: responseData.payment_detail && responseData.payment_detail.length > 0
          ? responseData.payment_detail[0]
          : null,
        transactionHash: responseData.payment_detail && responseData.payment_detail.length > 0
          ? responseData.payment_detail[0].tx_id
          : null
      }
    };
  } catch (error) {
    console.error('Cregis checkPaymentStatus error:', error);
    return {
      success: false,
      error: error.message || 'Failed to check payment status'
    };
  }
};

/**
 * Verify webhook signature
 * @param {Object} payload - Webhook payload
 * @param {string} signature - Webhook signature from headers
 * @returns {boolean} True if signature is valid
 */
export const verifyWebhookSignature = (payload, signature) => {
  if (!CREGIS_WEBHOOK_SECRET) {
    // If no secret is configured, skip verification (not recommended for production)
    console.warn('Cregis webhook secret not configured, skipping signature verification');
    return true;
  }

  // Generate expected signature using same method as request signing
  const expectedSignature = generateSignature(payload);
  
  return signature === expectedSignature;
};

/**
 * Handle Cregis webhook callback
 * @param {Object} payload - Webhook payload from Cregis
 * @param {string} signature - Webhook signature (optional)
 * @returns {Promise<Object>} Processed webhook data
 */
export const handleWebhook = async (payload, signature = null) => {
  try {
    // Verify signature if provided
    if (signature && !verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    const eventName = payload.event_name;
    const eventType = payload.event_type;
    const data = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;

    if (!eventName || !eventType || !data) {
      throw new Error('Missing required webhook fields: event_name, event_type, or data');
    }

    const cregisId = data.cregis_id;
    const orderId = data.order_id;
    const status = data.status; // new, paid, expired, paid_over, paid_partial
    const txId = data.tx_id || null;

    return {
      success: true,
      data: {
        eventName,
        eventType,
        cregisId,
        orderId,
        status,
        orderAmount: data.order_amount,
        orderCurrency: data.order_currency,
        payAmount: data.pay_amount,
        payCurrency: data.pay_currency,
        receiveAmount: data.receive_amount,
        receiveCurrency: data.receive_currency,
        transactionHash: txId,
        transactTime: data.transact_time ? new Date(data.transact_time) : new Date(),
        payerId: data.payer_id,
        payerName: data.payer_name,
        payerEmail: data.payer_email,
        rawPayload: payload
      }
    };
  } catch (error) {
    console.error('Cregis handleWebhook error:', error);
    return {
      success: false,
      error: error.message || 'Failed to process webhook'
    };
  }
};

/**
 * Map Cregis status to deposit request status
 * @param {string} cregisStatus - Status from Cregis
 * @returns {string} Mapped status for deposit_requests table
 */
export const mapCregisStatusToDepositStatus = (cregisStatus) => {
  const statusMap = {
    'paid': 'approved',
    'paid_over': 'approved', // Overpaid is still approved
    'paid_partial': 'pending', // Partial payment stays pending
    'new': 'pending',
    'expired': 'rejected',
    'refunded': 'rejected'
  };

  return statusMap[cregisStatus?.toLowerCase()] || 'pending';
};

export default {
  createPayment,
  checkPaymentStatus,
  handleWebhook,
  verifyWebhookSignature,
  mapCregisStatusToDepositStatus,
  generateOrderId
};
