import Role from '../models/Role.js';
import Permission from '../models/Permission.js';
import OrganizationMember from '../models/OrganizationMember.js';
import logger from '../utils/logger.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';

/**
 * @desc    Get all permissions
 * @route   GET /api/roles/permissions
 * @access  Private/Admin
 */
export const getAllPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find().sort({ category: 1, name: 1 });

    // Group permissions by category
    const grouped = permissions.reduce((acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      count: permissions.length,
      data: permissions,
      grouped,
    });
  } catch (error) {
    logger.error('Get permissions error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Create a new role
 * @route   POST /api/roles
 * @access  Private/Admin
 */
export const createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const organizationId = req.user.organizationId;

    const existingRole = await Role.findOne({
      organizationId,
      name: { $regex: new RegExp(`^${name}$`, 'i') },
    });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Role with this name already exists',
      });
    }

    if (permissions && permissions.length > 0) {
      const validPermissions = await Permission.find({ _id: { $in: permissions } });
      if (validPermissions.length !== permissions.length) {
        return res.status(400).json({
          success: false,
          message: 'Some permissions are invalid',
        });
      }
    }

    const role = await Role.create({
      organizationId,
      name,
      description,
      permissions: permissions || [],
      isSystem: false,
    });

    await role.populate('permissions');

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: role,
    });
  } catch (error) {
    logger.error('Create role error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during role creation',
    });
  }
};

/**
 * @desc    Get role options for dropdowns (slim: _id, name, isActive)
 * @route   GET /api/roles/options
 * @access  Private (ROLES_READ)
 */
export const getRoleOptions = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const organizationId = req.user.organizationId;
    const query = { organizationId };
    if (!includeInactive || includeInactive !== 'true') {
      query.isActive = true;
    }
    const roles = await Role.find(query)
      .select('_id name isActive')
      .sort({ isSystem: -1, name: 1 })
      .limit(500)
      .lean();
    return res.status(200).json({ success: true, data: roles });
  } catch (error) {
    logger.error('Get role options error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Get all roles – paginated
 * @route   GET /api/roles?page=1&limit=10&includeInactive=true
 * @access  Private/Admin
 */
export const getAllRoles = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const organizationId = req.user.organizationId;
    const { page, limit, skip } = getPagination(req.query, 10);

    const query = { organizationId };
    if (!includeInactive) {
      query.isActive = true;
    }

    const [roles, total] = await Promise.all([
      Role.find(query)
        .populate('permissions')
        .sort({ isSystem: -1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Role.countDocuments(query),
    ]);

    return paginatedResponse(res, { data: roles, total, page, limit });
  } catch (error) {
    logger.error('Get roles error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Get single role
 * @route   GET /api/roles/:id
 * @access  Private/Admin
 */
export const getRole = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const role = await Role.findOne({
      _id: req.params.id,
      organizationId,
    }).populate('permissions');

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    res.status(200).json({
      success: true,
      data: role,
    });
  } catch (error) {
    logger.error('Get role error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Update role
 * @route   PUT /api/roles/:id
 * @access  Private/Admin
 */
export const updateRole = async (req, res) => {
  try {
    const { name, description, permissions, isActive } = req.body;
    const organizationId = req.user.organizationId;

    const role = await Role.findOne({
      _id: req.params.id,
      organizationId,
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    // Don't allow modifying system role names
    if (role.isSystem && name && name !== role.name) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify system role name',
      });
    }

    // Validate permissions exist
    if (permissions && permissions.length > 0) {
      const validPermissions = await Permission.find({ _id: { $in: permissions } });
      if (validPermissions.length !== permissions.length) {
        return res.status(400).json({
          success: false,
          message: 'Some permissions are invalid',
        });
      }
    }

    // Update fields
    if (name && !role.isSystem) role.name = name;
    if (description !== undefined) role.description = description;
    if (permissions !== undefined) role.permissions = permissions;
    if (isActive !== undefined && !role.isSystem) role.isActive = isActive;

    await role.save();
    await role.populate('permissions');

    res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      data: role,
    });
  } catch (error) {
    logger.error('Update role error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during role update',
    });
  }
};

/**
 * @desc    Delete role (soft delete)
 * @route   DELETE /api/roles/:id
 * @access  Private/Admin
 */
export const deleteRole = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const role = await Role.findOne({
      _id: req.params.id,
      organizationId,
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    if (role.isSystem) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete system roles',
      });
    }

    const membersWithRole = await OrganizationMember.countDocuments({
      organizationId,
      roleId: role._id,
    });
    if (membersWithRole > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${membersWithRole} user(s) are assigned to this role.`,
      });
    }

    // Soft delete
    role.isActive = false;
    await role.save();

    res.status(200).json({
      success: true,
      message: 'Role deactivated successfully',
    });
  } catch (error) {
    logger.error('Delete role error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during role deletion',
    });
  }
};

/**
 * @desc    Assign role to user
 * @route   PUT /api/roles/assign/:userId
 * @access  Private/Admin
 */
export const assignRoleToUser = async (req, res) => {
  try {
    const { roleId } = req.body;
    const { userId } = req.params;
    const organizationId = req.user.organizationId;

    const membership = await OrganizationMember.findOne({
      userId,
      organizationId,
    });
    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'User not found in this organization',
      });
    }

    const role = await Role.findOne({
      _id: roleId,
      organizationId,
    });
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    if (!role.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign inactive role',
      });
    }

    membership.roleId = roleId;
    await membership.save();
    await membership.populate('roleId', 'name description');

    res.status(200).json({
      success: true,
      message: 'Role assigned successfully',
      data: { role: membership.roleId },
    });
  } catch (error) {
    logger.error('Assign role error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during role assignment',
    });
  }
};

export default {
  getAllPermissions,
  createRole,
  getRoleOptions,
  getAllRoles,
  getRole,
  updateRole,
  deleteRole,
  assignRoleToUser,
};
