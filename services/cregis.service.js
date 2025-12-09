import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

/**
 * Cregis Payment Gateway Service
 * API Documentation: https://t-fumzndoo.cregis.io
 */

const CREGIS_PROJECT_ID = process.env.CREGIS_PROJECT_ID || '1445920661479424';
const CREGIS_API_KEY = process.env.CREGIS_API_KEY || '0794b200b7d34acca7c06a72ee2cf58c';
const CREGIS_GATEWAY_URL = process.env.CREGIS_GATEWAY_URL || 'https://t-fumzndoo.cregis.io';
const CREGIS_WEBHOOK_SECRET = process.env.CREGIS_WEBHOOK_SECRET || '';

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
const generateSignature = (params) => {
  // Remove sign from params if present
  const { sign, ...paramsToSign } = params;
  
  // DON'T filter null/undefined - include ALL parameters that are in payload
  // Sort parameters by key alphabetically
  const sortedKeys = Object.keys(paramsToSign).sort();
  
  // Method 1: Query string format (most common for payment gateways)
  const queryString = sortedKeys
    .map(key => {
      let value = paramsToSign[key];
      
      // Convert to string - keep as-is if already string (like tokens JSON)
      if (value === null || value === undefined) {
        value = '';
      } else if (typeof value === 'string') {
        value = value; // Keep as-is (tokens is already JSON string)
      } else if (typeof value === 'object') {
        value = JSON.stringify(value);
      } else {
        value = String(value);
      }
      
      return `${key}=${value}`;
    })
    .join('&');
  
  console.log('=== SIGNATURE DEBUG ===');
  console.log('Full query string:', queryString);
  console.log('Query string length:', queryString.length);
  console.log('Parameters:', sortedKeys);
  console.log('API Key (first 15):', CREGIS_API_KEY?.substring(0, 15) + '...');
  
  // Method 1: HMAC-SHA256 with query string (standard for most payment gateways)
  const signature1 = crypto
    .createHmac('sha256', CREGIS_API_KEY)
    .update(queryString)
    .digest('hex');
  
  // Method 2: HMAC-SHA256 with query string + API key appended (some APIs use this)
  const signature2 = crypto
    .createHmac('sha256', CREGIS_API_KEY)
    .update(queryString + CREGIS_API_KEY)
    .digest('hex');
  
  // Method 3: Sign the sorted JSON object (some APIs use this)
  const sortedObj = {};
  sortedKeys.forEach(key => {
    sortedObj[key] = paramsToSign[key];
  });
  const jsonString = JSON.stringify(sortedObj);
  const signature3 = crypto
    .createHmac('sha256', CREGIS_API_KEY)
    .update(jsonString)
    .digest('hex');
  
  // Method 4: MD5 hash (older APIs)
  const signature4 = crypto
    .createHash('md5')
    .update(queryString + CREGIS_API_KEY)
    .digest('hex');
  
  // Method 5: Query string with "key" parameter added
  const queryStringWithKey = queryString + '&key=' + CREGIS_API_KEY;
  const signature5 = crypto
    .createHmac('sha256', CREGIS_API_KEY)
    .update(queryStringWithKey)
    .digest('hex');
  
  // Method 6: Simple MD5 of query string only
  const signature6 = crypto
    .createHash('md5')
    .update(queryString)
    .digest('hex');
  
  console.log('=== ALL SIGNATURE METHODS ===');
  console.log('Method 1 (SHA256 query):', signature1);
  console.log('Method 2 (SHA256 query+key):', signature2);
  console.log('Method 3 (SHA256 JSON):', signature3);
  console.log('Method 4 (MD5 query+key):', signature4);
  console.log('Method 5 (SHA256 query+key param):', signature5);
  console.log('Method 6 (MD5 query only):', signature6);
  console.log('=== END SIGNATURE DEBUG ===');
  
  // Try Method 1 first (most standard)
  // If it fails, check server logs and change return to try other methods
  console.log('Using Signature Method 1 (SHA256 query string)');
  return signature1;
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
  tokens = ['USDT-TRC20'] // Default to USDT TRC20
}) => {
  try {
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
      success_url: successUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/user/deposits/cregis-usdt-trc20`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/user/deposits`,
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

    // Generate signature
    payload.sign = generateSignature(payload);

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
    console.error('Cregis createPayment error:', {
      message: error.message,
      stack: error.stack,
      url: `${CREGIS_GATEWAY_URL}/api/v2/checkout`,
      projectId: CREGIS_PROJECT_ID
    });
    return {
      success: false,
      error: error.message || 'Failed to create payment order',
      details: process.env.NODE_ENV === 'development' ? {
        url: `${CREGIS_GATEWAY_URL}/api/v2/checkout`,
        error: error.message
      } : undefined
    };
  }
};

/**
 * Check payment status from Cregis
 * POST /api/v2/order/info
 * @param {string} cregisId - Cregis unique ID (cregis_id)
 * @returns {Promise<Object>} Payment status data
 */
export const checkPaymentStatus = async (cregisId) => {
  try {
    const nonce = generateNonce();
    const timestamp = generateTimestamp();
    const pid = parseInt(CREGIS_PROJECT_ID, 10);

    const payload = {
      pid,
      nonce,
      timestamp,
      cregis_id: cregisId
    };

    // Generate signature
    payload.sign = generateSignature(payload);

    console.log('Cregis checkPaymentStatus request:', {
      url: `${CREGIS_GATEWAY_URL}/api/v2/order/info`,
      cregisId
    });

    const response = await fetch(`${CREGIS_GATEWAY_URL}/api/v2/order/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
