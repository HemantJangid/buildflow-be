import User from '../models/User.js';
import Role from '../models/Role.js';
import Organization from '../models/Organization.js';
import OrganizationMember from '../models/OrganizationMember.js';
import { USER_CATEGORIES, ROLES } from '../constants.js';
import { generateToken } from '../middleware/auth.js';
import { seedDefaultRolesForOrg } from '../utils/seedDefaultRolesForOrg.js';
import logger from '../utils/logger.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';

/**
 * @desc    Signup - create organization + first admin user (public)
 * @route   POST /api/auth/signup
 * @access  Public
 */
export const signup = async (req, res) => {
  try {
    const { organizationName, organizationSlug, name, email, password } = req.body;

    const slug =
      organizationSlug?.trim() ||
      organizationName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Organization name must contain at least one letter or number',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    const existingOrg = await Organization.findOne({ slug });
    if (existingOrg) {
      return res.status(400).json({
        success: false,
        message: 'Organization with this slug already exists',
      });
    }

    const org = await Organization.create({
      name: organizationName.trim(),
      slug,
      isActive: true,
    });

    const roleMap = await seedDefaultRolesForOrg(org._id);
    const adminRoleId = roleMap[ROLES.ADMIN];
    if (!adminRoleId) {
      await Organization.findByIdAndDelete(org._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to create default roles for organization',
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      minWorkHours: 8,
    });

    await OrganizationMember.create({
      userId: user._id,
      organizationId: org._id,
      roleId: adminRoleId,
      isDefault: true,
    });

    const token = generateToken(user._id, org._id);
    const membership = await OrganizationMember.findOne({
      userId: user._id,
      organizationId: org._id,
    }).populate({
      path: 'roleId',
      populate: { path: 'permissions' },
    });
    const role = membership.roleId;
    const permissions = role?.permissions?.map((p) => p.name) || [];

    res.status(201).json({
      success: true,
      message: 'Organization and account created successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role,
        permissions,
        organizationId: org._id,
        organizationName: org.name,
        token,
      },
    });
  } catch (error) {
    logger.error('Signup error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during signup',
    });
  }
};

/**
 * @desc    Register a new user in current org (Admin only)
 * @route   POST /api/auth/register
 * @access  Private/Admin
 */
export const register = async (req, res) => {
  try {
    const { name, email, password, roleId, minWorkHours, category, metadata } = req.body;
    const organizationId = req.user.organizationId;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    const role = await Role.findOne({
      _id: roleId,
      organizationId,
    });
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified',
      });
    }
    if (!role.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign inactive role',
      });
    }

    if (category && !USER_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `category must be one of: ${USER_CATEGORIES.join(', ')}`,
      });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password,
      minWorkHours: minWorkHours || 8,
      category: category || undefined,
      metadata: metadata || {},
    });

    await OrganizationMember.create({
      userId: user._id,
      organizationId,
      roleId: role._id,
      isDefault: true,
    });

    const membership = await OrganizationMember.findOne({
      userId: user._id,
      organizationId,
    }).populate('roleId', 'name description');

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: membership.roleId,
        category: user.category,
        minWorkHours: user.minWorkHours,
        metadata: user.metadata,
      },
    });
  } catch (error) {
    logger.error('Register error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
    });
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account is deactivated',
      });
    }

    const membership = await OrganizationMember.findOne({
      userId: user._id,
    })
      .sort({ isDefault: -1 })
      .populate({
        path: 'roleId',
        populate: { path: 'permissions' },
      });

    if (!membership) {
      return res.status(401).json({
        success: false,
        message: 'User is not a member of any organization',
      });
    }

    const organizationId = membership.organizationId;
    const role = membership.roleId;
    const permissions = role?.permissions?.map((p) => p.name) || [];

    const token = generateToken(user._id, organizationId);

    const org = await Organization.findById(organizationId).select('name').lean();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role,
        permissions,
        organizationId,
        organizationName: org?.name,
        metadata: user.metadata,
        token,
      },
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during login',
    });
  }
};

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const org = await Organization.findById(req.user.organizationId).select('name').lean();

    res.status(200).json({
      success: true,
      data: {
        ...user,
        id: user._id,
        role: req.user.role,
        permissions: req.user.permissions,
        organizationId: req.user.organizationId,
        organizationName: org?.name,
      },
    });
  } catch (error) {
    logger.error('Get me error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Update user metadata (Admin only)
 * @route   PUT /api/auth/users/:id/metadata
 * @access  Private/Admin
 */
export const updateUserMetadata = async (req, res) => {
  try {
    const { metadata } = req.body;
    const userId = req.params.id;
    const organizationId = req.user.organizationId;

    const isInOrg = await OrganizationMember.findOne({
      userId,
      organizationId,
    });
    if (!isInOrg) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.metadata = { ...user.metadata.toObject(), ...metadata };
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User metadata updated successfully',
      data: user,
    });
  } catch (error) {
    logger.error('Update metadata error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during metadata update',
    });
  }
};

/**
 * @desc    Get user options for dropdowns (slim: _id, name, email, role.name)
 * @route   GET /api/auth/users/options
 * @access  Private (USERS_READ)
 */
export const getUserOptions = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const memberships = await OrganizationMember.find({ organizationId })
      .populate('userId', 'name email isActive')
      .populate('roleId', 'name')
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();

    const users = memberships
      .filter((m) => m.userId)
      .map((m) => {
        const u = typeof m.userId === 'object' ? m.userId : {};
        const r = typeof m.roleId === 'object' ? m.roleId : null;
        return {
          _id: u._id ?? m.userId,
          name: u.name,
          email: u.email,
          isActive: u.isActive,
          role: r ? { name: r.name } : null,
        };
      });

    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    logger.error('Get user options error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Get all users in current org – paginated, with search and filters
 * @route   GET /api/auth/users?page=1&limit=10&search=&searchBy=name&roleId=&category=&status=
 * @access  Private/Admin/Manager
 */
export const getAllUsers = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const { page, limit, skip } = getPagination(req.query, 10);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const searchBy = req.query.searchBy === 'email' ? 'email' : 'name';
    const roleId = req.query.roleId || null;
    const category = req.query.category && USER_CATEGORIES.includes(req.query.category) ? req.query.category : null;
    const status = req.query.status; // 'active' | 'inactive' | omit = all

    // Determine organization owner as the first Admin member created in this org
    const ownerMembership = await OrganizationMember.findOne({ organizationId })
      .populate('roleId', 'name')
      .sort({ createdAt: 1 })
      .lean();

    const ownerUserId =
      ownerMembership &&
      ownerMembership.roleId &&
      ownerMembership.roleId.name === ROLES.ADMIN
        ? (ownerMembership.userId?._id || ownerMembership.userId)?.toString()
        : null;

    let allowedUserIds = await OrganizationMember.find({ organizationId }).distinct('userId');

    if (search) {
      const matching = await User.find({
        _id: { $in: allowedUserIds },
        [searchBy]: { $regex: search, $options: 'i' },
      })
        .select('_id')
        .lean();
      allowedUserIds = matching.map((u) => u._id);
    }
    if (category) {
      const matching = await User.find({
        _id: { $in: allowedUserIds },
        category,
      })
        .select('_id')
        .lean();
      allowedUserIds = matching.map((u) => u._id);
    }
    if (status === 'active') {
      const matching = await User.find({
        _id: { $in: allowedUserIds },
        isActive: true,
      })
        .select('_id')
        .lean();
      allowedUserIds = matching.map((u) => u._id);
    } else if (status === 'inactive') {
      const matching = await User.find({
        _id: { $in: allowedUserIds },
        isActive: false,
      })
        .select('_id')
        .lean();
      allowedUserIds = matching.map((u) => u._id);
    }

    const memberFilter = { organizationId, userId: { $in: allowedUserIds } };
    if (roleId) memberFilter.roleId = roleId;

    const memberships = await OrganizationMember.find(memberFilter)
      .populate('userId', 'name email minWorkHours category metadata isActive')
      .populate('roleId', 'name description')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await OrganizationMember.countDocuments(memberFilter);

    const users = memberships
      .filter((m) => m.userId)
      .map((m) => ({
        ...(typeof m.userId === 'object' ? m.userId : {}),
        id: m.userId._id ?? m.userId,
        role: m.roleId,
        isOrgOwner:
          ownerUserId &&
          ((m.userId._id ?? m.userId)?.toString() === ownerUserId),
      }));

    return paginatedResponse(res, { data: users, total, page, limit });
  } catch (error) {
    logger.error('Get all users error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Update user in current org (Admin only)
 * @route   PUT /api/auth/users/:id
 * @access  Private/Admin
 */
export const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, roleId, minWorkHours, category, metadata, isActive } = req.body;
    const organizationId = req.user.organizationId;

    const membership = await OrganizationMember.findOne({
      userId,
      organizationId,
    });
    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (name) user.name = name;
    if (minWorkHours !== undefined) user.minWorkHours = minWorkHours;
    if (category !== undefined) {
      if (category && !USER_CATEGORIES.includes(category)) {
        return res.status(400).json({
          success: false,
          message: `category must be one of: ${USER_CATEGORIES.join(', ')}`,
        });
      }
      user.category = category || undefined;
    }
    if (metadata) {
      user.metadata = { ...user.metadata.toObject(), ...metadata };
    }
    if (typeof isActive === 'boolean') user.isActive = isActive;

    // Prevent changing role for the organization owner (first Admin member)
    if (roleId) {
      const ownerMembership = await OrganizationMember.findOne({ organizationId })
        .populate('roleId', 'name')
        .sort({ createdAt: 1 })
        .lean();

      const isOrgOwner =
        ownerMembership &&
        ownerMembership.roleId &&
        ownerMembership.roleId.name === ROLES.ADMIN &&
        (ownerMembership.userId?._id || ownerMembership.userId)?.toString() ===
          userId.toString();

      if (isOrgOwner && roleId.toString() !== membership.roleId.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Role for the organization owner cannot be changed',
        });
      }

      const role = await Role.findOne({
        _id: roleId,
        organizationId,
      });
      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role specified',
        });
      }
      membership.roleId = role._id;
      await membership.save();
    }

    await user.save();

    const updatedMembership = await OrganizationMember.findOne({
      userId,
      organizationId,
    }).populate('roleId', 'name description');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        ...user.toObject(),
        id: user._id,
        role: updatedMembership.roleId,
      },
    });
  } catch (error) {
    logger.error('Update user error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during user update',
    });
  }
};

export default {
  signup,
  register,
  login,
  getMe,
  updateUserMetadata,
  getUserOptions,
  getAllUsers,
  updateUser,
};
