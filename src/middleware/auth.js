import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import OrganizationMember from '../models/OrganizationMember.js';
import logger from '../utils/logger.js';
import { ROLES, AUTH_MESSAGES } from '../constants.js';

/**
 * Protect routes - verify JWT token and resolve current org + role from membership
 */
export const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: AUTH_MESSAGES.NO_TOKEN,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const organizationId = decoded.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        message: AUTH_MESSAGES.TOKEN_INVALID,
      });
    }

    const user = await User.findById(userId).select('-password').lean();
    if (!user) {
      return res.status(401).json({
        success: false,
        message: AUTH_MESSAGES.USER_NOT_FOUND,
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: AUTH_MESSAGES.USER_DEACTIVATED,
      });
    }

    const membership = await OrganizationMember.findOne({
      userId,
      organizationId,
    })
      .populate({
        path: 'roleId',
        populate: { path: 'permissions' },
      })
      .lean();

    if (!membership) {
      return res.status(401).json({
        success: false,
        message: AUTH_MESSAGES.TOKEN_INVALID,
      });
    }

    const role = membership.roleId;
    const permissions = role?.permissions?.map((p) => p.name) || [];

    req.user = {
      ...user,
      id: user._id,
      organizationId,
      role,
      permissions,
    };
    next();
  } catch (error) {
    logger.error('Auth middleware error', { error: error.message });
    return res.status(401).json({
      success: false,
      message: AUTH_MESSAGES.TOKEN_INVALID,
    });
  }
};

/**
 * Restrict routes to specific roles (by role name)
 */
export const authorize = (...roleNames) => {
  return (req, res, next) => {
    const userRoleName = req.user.role?.name;
    if (!roleNames.includes(userRoleName)) {
      return res.status(403).json({
        success: false,
        message: AUTH_MESSAGES.ROLE_NOT_AUTHORIZED(userRoleName),
      });
    }
    next();
  };
};

/**
 * Check if user has specific permission
 */
export const hasPermission = (permission) => {
  return (req, res, next) => {
    if (req.user.role?.name === ROLES.ADMIN) {
      return next();
    }
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: AUTH_MESSAGES.PERMISSION_DENIED(permission),
      });
    }
    next();
  };
};

/**
 * Check if user has any of the specified permissions
 */
export const hasAnyPermission = (...permissions) => {
  return (req, res, next) => {
    if (req.user.role?.name === ROLES.ADMIN) {
      return next();
    }
    const hasAny = permissions.some((p) => req.user.permissions?.includes(p));
    if (!hasAny) {
      return res.status(403).json({
        success: false,
        message: AUTH_MESSAGES.PERMISSION_DENIED_ANY,
      });
    }
    next();
  };
};

/**
 * Generate JWT token with userId and organizationId
 * @param {string} userId - User ID
 * @param {string} organizationId - Organization ID
 * @returns {string} JWT token
 */
export const generateToken = (userId, organizationId) => {
  return jwt.sign(
    { id: userId, organizationId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

export default {
  protect,
  authorize,
  generateToken,
  hasPermission,
  hasAnyPermission,
};
