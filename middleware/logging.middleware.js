import { logAdminAction, logUserAction } from '../services/logging.service.js';

/**
 * Middleware to capture response data for logging
 */
export function captureResponseData(req, res, next) {
  // Store original json method
  const originalJson = res.json.bind(res);
  
  // Override json method to capture response
  res.json = function(data) {
    res.locals.responseData = data;
    return originalJson(data);
  };
  
  next();
}

/**
 * Middleware to log admin actions after response
 * Should be used after authenticateAdmin middleware
 */
export function logAdminActionMiddleware(actionType, options = {}) {
  return async (req, res, next) => {
    // Store original end method
    const originalEnd = res.end.bind(res);
    
    // Override end to log after response is sent
    res.end = function(chunk, encoding) {
      // Log asynchronously without blocking response
      setImmediate(async () => {
        try {
          const admin = req.admin || {};
          const adminId = admin.adminId || admin.id || null;
          const adminEmail = admin.email || null;
          
          // Extract target information
          const targetId = options.targetId 
            ? (typeof options.targetId === 'function' ? options.targetId(req) : options.targetId)
            : (req.params?.id || req.params?.userId || req.body?.id || null);
          
          const targetType = options.targetType || req.params?.type || 'unknown';
          const targetIdentifier = options.targetIdentifier
            ? (typeof options.targetIdentifier === 'function' ? options.targetIdentifier(req) : options.targetIdentifier)
            : (req.params?.email || req.body?.email || req.params?.accountNumber || targetId?.toString() || null);
          
          // Get before/after data if provided
          const beforeData = options.beforeData 
            ? (typeof options.beforeData === 'function' ? options.beforeData(req) : options.beforeData)
            : (req.locals?.beforeData || null);
          
          const afterData = options.afterData
            ? (typeof options.afterData === 'function' ? options.afterData(req, res) : options.afterData)
            : (res.locals?.responseData || null);
          
          const description = options.description
            ? (typeof options.description === 'function' ? options.description(req, res) : options.description)
            : null;
          
          await logAdminAction({
            adminId,
            adminEmail,
            actionType: actionType || options.actionType || req.method.toLowerCase() + '_' + req.path.replace(/\//g, '_'),
            actionCategory: options.actionCategory || null,
            targetType,
            targetId: targetId ? parseInt(targetId) : null,
            targetIdentifier: targetIdentifier?.toString() || null,
            description,
            req,
            res,
            beforeData,
            afterData
          });
        } catch (error) {
          console.error('Error in admin logging middleware:', error);
        }
      });
      
      return originalEnd(chunk, encoding);
    };
    
    next();
  };
}

/**
 * Middleware to log user actions after response
 * Should be used after authenticate middleware
 */
export function logUserActionMiddleware(actionType, options = {}) {
  return async (req, res, next) => {
    // Store original end method
    const originalEnd = res.end.bind(res);
    
    // Override end to log after response is sent
    res.end = function(chunk, encoding) {
      // Log asynchronously without blocking response
      setImmediate(async () => {
        try {
          const user = req.user || {};
          const userId = user.id || null;
          const userEmail = user.email || null;
          
          // Extract target information
          const targetId = options.targetId
            ? (typeof options.targetId === 'function' ? options.targetId(req) : options.targetId)
            : (req.params?.id || req.params?.accountNumber || req.body?.id || null);
          
          const targetType = options.targetType || req.params?.type || 'unknown';
          const targetIdentifier = options.targetIdentifier
            ? (typeof options.targetIdentifier === 'function' ? options.targetIdentifier(req) : options.targetIdentifier)
            : (req.params?.accountNumber || req.body?.accountNumber || targetId?.toString() || null);
          
          // Get before/after data if provided
          const beforeData = options.beforeData
            ? (typeof options.beforeData === 'function' ? options.beforeData(req) : options.beforeData)
            : (req.locals?.beforeData || null);
          
          const afterData = options.afterData
            ? (typeof options.afterData === 'function' ? options.afterData(req, res) : options.afterData)
            : (res.locals?.responseData || null);
          
          const description = options.description
            ? (typeof options.description === 'function' ? options.description(req, res) : options.description)
            : null;
          
          await logUserAction({
            userId,
            userEmail,
            actionType: actionType || options.actionType || req.method.toLowerCase() + '_' + req.path.replace(/\//g, '_'),
            actionCategory: options.actionCategory || null,
            targetType,
            targetId: targetId ? parseInt(targetId) : null,
            targetIdentifier: targetIdentifier?.toString() || null,
            description,
            req,
            res,
            beforeData,
            afterData
          });
        } catch (error) {
          console.error('Error in user logging middleware:', error);
        }
      });
      
      return originalEnd(chunk, encoding);
    };
    
    next();
  };
}

