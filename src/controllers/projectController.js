import { ROLES } from '../constants.js';
import Project from '../models/Project.js';
import ProjectMember from '../models/ProjectMember.js';
import OrganizationMember from '../models/OrganizationMember.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';

/**
 * @desc    Create a new project
 * @route   POST /api/projects
 * @access  Private/Admin/Manager
 */
export const createProject = async (req, res) => {
  try {
    const { name, location, radius, description } = req.body;

    const project = await Project.create({
      organizationId: req.user.organizationId,
      name,
      location,
      radius: radius || 100,
      description,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project,
    });
  } catch (error) {
    logger.error('Create project error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during project creation',
    });
  }
};

/**
 * @desc    Get all projects (paginated)
 * @route   GET /api/projects?page=1&limit=10&isActive=true
 * @access  Private
 */
export const getAllProjects = async (req, res) => {
  try {
    const { isActive } = req.query;
    const userId = req.user.id;
    const { page, limit, skip } = getPagination(req.query, 10);

    const organizationId = req.user.organizationId;
    const query = { organizationId };
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Admin sees all org projects; others only projects they are assigned to (via project membership)
    if (req.user.role?.name !== ROLES.ADMIN) {
      const memberships = await ProjectMember.find({ userId, organizationId, isActive: true }).select('projectId');
      const projectIds = [...new Set(memberships.map((m) => m.projectId.toString()))];

      if (projectIds.length === 0) {
        return paginatedResponse(res, { data: [], total: 0, page, limit });
      }

      query._id = { $in: projectIds };
    }

    const [projects, total] = await Promise.all([
      Project.find(query)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Project.countDocuments(query),
    ]);

    return paginatedResponse(res, { data: projects, total, page, limit });
  } catch (error) {
    logger.error('Get projects error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Get project options for dropdowns (minimal: _id, name only)
 * @route   GET /api/projects/options?isActive=true
 * @access  Private (same as PROJECTS_READ; admin sees all, others see assigned only)
 */
export const getProjectOptions = async (req, res) => {
  try {
    const { isActive } = req.query;
    const userId = req.user.id;
    const organizationId = req.user.organizationId;
    const query = { organizationId };
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    if (req.user.role?.name !== ROLES.ADMIN) {
      const memberships = await ProjectMember.find({ userId, organizationId, isActive: true }).select('projectId');
      const projectIds = [...new Set(memberships.map((m) => m.projectId.toString()))];
      if (projectIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }
      query._id = { $in: projectIds };
    }
    const projects = await Project.find(query)
      .select('_id name')
      .sort({ name: 1 })
      .limit(1000)
      .lean();
    return res.status(200).json({ success: true, data: projects });
  } catch (error) {
    logger.error('Get project options error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Get single project
 * @route   GET /api/projects/:id
 * @access  Private
 */
export const getProject = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const project = await Project.findOne({
      _id: req.params.id,
      organizationId,
    }).populate('createdBy', 'name email');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Admin can view any org project; others must be a member of this project
    if (req.user.role?.name !== ROLES.ADMIN) {
      const membership = await ProjectMember.findOne({
        userId: req.user.id,
        organizationId,
        projectId: project._id,
        isActive: true,
      });
      if (!membership) {
        return res.status(404).json({
          success: false,
          message: 'Project not found',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    logger.error('Get project error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Update project
 * @route   PUT /api/projects/:id
 * @access  Private/Admin/Manager
 */
export const updateProject = async (req, res) => {
  try {
    const { name, location, radius, description, isActive } = req.body;
    const organizationId = req.user.organizationId;

    const project = await Project.findOne({
      _id: req.params.id,
      organizationId,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Update fields
    if (name) project.name = name;
    if (location) project.location = location;
    if (radius !== undefined) project.radius = radius;
    if (description !== undefined) project.description = description;
    if (isActive !== undefined) project.isActive = isActive;

    await project.save();

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data: project,
    });
  } catch (error) {
    logger.error('Update project error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during project update',
    });
  }
};

/**
 * @desc    Delete project (soft delete)
 * @route   DELETE /api/projects/:id
 * @access  Private/Admin
 */
export const deleteProject = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const project = await Project.findOne({
      _id: req.params.id,
      organizationId,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Soft delete
    project.isActive = false;
    await project.save();

    res.status(200).json({
      success: true,
      message: 'Project deactivated successfully',
    });
  } catch (error) {
    logger.error('Delete project error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during project deletion',
    });
  }
};

/**
 * @desc    Get users that can be added to this project (active users not already members)
 * @route   GET /api/projects/:id/available-users
 * @access  Private (PROJECTS_READ – same as viewing project; for add-member dropdown)
 */
export const getProjectAvailableUsers = async (req, res) => {
  try {
    const projectId = req.params.id;
    const organizationId = req.user.organizationId;
    const project = await Project.findOne({ _id: projectId, organizationId });
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    if (req.user.role?.name !== ROLES.ADMIN) {
      const myMembership = await ProjectMember.findOne({
        userId: req.user.id,
        organizationId,
        projectId,
        isActive: true,
      });
      if (!myMembership) {
        return res.status(404).json({
          success: false,
          message: 'Project not found',
        });
      }
    }

    const memberUserIds = await ProjectMember.find({
      projectId,
      organizationId,
      isActive: true,
    })
      .distinct('userId');

    const orgMemberUserIds = await OrganizationMember.find({ organizationId }).distinct('userId');
    const users = await User.find({
      isActive: true,
      _id: { $in: orgMemberUserIds, $nin: memberUserIds },
    })
      .select('_id name email')
      .sort({ name: 1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    logger.error('Get project available users error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Get project members (workers assigned to project) – paginated
 * @route   GET /api/projects/:id/members?page=1&limit=10
 * @access  Private (project read)
 */
export const getProjectMembers = async (req, res) => {
  try {
    const projectId = req.params.id;
    const organizationId = req.user.organizationId;
    const { page, limit, skip } = getPagination(req.query, 10);

    const project = await Project.findOne({ _id: projectId, organizationId });
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Non-admin: must be a member of this project
    if (req.user.role?.name !== ROLES.ADMIN) {
      const myMembership = await ProjectMember.findOne({
        userId: req.user.id,
        organizationId,
        projectId,
        isActive: true,
      });
      if (!myMembership) {
        return res.status(404).json({
          success: false,
          message: 'Project not found',
        });
      }
    }

    const baseQuery = { projectId, organizationId, isActive: true };
    const [members, total] = await Promise.all([
      ProjectMember.find(baseQuery)
        .populate('userId', 'name email category minWorkHours')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProjectMember.countDocuments(baseQuery),
    ]);

    const data = members.map((m) => ({
      _id: m._id,
      userId: m.userId,
      projectId: m.projectId,
      minWorkHours: m.minWorkHours,
      isActive: m.isActive,
      createdAt: m.createdAt,
    }));

    return paginatedResponse(res, { data, total, page, limit });
  } catch (error) {
    logger.error('Get project members error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Add a worker to a project
 * @route   POST /api/projects/:id/members
 * @access  Private (project update)
 */
export const addProjectMember = async (req, res) => {
  try {
    const projectId = req.params.id;
    const organizationId = req.user.organizationId;
    const { userId, minWorkHours } = req.body;

    const project = await Project.findOne({ _id: projectId, organizationId });
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Non-admin with PROJECT_MEMBERS_UPDATE can only add to projects they belong to
    if (req.user.role?.name !== ROLES.ADMIN) {
      const myMembership = await ProjectMember.findOne({
        userId: req.user.id,
        organizationId,
        projectId,
        isActive: true,
      });
      if (!myMembership) {
        return res.status(403).json({
          success: false,
          message: 'You can only add members to projects you belong to',
        });
      }
    }

    const isUserInOrg = await OrganizationMember.findOne({ userId, organizationId });
    if (!isUserInOrg) {
      return res.status(400).json({
        success: false,
        message: 'User is not in this organization',
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found or inactive',
      });
    }

    const existing = await ProjectMember.findOne({
      projectId,
      organizationId,
      userId,
      isActive: true,
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this project',
      });
    }

    const member = await ProjectMember.create({
      organizationId,
      projectId,
      userId,
      minWorkHours: minWorkHours ?? null,
    });

    await member.populate('userId', 'name email category');

    res.status(201).json({
      success: true,
      message: 'Member added to project successfully',
      data: member,
    });
  } catch (error) {
    logger.error('Add project member error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Add multiple workers to a project (bulk)
 * @route   POST /api/projects/:id/members/bulk
 * @access  Private (project update)
 */
export const addProjectMembersBulk = async (req, res) => {
  try {
    const projectId = req.params.id;
    const organizationId = req.user.organizationId;
    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];

    const project = await Project.findOne({ _id: projectId, organizationId });
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    if (req.user.role?.name !== ROLES.ADMIN) {
      const myMembership = await ProjectMember.findOne({
        userId: req.user.id,
        organizationId,
        projectId,
        isActive: true,
      });
      if (!myMembership) {
        return res.status(403).json({
          success: false,
          message: 'You can only add members to projects you belong to',
        });
      }
    }

    let added = 0;
    const errors = [];

    for (const userId of userIds) {
      const isUserInOrg = await OrganizationMember.findOne({ userId, organizationId });
      if (!isUserInOrg) {
        errors.push({ userId, reason: 'User is not in this organization' });
        continue;
      }

      const user = await User.findById(userId);
      if (!user || !user.isActive) {
        errors.push({ userId, reason: 'User not found or inactive' });
        continue;
      }

      const existing = await ProjectMember.findOne({
        projectId,
        organizationId,
        userId,
        isActive: true,
      });
      if (existing) {
        errors.push({ userId, reason: 'Already a member of this project' });
        continue;
      }

      await ProjectMember.create({
        organizationId,
        projectId,
        userId,
        minWorkHours: null,
      });
      added += 1;
    }

    const skipped = userIds.length - added;

    res.status(200).json({
      success: true,
      message: added > 0 ? 'Members added successfully' : 'No members added',
      data: { added, skipped, errors: errors.length > 0 ? errors : undefined },
    });
  } catch (error) {
    logger.error('Add project members bulk error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * @desc    Remove a worker from a project (soft: set isActive false)
 * @route   DELETE /api/projects/:id/members/:userId
 * @access  Private (project update)
 */
export const removeProjectMember = async (req, res) => {
  try {
    const { id: projectId, userId } = req.params;
    const organizationId = req.user.organizationId;

    const project = await Project.findOne({ _id: projectId, organizationId });
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Non-admin with PROJECT_MEMBERS_UPDATE can only remove from projects they belong to
    if (req.user.role?.name !== ROLES.ADMIN) {
      const myMembership = await ProjectMember.findOne({
        userId: req.user.id,
        organizationId,
        projectId,
        isActive: true,
      });
      if (!myMembership) {
        return res.status(403).json({
          success: false,
          message: 'You can only remove members from projects you belong to',
        });
      }
    }

    const member = await ProjectMember.findOne({
      projectId,
      organizationId,
      userId,
      isActive: true,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Project member not found',
      });
    }

    member.isActive = false;
    await member.save();

    res.status(200).json({
      success: true,
      message: 'Member removed from project successfully',
    });
  } catch (error) {
    logger.error('Remove project member error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

export default {
  createProject,
  getAllProjects,
  getProjectOptions,
  getProject,
  updateProject,
  deleteProject,
  getProjectAvailableUsers,
  getProjectMembers,
  addProjectMember,
  addProjectMembersBulk,
  removeProjectMember,
};
