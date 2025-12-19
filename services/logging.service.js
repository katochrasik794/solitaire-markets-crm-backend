import pool from '../config/database.js';

/**
 * Extract IP address from request
 */
function getIpAddress(req) {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

/**
 * Extract user agent from request
 */
function getUserAgent(req) {
  return req.headers['user-agent'] || 'unknown';
}

/**
 * Extract session ID from request
 */
function getSessionId(req) {
  return req.sessionID || req.headers['x-session-id'] || null;
}

/**
 * Determine action category from route path
 */
function getActionCategoryFromPath(path) {
  if (!path) return 'unknown';
  
  const pathLower = path.toLowerCase();
  
  // Admin categories
  if (pathLower.includes('/users') || pathLower.includes('/user/')) {
    return 'user_management';
  }
  if (pathLower.includes('/deposits') || pathLower.includes('/deposit')) {
    return 'deposit_management';
  }
  if (pathLower.includes('/withdrawals') || pathLower.includes('/withdrawal')) {
    return 'withdrawal_management';
  }
  if (pathLower.includes('/mt5') || pathLower.includes('/group')) {
    return 'mt5_management';
  }
  if (pathLower.includes('/payment-gateway') || pathLower.includes('/gateway')) {
    return 'payment_gateway';
  }
  if (pathLower.includes('/send-emails') || pathLower.includes('/email-template')) {
    return 'email_management';
  }
  if (pathLower.includes('/reports') || pathLower.includes('/report')) {
    return 'reports';
  }
  if (pathLower.includes('/kyc')) {
    return 'kyc_management';
  }
  if (pathLower.includes('/country-admin')) {
    return 'country_admin';
  }
  if (pathLower.includes('/roles') || pathLower.includes('/role')) {
    return 'role_management';
  }
  if (pathLower.includes('/settings')) {
    return 'settings';
  }
  
  // User categories
  if (pathLower.includes('/deposit')) {
    return 'deposit';
  }
  if (pathLower.includes('/withdrawal')) {
    return 'withdrawal';
  }
  if (pathLower.includes('/accounts') || pathLower.includes('/account')) {
    return 'mt5';
  }
  if (pathLower.includes('/wallet')) {
    return 'wallet';
  }
  if (pathLower.includes('/transfer')) {
    return 'transfers';
  }
  if (pathLower.includes('/report')) {
    return 'reports';
  }
  
  return 'other';
}

/**
 * Format description based on action type
 */
function formatDescription(actionType, targetType, targetIdentifier, additionalInfo = {}) {
  const actionMap = {
    // Admin actions
    'user_create': `Created user: ${targetIdentifier || 'N/A'}`,
    'user_update': `Updated user: ${targetIdentifier || 'N/A'}`,
    'user_delete': `Deleted user: ${targetIdentifier || 'N/A'}`,
    'user_verify': `Verified email for user: ${targetIdentifier || 'N/A'}`,
    'user_unverify': `Unverified email for user: ${targetIdentifier || 'N/A'}`,
    'user_ban': `Banned user: ${targetIdentifier || 'N/A'}`,
    'user_unban': `Unbanned user: ${targetIdentifier || 'N/A'}`,
    'deposit_approve': `Approved deposit #${additionalInfo.targetId || 'N/A'}`,
    'deposit_reject': `Rejected deposit #${additionalInfo.targetId || 'N/A'}`,
    'withdrawal_approve': `Approved withdrawal #${additionalInfo.targetId || 'N/A'}`,
    'withdrawal_reject': `Rejected withdrawal #${additionalInfo.targetId || 'N/A'}`,
    'mt5_account_create': `Created MT5 account: ${targetIdentifier || 'N/A'}`,
    'mt5_account_assign': `Assigned MT5 account to user: ${targetIdentifier || 'N/A'}`,
    'mt5_transfer': `Performed MT5 transfer: ${additionalInfo.amount || 'N/A'}`,
    'report_view': `Viewed report: ${additionalInfo.reportType || 'N/A'}`,
    'email_send': `Sent email to ${additionalInfo.recipientCount || 0} recipients`,
    'kyc_approve': `Approved KYC for user: ${targetIdentifier || 'N/A'}`,
    'kyc_reject': `Rejected KYC for user: ${targetIdentifier || 'N/A'}`,
    
    // User actions
    'deposit_request': `Requested deposit: $${additionalInfo.amount || '0.00'}`,
    'withdrawal_request': `Requested withdrawal: $${additionalInfo.amount || '0.00'}`,
    'mt5_account_create': `Created MT5 account: ${targetIdentifier || 'N/A'}`,
    'wallet_transfer': `Transferred $${additionalInfo.amount || '0.00'} to ${additionalInfo.target || 'N/A'}`,
    'internal_transfer': `Internal transfer: $${additionalInfo.amount || '0.00'}`,
    'balance_check': `Checked balance for account: ${targetIdentifier || 'N/A'}`,
    'report_view': `Viewed ${additionalInfo.reportType || 'report'}`,
  };
  
  if (actionMap[actionType]) {
    return actionMap[actionType];
  }
  
  // Generic description
  return `${actionType.replace(/_/g, ' ')} on ${targetType || 'unknown'}: ${targetIdentifier || 'N/A'}`;
}

/**
 * Log admin action
 */
export async function logAdminAction({
  adminId,
  adminEmail,
  actionType,
  actionCategory,
  targetType,
  targetId,
  targetIdentifier,
  description,
  req,
  res,
  beforeData = null,
  afterData = null
}) {
  try {
    const ipAddress = getIpAddress(req);
    const userAgent = getUserAgent(req);
    const sessionId = getSessionId(req);
    
    // Determine category from path if not provided
    const category = actionCategory || getActionCategoryFromPath(req.path);
    
    // Format description if not provided
    const finalDescription = description || formatDescription(actionType, targetType, targetIdentifier, {
      amount: req.body?.amount,
      reportType: req.body?.reportType || req.query?.type,
      recipientCount: res?.locals?.recipientCount
    });
    
    // Extract request body (sanitize sensitive data)
    let requestBody = null;
    if (req.body && Object.keys(req.body).length > 0) {
      requestBody = { ...req.body };
      // Remove sensitive fields
      if (requestBody.password) requestBody.password = '[REDACTED]';
      if (requestBody.password_hash) requestBody.password_hash = '[REDACTED]';
      if (requestBody.token) requestBody.token = '[REDACTED]';
    }
    
    // Extract response body
    let responseBody = null;
    if (res.locals?.responseData) {
      responseBody = res.locals.responseData;
    }
    
    await pool.query(
      `INSERT INTO logs_of_admin (
        admin_id, admin_email, action_type, action_category, target_type, target_id, 
        target_identifier, description, request_method, request_path, request_body,
        response_status, response_body, before_data, after_data, ip_address, 
        user_agent, session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        adminId,
        adminEmail,
        actionType,
        category,
        targetType,
        targetId,
        targetIdentifier,
        finalDescription,
        req.method,
        req.path,
        requestBody ? JSON.stringify(requestBody) : null,
        res.statusCode,
        responseBody ? JSON.stringify(responseBody) : null,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData ? JSON.stringify(afterData) : null,
        ipAddress,
        userAgent,
        sessionId
      ]
    );
  } catch (error) {
    // Don't throw - logging should never break the application
    console.error('Failed to log admin action:', error);
  }
}

/**
 * Log user action
 */
export async function logUserAction({
  userId,
  userEmail,
  actionType,
  actionCategory,
  targetType,
  targetId,
  targetIdentifier,
  description,
  req,
  res,
  beforeData = null,
  afterData = null
}) {
  try {
    const ipAddress = getIpAddress(req);
    const userAgent = getUserAgent(req);
    const sessionId = getSessionId(req);
    
    // Determine category from path if not provided
    const category = actionCategory || getActionCategoryFromPath(req.path);
    
    // Format description if not provided
    const finalDescription = description || formatDescription(actionType, targetType, targetIdentifier, {
      amount: req.body?.amount,
      reportType: req.body?.reportType || req.query?.type
    });
    
    // Extract request body (sanitize sensitive data)
    let requestBody = null;
    if (req.body && Object.keys(req.body).length > 0) {
      requestBody = { ...req.body };
      // Remove sensitive fields
      if (requestBody.password) requestBody.password = '[REDACTED]';
      if (requestBody.password_hash) requestBody.password_hash = '[REDACTED]';
      if (requestBody.token) requestBody.token = '[REDACTED]';
    }
    
    // Extract response body
    let responseBody = null;
    if (res.locals?.responseData) {
      responseBody = res.locals.responseData;
    }
    
    await pool.query(
      `INSERT INTO logs_of_users (
        user_id, user_email, action_type, action_category, target_type, target_id,
        target_identifier, description, request_method, request_path, request_body,
        response_status, response_body, before_data, after_data, ip_address,
        user_agent, session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        userId,
        userEmail,
        actionType,
        category,
        targetType,
        targetId,
        targetIdentifier,
        finalDescription,
        req.method,
        req.path,
        requestBody ? JSON.stringify(requestBody) : null,
        res.statusCode,
        responseBody ? JSON.stringify(responseBody) : null,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData ? JSON.stringify(afterData) : null,
        ipAddress,
        userAgent,
        sessionId
      ]
    );
  } catch (error) {
    // Don't throw - logging should never break the application
    console.error('Failed to log user action:', error);
  }
}

