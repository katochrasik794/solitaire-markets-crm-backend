import pool from '../config/database.js';

/**
 * Middleware to check if admin has permission for a specific feature action
 * @param {string} featureKey - The feature path/key (e.g., 'deposits', 'withdrawals', 'email-templates')
 * @param {string} action - The action to check ('view', 'add', 'edit', 'delete')
 * @returns {Function} Express middleware function
 */
export const requireAdminFeaturePermission = (featureKey, action) => {
  return async (req, res, next) => {
    try {
      const adminId = req.admin?.adminId || req.admin?.id;

      if (!adminId) {
        return res.status(401).json({
          ok: false,
          success: false,
          error: 'Admin authentication required'
        });
      }

      // Superadmin bypasses all permission checks
      const adminCheck = await pool.query(
        'SELECT admin_role FROM admin WHERE id = $1',
        [adminId]
      );

      if (adminCheck.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          success: false,
          error: 'Admin not found'
        });
      }

      const adminRole = adminCheck.rows[0].admin_role;
      if (adminRole === 'superadmin') {
        // Superadmin has all permissions
        return next();
      }

      // Get admin's feature permissions
      const permResult = await pool.query(
        'SELECT feature_permissions FROM admin WHERE id = $1',
        [adminId]
      );

      if (permResult.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          success: false,
          error: 'Admin not found'
        });
      }

      const featurePermissions = permResult.rows[0].feature_permissions || {};

      // Normalize feature key (handle different path formats)
      const normalizeFeatureKey = (key) => {
        if (!key) return '';
        // Remove leading/trailing slashes and get the last part
        return key.replace(/^\/admin\//, '').replace(/^\//, '').replace(/\/$/, '').split('/').pop() || key;
      };

      const normalizedFeatureKey = normalizeFeatureKey(featureKey);
      
      // Check if feature has permissions defined
      const featurePerms = featurePermissions[normalizedFeatureKey] || featurePermissions[featureKey] || {};

      // Default all permissions to false if not explicitly set
      const hasPermission = featurePerms[action] === true;

      if (!hasPermission) {
        return res.status(403).json({
          ok: false,
          success: false,
          error: `You do not have permission to ${action} ${featureKey}`,
          requiredPermission: `${featureKey}:${action}`
        });
      }

      // Permission granted
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        ok: false,
        success: false,
        error: 'Failed to check permissions'
      });
    }
  };
};

/**
 * Helper function to check if admin has permission (for use in route handlers)
 * @param {number} adminId - Admin ID
 * @param {string} featureKey - Feature key
 * @param {string} action - Action to check
 * @returns {Promise<boolean>} True if admin has permission
 */
export const checkAdminFeaturePermission = async (adminId, featureKey, action) => {
  try {
    // Superadmin always has permission
    const adminCheck = await pool.query(
      'SELECT admin_role, feature_permissions FROM admin WHERE id = $1',
      [adminId]
    );

    if (adminCheck.rows.length === 0) {
      return false;
    }

    const adminRole = adminCheck.rows[0].admin_role;
    if (adminRole === 'superadmin') {
      return true;
    }

    const featurePermissions = adminCheck.rows[0].feature_permissions || {};
    
    // Normalize feature key
    const normalizeFeatureKey = (key) => {
      if (!key) return '';
      return key.replace(/^\/admin\//, '').replace(/^\//, '').replace(/\/$/, '').split('/').pop() || key;
    };

    const normalizedFeatureKey = normalizeFeatureKey(featureKey);
    const featurePerms = featurePermissions[normalizedFeatureKey] || featurePermissions[featureKey] || {};

    return featurePerms[action] === true;
  } catch (error) {
    console.error('Check permission error:', error);
    return false;
  }
};

