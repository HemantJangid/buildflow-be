import mongoose from "mongoose";
import { CHANGE_REQUEST_STATUS, PERMISSIONS, ROLES } from "../constants.js";
import Attendance from "../models/Attendance.js";
import AttendanceChangeRequest from "../models/AttendanceChangeRequest.js";
import Project from "../models/Project.js";
import ProjectMember from "../models/ProjectMember.js";
import User from "../models/User.js";
import logger from "../utils/logger.js";
import { getPagination, paginatedResponse } from "../utils/pagination.js";

/**
 * Get user IDs of people in the same projects as the current user (other project members) in the given org.
 */
const getProjectMemberUserIds = async (currentUserId, organizationId) => {
  const id =
    typeof currentUserId === "string"
      ? mongoose.Types.ObjectId.createFromHexString(currentUserId)
      : currentUserId;

  const myMemberships = await ProjectMember.find({
    userId: id,
    organizationId,
    isActive: true,
  })
    .select("projectId")
    .lean();

  if (myMemberships.length === 0) return [];

  const projectIds = myMemberships.map((m) => m.projectId);
  const otherMembers = await ProjectMember.find({
    organizationId,
    projectId: { $in: projectIds },
    userId: { $ne: id },
    isActive: true,
  })
    .select("userId")
    .lean();

  const ids = [...new Set(otherMembers.map((m) => m.userId.toString()))];
  return ids.map((s) => mongoose.Types.ObjectId.createFromHexString(s));
};

/**
 * Get user IDs of other members in a specific project. Verifies current user is a member of that project.
 * @returns {Promise<{ ok: boolean, memberUserIds?: ObjectId[], error?: string }>}
 */
const getProjectMemberUserIdsForProject = async (currentUserId, projectId, organizationId) => {
  const uid =
    typeof currentUserId === "string"
      ? mongoose.Types.ObjectId.createFromHexString(currentUserId)
      : currentUserId;
  const pid =
    typeof projectId === "string"
      ? mongoose.Types.ObjectId.createFromHexString(projectId)
      : projectId;

  const myMembership = await ProjectMember.findOne({
    userId: uid,
    organizationId,
    projectId: pid,
    isActive: true,
  }).lean();
  if (!myMembership) {
    return { ok: false, error: "You are not a member of this project" };
  }

  const otherMembers = await ProjectMember.find({
    organizationId,
    projectId: pid,
    userId: { $ne: uid },
    isActive: true,
  })
    .select("userId")
    .lean();
  const memberUserIds = otherMembers.map((m) => m.userId);
  return { ok: true, memberUserIds };
};

/**
 * @desc    Get my project members for a specific project – paginated
 * @route   GET /api/supervisor/my-project-members?projectId=...&page=1&limit=10
 * @access  Private (projectMembers:read); Admin can view any project's members
 */
export const getMyProjectMembers = async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "projectId is required",
      });
    }

    const { page, limit, skip } = getPagination(req.query, 10);

    const organizationId = req.user.organizationId;
    let memberUserIds = [];
    const isAdmin = req.user.role?.name === ROLES.ADMIN;

    if (isAdmin) {
      const pid =
        typeof projectId === "string"
          ? mongoose.Types.ObjectId.createFromHexString(projectId)
          : projectId;
      const project = await Project.findOne({
        _id: pid,
        organizationId,
      });
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }
      const members = await ProjectMember.find({
        organizationId,
        projectId: pid,
        isActive: true,
      })
        .select("userId")
        .lean();
      memberUserIds = members.map((m) => m.userId);
    } else {
      const result = await getProjectMemberUserIdsForProject(
        req.user.id,
        projectId,
        organizationId,
      );
      if (!result.ok) {
        return res.status(403).json({
          success: false,
          message: result.error,
        });
      }
      memberUserIds = result.memberUserIds;
    }

    if (memberUserIds.length === 0) {
      return paginatedResponse(res, { data: [], total: 0, page, limit });
    }

    const [users, total] = await Promise.all([
      User.find({ _id: { $in: memberUserIds } })
        .select("name email category")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({ _id: { $in: memberUserIds } }),
    ]);

    return paginatedResponse(res, { data: users, total, page, limit });
  } catch (error) {
    logger.error("Get my project members error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Get project members' attendance for a specific project (requires projectId)
 * @route   GET /api/supervisor/attendance?projectId=...
 * @access  Private/Supervisor (projectMembers:read); Admin can view any project's attendance
 */
export const getProjectMembersAttendance = async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "projectId is required",
      });
    }

    const organizationId = req.user.organizationId;
    const pid =
      typeof projectId === "string"
        ? mongoose.Types.ObjectId.createFromHexString(projectId)
        : projectId;

    let memberUserIds = [];
    const isAdmin = req.user.role?.name === ROLES.ADMIN;

    if (isAdmin) {
      const members = await ProjectMember.find({
        organizationId,
        projectId: pid,
        isActive: true,
      })
        .select("userId")
        .lean();
      memberUserIds = members.map((m) => m.userId);
    } else {
      const result = await getProjectMemberUserIdsForProject(
        req.user.id,
        projectId,
        organizationId,
      );
      if (!result.ok) {
        return res.status(403).json({
          success: false,
          message: result.error,
        });
      }
      memberUserIds = result.memberUserIds;
    }

    if (memberUserIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    const query = {
      organizationId,
      userId: { $in: memberUserIds },
      projectId: pid,
    };

    if (req.query.startDate || req.query.endDate) {
      query.clockIn = {};
      if (req.query.startDate)
        query.clockIn.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.clockIn.$lte = new Date(req.query.endDate);
    }

    const { page, limit, skip } = getPagination(req.query, 10);
    const [attendance, total] = await Promise.all([
      Attendance.find(query)
        .populate("userId", "name email category")
        .populate("projectId", "name")
        .sort({ clockIn: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Attendance.countDocuments(query),
    ]);

    return paginatedResponse(res, { data: attendance, total, page, limit });
  } catch (error) {
    logger.error("Get project members attendance error", {
      error: error.message,
    });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Update project member attendance metadata (supervisor edit)
 * @route   PUT /api/supervisor/attendance/:id
 * @access  Private/Supervisor (projectMembers:update)
 */
export const updateProjectMemberAttendance = async (req, res) => {
  try {
    const attendanceId = req.params.id;
    const organizationId = req.user.organizationId;
    const { metadata } = req.body;
    const attendance = await Attendance.findOne({
      _id: attendanceId,
      organizationId,
    });
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }
    const result = await getProjectMemberUserIdsForProject(
      req.user.id,
      attendance.projectId,
      organizationId,
    );
    if (!result.ok) {
      return res.status(403).json({
        success: false,
        message: result.error,
      });
    }
    const workerInThisProject = result.memberUserIds.some(
      (uid) => uid.toString() === attendance.userId.toString(),
    );
    if (!workerInThisProject) {
      return res.status(403).json({
        success: false,
        message:
          "You can only update attendance for members of the same project as this record",
      });
    }
    // Supervisor can only edit once; after that they must use change request
    if ((attendance.editCount || 0) >= 1) {
      return res.status(403).json({
        success: false,
        requiresChangeRequest: true,
        message:
          "This record has already been edited. Please submit a change request.",
      });
    }
    if (metadata) {
      attendance.metadata = {
        ...(attendance.metadata?.toObject?.() || {}),
        ...metadata,
      };
    }
    attendance.editCount = (attendance.editCount || 0) + 1;
    attendance.lastEditedBy = req.user.id;
    attendance.lastEditedAt = new Date();
    await attendance.save();
    await attendance.populate(["userId", "projectId"]);
    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: attendance,
    });
  } catch (error) {
    logger.error("Update project member attendance error", {
      error: error.message,
    });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Submit a change request for an attendance record
 * @route   POST /api/supervisor/change-request
 * @access  Private
 */
export const submitChangeRequest = async (req, res) => {
  try {
    const { attendanceId, proposedChanges, reason } = req.body;
    if (!attendanceId || !reason) {
      return res.status(400).json({
        success: false,
        message: "attendanceId and reason are required",
      });
    }
    const organizationId = req.user.organizationId;
    const attendance = await Attendance.findOne({
      _id: attendanceId,
      organizationId,
    });
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }
    const isOwner = attendance.userId.toString() === req.user.id;
    const projectMemberUserIds = await getProjectMemberUserIds(req.user.id, organizationId);
    const workerInMyProjectMembers = projectMemberUserIds.some(
      (uid) => uid.toString() === attendance.userId.toString(),
    );
    const canSubmit =
      isOwner ||
      req.user.role?.name === ROLES.ADMIN ||
      workerInMyProjectMembers;
    if (!canSubmit) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to submit change request for this record",
      });
    }
    const existing = await AttendanceChangeRequest.findOne({
      attendanceId,
      requestedBy: req.user.id,
      status: CHANGE_REQUEST_STATUS.PENDING,
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending change request for this record",
      });
    }
    const changeRequest = await AttendanceChangeRequest.create({
      organizationId,
      attendanceId: attendance._id,
      requestedBy: req.user.id,
      reason,
      proposedChanges: proposedChanges || {},
      originalValues: {
        clockIn: attendance.clockIn,
        clockOut: attendance.clockOut,
        metadata: attendance.metadata,
      },
      status: CHANGE_REQUEST_STATUS.PENDING,
    });
    await changeRequest.populate(["attendanceId", "requestedBy"]);
    res.status(201).json({
      success: true,
      message: "Change request submitted",
      data: changeRequest,
    });
  } catch (error) {
    logger.error("Submit change request error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Get change requests – paginated. All (admin) or my project members only (supervisor). Optional projectId.
 * @route   GET /api/supervisor/change-requests?page=1&limit=10&status=&projectId=
 * @access  Private (projectMembers:read for my-project-members scope, attendance:update for all)
 */
export const getChangeRequests = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const { status, projectId } = req.query;
    const { page, limit, skip } = getPagination(req.query, 10);

    const hasAttendanceUpdate = req.user.permissions?.includes?.(
      PERMISSIONS.ATTENDANCE_UPDATE,
    );
    let query = { organizationId };
    if (status) query.status = status;
    if (!hasAttendanceUpdate) {
      const projectMemberUserIds = await getProjectMemberUserIds(req.user.id, organizationId);
      if (projectMemberUserIds.length === 0) {
        return paginatedResponse(res, { data: [], total: 0, page, limit });
      }
      query.requestedBy = { $in: projectMemberUserIds };
    }
    if (projectId) {
      const attendanceIds = await Attendance.find({
        organizationId,
        projectId:
          typeof projectId === "string"
            ? mongoose.Types.ObjectId.createFromHexString(projectId)
            : projectId,
      })
        .select("_id")
        .lean();
      const ids = attendanceIds.map((a) => a._id);
      if (ids.length === 0) {
        return paginatedResponse(res, { data: [], total: 0, page, limit });
      }
      query.attendanceId = { $in: ids };
    }

    const [requests, total] = await Promise.all([
      AttendanceChangeRequest.find(query)
        .populate({
          path: "attendanceId",
          populate: [
            { path: "userId", select: "name email" },
            { path: "projectId", select: "name" },
          ],
        })
        .populate("requestedBy", "name email")
        .populate("reviewedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AttendanceChangeRequest.countDocuments(query),
    ]);

    return paginatedResponse(res, { data: requests, total, page, limit });
  } catch (error) {
    logger.error("Get change requests error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Review (approve/reject) a change request
 * @route   PUT /api/supervisor/change-request/:id/review
 * @access  Private (attendance:update or supervisor of requester)
 */
export const reviewChangeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;
    const reviewStatuses = [
      CHANGE_REQUEST_STATUS.APPROVED,
      CHANGE_REQUEST_STATUS.REJECTED,
    ];
    if (!status || !reviewStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be ${CHANGE_REQUEST_STATUS.APPROVED} or ${CHANGE_REQUEST_STATUS.REJECTED}`,
      });
    }
    const organizationId = req.user.organizationId;
    const changeRequest = await AttendanceChangeRequest.findOne({
      _id: id,
      organizationId,
    });
    if (!changeRequest) {
      return res.status(404).json({
        success: false,
        message: "Change request not found",
      });
    }
    if (changeRequest.status !== CHANGE_REQUEST_STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        message: "Change request has already been reviewed",
      });
    }
    const isAdmin = req.user.role?.name === ROLES.ADMIN;
    const projectMemberUserIds = await getProjectMemberUserIds(req.user.id, organizationId);
    const isSupervisorOfRequester = projectMemberUserIds.some(
      (id) => id.toString() === changeRequest.requestedBy.toString(),
    );
    if (!isAdmin && !isSupervisorOfRequester) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to review this change request",
      });
    }
    changeRequest.status = status;
    changeRequest.reviewedBy = req.user.id;
    changeRequest.reviewedAt = new Date();
    if (reviewNotes != null) changeRequest.reviewNotes = reviewNotes;
    await changeRequest.save();
    if (
      status === CHANGE_REQUEST_STATUS.APPROVED &&
      changeRequest.proposedChanges
    ) {
      const att = await Attendance.findById(changeRequest.attendanceId);
      if (att) {
        const pc = changeRequest.proposedChanges;
        if (pc.clockIn) att.clockIn = pc.clockIn;
        if (pc.clockOut) att.clockOut = pc.clockOut;
        if (pc.metadata)
          att.metadata = {
            ...(att.metadata?.toObject?.() || {}),
            ...pc.metadata,
          };
        await att.save();
      }
    }
    await changeRequest.populate(["requestedBy", "reviewedBy"]);
    res.status(200).json({
      success: true,
      message: `Change request ${status.toLowerCase()}`,
      data: changeRequest,
    });
  } catch (error) {
    logger.error("Review change request error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export default {
  getMyProjectMembers,
  getProjectMembersAttendance,
  updateProjectMemberAttendance,
  submitChangeRequest,
  getChangeRequests,
  reviewChangeRequest,
};
