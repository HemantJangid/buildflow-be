import mongoose from "mongoose";
import { ROLES } from "../constants.js";
import Attendance from "../models/Attendance.js";
import DailyAttendanceMark from "../models/DailyAttendanceMark.js";
import Project from "../models/Project.js";
import ProjectMember from "../models/ProjectMember.js";
import User from "../models/User.js";
import { checkGeofence } from "../utils/geofence.js";
import { getPagination, paginatedResponse } from "../utils/pagination.js";
import logger from "../utils/logger.js";

/**
 * Get minimum work hours based on hierarchy:
 * 1. ProjectMember override (for this user+project)
 * 2. User's default minWorkHours
 * 3. Project's minWorkHours
 * 4. System default (8 hours)
 */
const getMinWorkHours = async (userId, projectId) => {
  const SYSTEM_DEFAULT = 8;

  try {
    const user = await User.findById(userId);
    const project = await Project.findById(projectId);

    const projectMember = await ProjectMember.findOne({
      userId,
      projectId,
      isActive: true,
    });

    // Priority 1: ProjectMember override
    if (
      projectMember?.minWorkHours !== null &&
      projectMember?.minWorkHours !== undefined
    ) {
      return projectMember.minWorkHours;
    }

    // Priority 2: User's default
    if (user?.minWorkHours !== null && user?.minWorkHours !== undefined) {
      return user.minWorkHours;
    }

    // Priority 3: Project's minWorkHours
    if (project?.minWorkHours !== null && project?.minWorkHours !== undefined) {
      return project.minWorkHours;
    }

    return SYSTEM_DEFAULT;
  } catch (error) {
    logger.error("Error getting min work hours", { error: error.message });
    return SYSTEM_DEFAULT;
  }
};

/**
 * Calculate attendance status based on hours worked vs required
 */
const calculateAttendanceStatus = (hoursWorked, minRequired) => {
  if (hoursWorked >= minRequired) {
    return "PRESENT";
  } else if (hoursWorked >= minRequired * 0.5) {
    return "PARTIAL";
  }
  return "ABSENT";
};

/**
 * Find projects within geofence of given coordinates (for current org)
 */
const findProjectsInRange = async (coordinates, organizationId) => {
  const projects = await Project.find({ organizationId, isActive: true });

  const matchingProjects = [];
  for (const project of projects) {
    const projectCenter = {
      lat: Number(project.location?.lat),
      lng: Number(project.location?.lng),
    };
    const radiusMeters = Number(project.radius) || 100;
    const geofenceResult = checkGeofence(
      coordinates,
      projectCenter,
      radiusMeters,
    );
    if (geofenceResult.isWithinGeofence) {
      matchingProjects.push({
        project,
        distance: geofenceResult.distance,
      });
    }
  }

  // Sort by distance (closest first)
  matchingProjects.sort((a, b) => a.distance - b.distance);

  return matchingProjects;
};

/**
 * Check if user is a member of the project (can work on it)
 */
const isUserProjectMember = async (userId, projectId, organizationId) => {
  const membership = await ProjectMember.findOne({
    userId,
    projectId,
    organizationId,
    isActive: true,
  });
  return !!membership;
};

/**
 * @desc    Auto clock out an attendance record
 */
const autoClockOut = async (attendance, coordinates) => {
  const clockOutTime = new Date();

  // Calculate hours worked
  const hoursWorked = (clockOutTime - attendance.clockIn) / (1000 * 60 * 60);

  // Get min hours required
  const minHoursRequired = await getMinWorkHours(
    attendance.userId,
    attendance.projectId,
  );

  // Calculate attendance status
  const attendanceStatus = calculateAttendanceStatus(
    hoursWorked,
    minHoursRequired,
  );

  // Update attendance
  attendance.clockOut = clockOutTime;
  attendance.clockOutCoordinates = coordinates;
  attendance.status = "CLOCKED_OUT";
  attendance.hoursWorked = parseFloat(hoursWorked.toFixed(2));
  attendance.minHoursRequired = minHoursRequired;
  attendance.attendanceStatus = attendanceStatus;

  await attendance.save();

  return attendance;
};

/**
 * @desc    Clock in - Auto-detect or select project from location
 * @route   POST /api/attendance/clock-in
 * @access  Private
 */
export const clockIn = async (req, res) => {
  try {
    const { coordinates, projectId: requestedProjectId, metadata } = req.body;
    const userId = req.user.id;
    const organizationId = req.user.organizationId;

    if (
      !coordinates ||
      coordinates.lat === undefined ||
      coordinates.lng === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Location coordinates are required",
      });
    }

    const activeAttendance = await Attendance.findOne({
      userId,
      organizationId,
      status: "CLOCKED_IN",
    }).populate("projectId");

    // If there's an active attendance at a DIFFERENT project, auto clock-out
    if (activeAttendance) {
      // If same project, reject (already clocked in)
      if (
        !requestedProjectId ||
        activeAttendance.projectId._id.toString() === requestedProjectId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "You already have an active clock-in. Please clock out first.",
          data: activeAttendance,
        });
      }

      // Auto clock-out from previous project
      await autoClockOut(activeAttendance, coordinates);
    }

    let selectedProject = null;
    let geofenceResult = null;

    if (requestedProjectId) {
      selectedProject = await Project.findOne({
        _id: requestedProjectId,
        organizationId,
      });

      if (!selectedProject) {
        return res.status(404).json({
          success: false,
          message: "Project not found",
        });
      }

      if (!selectedProject.isActive) {
        return res.status(400).json({
          success: false,
          message: "Project is not active",
        });
      }

      const canWork = await isUserProjectMember(userId, selectedProject._id, organizationId);
      if (!canWork) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to this project",
        });
      }

      // Check geofence
      const projectCenter = {
        lat: Number(selectedProject.location?.lat),
        lng: Number(selectedProject.location?.lng),
      };
      const radiusMeters = Number(selectedProject.radius) || 100;
      geofenceResult = checkGeofence(coordinates, projectCenter, radiusMeters);

      if (!geofenceResult.isWithinGeofence) {
        logger.warn("Clock-in geofence failed", {
          distance: geofenceResult.distance,
          radiusUsed: geofenceResult.radiusUsed,
          projectId: selectedProject._id,
        });
        return res.status(400).json({
          success: false,
          message: `You are outside the project geofence. Distance: ${geofenceResult.distance}m (allowed: ${geofenceResult.radiusUsed}m)`,
          data: {
            distance: geofenceResult.distance,
            allowedRadius: geofenceResult.radiusUsed,
          },
        });
      }
    } else {
      const projectsInRange = await findProjectsInRange(coordinates, organizationId);

      if (projectsInRange.length === 0) {
        return res.status(400).json({
          success: false,
          message: "You are not within the geofence of any project",
        });
      }

      for (const { project, distance } of projectsInRange) {
        const canWork = await isUserProjectMember(userId, project._id, organizationId);
        if (canWork) {
          selectedProject = project;
          geofenceResult = { isWithinGeofence: true, distance };
          break;
        }
      }

      if (!selectedProject) {
        return res.status(400).json({
          success: false,
          message:
            "No project found at your location that you are assigned to",
        });
      }
    }

    const attendance = await Attendance.create({
      organizationId,
      userId,
      projectId: selectedProject._id,
      clockIn: new Date(),
      clockInCoordinates: coordinates,
      metadata: metadata || {},
      status: "CLOCKED_IN",
      attendanceStatus: "PENDING",
    });

    await attendance.populate(["userId", "projectId"]);

    res.status(201).json({
      success: true,
      message: activeAttendance
        ? "Auto clocked-out from previous project and clocked in successfully"
        : "Clocked in successfully",
      data: {
        attendance,
        autoClockOut: activeAttendance
          ? {
              previousProject: activeAttendance.projectId.name,
              hoursWorked: activeAttendance.hoursWorked,
              status: activeAttendance.attendanceStatus,
            }
          : null,
        geofence: {
          distance: geofenceResult.distance,
          withinRadius: true,
        },
      },
    });
  } catch (error) {
    logger.error("Clock in error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error during clock in",
    });
  }
};

/**
 * @desc    Clock out - Calculate hours and attendance status
 * @route   POST /api/attendance/clock-out
 * @access  Private
 */
export const clockOut = async (req, res) => {
  try {
    const { coordinates, metadata } = req.body;
    const userId = req.user.id;
    const organizationId = req.user.organizationId;

    if (
      !coordinates ||
      coordinates.lat === undefined ||
      coordinates.lng === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Location coordinates are required for clock out",
      });
    }

    const attendance = await Attendance.findOne({
      userId,
      organizationId,
      status: "CLOCKED_IN",
    }).populate("projectId");

    if (!attendance) {
      return res.status(400).json({
        success: false,
        message: "No active clock-in found",
      });
    }

    // Get project for geofence check
    const project = attendance.projectId;

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Associated project not found",
      });
    }

    // Check geofence for clock-out (explicit coords/radius so Mongoose subdocuments don't cause issues)
    const projectCenter = {
      lat: Number(project.location?.lat),
      lng: Number(project.location?.lng),
    };
    const radiusMeters = Number(project.radius) || 100;
    const geofenceResult = checkGeofence(
      coordinates,
      projectCenter,
      radiusMeters,
    );

    if (!geofenceResult.isWithinGeofence) {
      logger.warn("Clock-out geofence failed", {
        distance: geofenceResult.distance,
        radiusUsed: geofenceResult.radiusUsed,
        projectId: project._id,
      });
      return res.status(400).json({
        success: false,
        message: `You are outside the project geofence. Distance: ${geofenceResult.distance}m (allowed: ${geofenceResult.radiusUsed}m)`,
        data: {
          distance: geofenceResult.distance,
          allowedRadius: geofenceResult.radiusUsed,
        },
      });
    }

    // Calculate hours worked
    const clockOutTime = new Date();
    const hoursWorked = (clockOutTime - attendance.clockIn) / (1000 * 60 * 60);

    // Get min hours required from hierarchy
    const minHoursRequired = await getMinWorkHours(
      userId,
      attendance.projectId,
    );

    // Calculate attendance status
    const attendanceStatus = calculateAttendanceStatus(
      hoursWorked,
      minHoursRequired,
    );

    // Update attendance
    attendance.clockOut = clockOutTime;
    attendance.clockOutCoordinates = coordinates;
    attendance.status = "CLOCKED_OUT";
    attendance.hoursWorked = parseFloat(hoursWorked.toFixed(2));
    attendance.minHoursRequired = minHoursRequired;
    attendance.attendanceStatus = attendanceStatus;

    // Update metadata if provided
    if (metadata) {
      attendance.metadata = { ...attendance.metadata.toObject(), ...metadata };
    }

    await attendance.save();
    await attendance.populate(["userId", "projectId"]);

    res.status(200).json({
      success: true,
      message: "Clocked out successfully",
      data: {
        attendance,
        summary: {
          hoursWorked: attendance.hoursWorked,
          minHoursRequired: attendance.minHoursRequired,
          attendanceStatus: attendance.attendanceStatus,
        },
        geofence: {
          distance: geofenceResult.distance,
          withinRadius: true,
        },
      },
    });
  } catch (error) {
    logger.error("Clock out error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error during clock out",
    });
  }
};

/**
 * @desc    Get user's attendance history
 * @route   GET /api/attendance/my-attendance
 * @access  Private
 */
export const getMyAttendance = async (req, res) => {
  try {
    const { startDate, endDate, projectId, attendanceStatus } = req.query;
    const userId = req.user.id;
    const organizationId = req.user.organizationId;

    const query = { userId, organizationId };

    if (startDate || endDate) {
      query.clockIn = {};
      if (startDate) query.clockIn.$gte = new Date(startDate);
      if (endDate) query.clockIn.$lte = new Date(endDate);
    }
    if (projectId) query.projectId = projectId;
    if (attendanceStatus) query.attendanceStatus = attendanceStatus;

    const attendance = await Attendance.find(query)
      .populate("projectId", "name location")
      .sort({ clockIn: -1 });

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
    });
  } catch (error) {
    logger.error("Get attendance error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * @desc    Get all attendance records (Admin/Manager) – paginated
 * @route   GET /api/attendance?page=1&limit=25&...
 * @access  Private/Admin/Manager
 */
export const getAllAttendance = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userId,
      projectId,
      status,
      attendanceStatus,
    } = req.query;

    const organizationId = req.user.organizationId;
    const { page, limit, skip } = getPagination(req.query, 10);

    const query = { organizationId };

    if (startDate || endDate) {
      query.clockIn = {};
      if (startDate) query.clockIn.$gte = new Date(startDate);
      if (endDate) query.clockIn.$lte = new Date(endDate);
    }
    if (userId) query.userId = userId;
    if (projectId) query.projectId = projectId;
    if (status) query.status = status;
    if (attendanceStatus) query.attendanceStatus = attendanceStatus;

    const [attendance, total] = await Promise.all([
      Attendance.find(query)
        .populate("userId", "name email")
        .populate("projectId", "name location")
        .sort({ clockIn: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Attendance.countDocuments(query),
    ]);

    return paginatedResponse(res, { data: attendance, total, page, limit });
  } catch (error) {
    logger.error("Get all attendance error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * @desc    Update attendance metadata (work units, work type, expenses)
 * @route   PUT /api/attendance/:id/metadata
 * @access  Private
 */
export const updateAttendanceMetadata = async (req, res) => {
  try {
    const { metadata } = req.body;
    const attendanceId = req.params.id;

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
    const isAdmin = req.user.role?.name === ROLES.ADMIN;
    let isSupervisorInProject = false;
    if (!isOwner && !isAdmin && req.user.role?.name === ROLES.SUPERVISOR) {
      const inSameProject = await ProjectMember.findOne({
        userId: req.user.id,
        organizationId,
        projectId: attendance.projectId,
        isActive: true,
      }).lean();
      isSupervisorInProject = !!inSameProject;
    }
    if (!isOwner && !isAdmin && !isSupervisorInProject) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this attendance record",
      });
    }

    // Update metadata
    attendance.metadata = { ...attendance.metadata.toObject(), ...metadata };
    await attendance.save();
    await attendance.populate(["userId", "projectId"]);

    res.status(200).json({
      success: true,
      message: "Attendance metadata updated successfully",
      data: attendance,
    });
  } catch (error) {
    logger.error("Update attendance metadata error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error during metadata update",
    });
  }
};

/**
 * @desc    Get attendance report – paginated records + summary (summary over all matching records)
 * @route   GET /api/attendance/report?page=1&limit=25&...
 * @access  Private/Admin/Manager
 */
export const getAttendanceReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userId,
      projectId,
      attendanceStatus,
      groupBy,
    } = req.query;

    const organizationId = req.user.organizationId;
    const { page, limit, skip } = getPagination(req.query, 10);

    const matchQuery = { organizationId, status: "CLOCKED_OUT" };
    if (startDate || endDate) {
      matchQuery.clockIn = {};
      if (startDate) matchQuery.clockIn.$gte = new Date(startDate);
      if (endDate) matchQuery.clockIn.$lte = new Date(endDate);
    }
    if (userId) matchQuery.userId = mongoose.Types.ObjectId.createFromHexString(userId);
    if (projectId)
      matchQuery.projectId = mongoose.Types.ObjectId.createFromHexString(projectId);
    if (attendanceStatus) matchQuery.attendanceStatus = attendanceStatus;

    const summaryAgg = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalHours: { $sum: "$hoursWorked" },
          presentCount: { $sum: { $cond: [{ $eq: ["$attendanceStatus", "PRESENT"] }, 1, 0] } },
          absentCount: { $sum: { $cond: [{ $eq: ["$attendanceStatus", "ABSENT"] }, 1, 0] } },
          partialCount: { $sum: { $cond: [{ $eq: ["$attendanceStatus", "PARTIAL"] }, 1, 0] } },
        },
      },
    ]);

    const summaryRow = summaryAgg[0] || {
      totalRecords: 0,
      totalHours: 0,
      presentCount: 0,
      absentCount: 0,
      partialCount: 0,
    };
    const summary = {
      totalRecords: summaryRow.totalRecords,
      totalHours: summaryRow.totalHours || 0,
      presentCount: summaryRow.presentCount || 0,
      absentCount: summaryRow.absentCount || 0,
      partialCount: summaryRow.partialCount || 0,
      averageHours:
        summaryRow.totalRecords > 0
          ? (summaryRow.totalHours / summaryRow.totalRecords).toFixed(2)
          : 0,
    };

    const [records, total] = await Promise.all([
      Attendance.find(matchQuery)
        .populate("userId", "name email")
        .populate("projectId", "name")
        .sort({ clockIn: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Attendance.countDocuments(matchQuery),
    ]);

    const totalNum = Number(total) || 0;
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const totalPages = Math.max(1, Math.ceil(totalNum / limitNum));
    res.status(200).json({
      success: true,
      data: {
        records,
        summary,
        pagination: {
          total: totalNum,
          page: pageNum,
          limit: limitNum,
          totalPages,
        },
      },
    });
  } catch (error) {
    logger.error("Get attendance report error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * Normalize date to start of day (UTC) for sheet keys
 */
const toDateOnly = (d) => {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

/**
 * @desc    Get daily attendance sheet for a month (P/A grid by worker × day)
 * @route   GET /api/attendance/sheet
 * @access  Private (attendance:readAll or project members for Supervisor)
 */
export const getAttendanceSheet = async (req, res) => {
  try {
    const { month, projectId } = req.query;

    if (!month || !projectId) {
      return res.status(400).json({
        success: false,
        message: "month (YYYY-MM) and projectId are required",
      });
    }

    const [year, monthNum] = month.split("-").map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        message: "Invalid month format. Use YYYY-MM",
      });
    }

    const organizationId = req.user.organizationId;
    const startOfMonth = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));
    const daysInMonth = endOfMonth.getUTCDate();

    const project = await Project.findOne({ _id: projectId, organizationId });
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const members = await ProjectMember.find({
      projectId,
      organizationId,
      isActive: true,
    }).select("userId");
    const workerUserIds = members.map((m) => m.userId);

    const workers = await User.find({
      _id: { $in: workerUserIds },
      isActive: true,
    })
      .select("name email")
      .sort({ name: 1 })
      .lean();

    const dateFrom = toDateOnly(startOfMonth);
    const dateTo = toDateOnly(endOfMonth);

    const marks = await DailyAttendanceMark.find({
      organizationId,
      projectId,
      userId: { $in: workerUserIds },
      date: { $gte: dateFrom, $lte: dateTo },
    }).lean();

    const clockRecords = await Attendance.find({
      organizationId,
      projectId,
      userId: { $in: workerUserIds },
      status: "CLOCKED_OUT",
      clockIn: { $gte: startOfMonth, $lte: endOfMonth },
    })
      .select("userId clockIn attendanceStatus hoursWorked")
      .lean();

    const marksByKey = {};
    marks.forEach((m) => {
      const d = toDateOnly(m.date);
      const day = d.getUTCDate();
      const key = `${m.userId}_${day}`;
      marksByKey[key] = { status: m.status, hoursWorked: m.hoursWorked };
    });

    const clockByKey = {};
    clockRecords.forEach((r) => {
      const day = new Date(r.clockIn).getUTCDate();
      const key = `${r.userId}_${day}`;
      if (
        !clockByKey[key] ||
        (r.hoursWorked != null &&
          (clockByKey[key].hoursWorked == null ||
            r.hoursWorked > clockByKey[key].hoursWorked))
      ) {
        clockByKey[key] = {
          status: r.attendanceStatus || "PRESENT",
          hoursWorked: r.hoursWorked,
        };
      }
    });

    const data = {};
    workers.forEach((w) => {
      data[w._id.toString()] = {};
      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${w._id}_${day}`;
        const mark = marksByKey[key];
        const clock = clockByKey[key];
        if (mark) {
          data[w._id.toString()][day] = {
            status: mark.status,
            hoursWorked: mark.hoursWorked ?? undefined,
          };
        } else if (clock) {
          data[w._id.toString()][day] = {
            status: clock.status,
            hoursWorked: clock.hoursWorked ?? undefined,
          };
        } else {
          data[w._id.toString()][day] = {
            status: null,
            hoursWorked: undefined,
          };
        }
      }
    });

    res.status(200).json({
      success: true,
      data: {
        month,
        projectId,
        project: { _id: project._id, name: project.name },
        workers,
        daysInMonth,
        data,
      },
    });
  } catch (error) {
    logger.error("Get attendance sheet error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * @desc    Set or update a daily attendance mark (manual P/A)
 * @route   POST /api/attendance/sheet/mark
 * @access  Private (attendance:update; Supervisor only for their projects)
 */
export const setAttendanceMark = async (req, res) => {
  try {
    const { userId, date, projectId, status, hoursWorked } = req.body;

    if (!userId || !date || !projectId || !status) {
      return res.status(400).json({
        success: false,
        message: "userId, date, projectId, and status are required",
      });
    }

    if (!["PRESENT", "ABSENT", "PARTIAL"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be PRESENT, ABSENT, or PARTIAL",
      });
    }

    const organizationId = req.user.organizationId;
    const dateOnly = toDateOnly(new Date(date));

    if (req.user.role?.name === ROLES.SUPERVISOR) {
      const myMemberships = await ProjectMember.find({
        userId: req.user.id,
        organizationId,
        isActive: true,
      }).select("projectId");
      const myProjectIds = myMemberships.map((m) => m.projectId);
      const workerInProject = await ProjectMember.findOne({
        userId,
        organizationId,
        projectId,
        isActive: true,
      });
      if (
        !workerInProject ||
        !myProjectIds.some((id) => id.toString() === workerInProject.projectId.toString())
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only set attendance for users in your projects",
        });
      }
    }

    const projectIdObj = mongoose.Types.ObjectId.createFromHexString(projectId);
    const userIdObj = mongoose.Types.ObjectId.createFromHexString(userId);
    const filter = {
      organizationId,
      userId: userIdObj,
      projectId: projectIdObj,
      date: dateOnly,
    };

    const update = {
      organizationId,
      userId: userIdObj,
      projectId: projectIdObj,
      date: dateOnly,
      status,
      hoursWorked: hoursWorked != null ? Number(hoursWorked) : null,
      enteredBy: req.user.id,
      source: "manual",
    };

    const mark = await DailyAttendanceMark.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
    })
      .populate("userId", "name email")
      .populate("projectId", "name");

    res.status(200).json({
      success: true,
      message: "Attendance mark updated",
      data: mark,
    });
  } catch (error) {
    logger.error("Set attendance mark error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const BULK_MARKS_LIMIT = 200;

/**
 * @desc    Set or update daily attendance marks in bulk (manual P/A for one day)
 * @route   POST /api/attendance/sheet/marks
 * @access  Private (attendance:update; Supervisor only for their projects)
 */
export const setAttendanceMarksBulk = async (req, res) => {
  try {
    const { projectId, date, entries } = req.body;

    if (!projectId || !date || !Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        message: "projectId, date, and entries (array) are required",
      });
    }

    if (entries.length > BULK_MARKS_LIMIT) {
      return res.status(400).json({
        success: false,
        message: `entries cannot exceed ${BULK_MARKS_LIMIT}`,
      });
    }

    const validStatuses = ["PRESENT", "ABSENT", "PARTIAL"];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.userId || !validStatuses.includes(e.status)) {
        return res.status(400).json({
          success: false,
          message: `entries[${i}]: userId and status (PRESENT|ABSENT|PARTIAL) are required`,
        });
      }
    }

    const organizationId = req.user.organizationId;
    const dateOnly = toDateOnly(new Date(date));
    const projectIdObj = mongoose.Types.ObjectId.createFromHexString(projectId);

    if (req.user.role?.name === ROLES.SUPERVISOR) {
      const myMembership = await ProjectMember.findOne({
        userId: req.user.id,
        organizationId,
        projectId: projectIdObj,
        isActive: true,
      });
      if (!myMembership) {
        return res.status(403).json({
          success: false,
          message: "You can only set attendance for your projects",
        });
      }
      const projectMemberUserIds = await ProjectMember.find({
        projectId: projectIdObj,
        organizationId,
        isActive: true,
      })
        .select("userId")
        .lean();
      const allowedIds = new Set(projectMemberUserIds.map((m) => m.userId.toString()));
      for (const e of entries) {
        const uid = typeof e.userId === "string" ? e.userId : e.userId?.toString?.();
        if (!uid || !allowedIds.has(uid)) {
          return res.status(403).json({
            success: false,
            message: "You can only set attendance for users in your projects",
          });
        }
      }
    }

    const bulkOps = entries.map((e) => {
      const userIdObj = mongoose.Types.ObjectId.createFromHexString(
        typeof e.userId === "string" ? e.userId : e.userId.toString()
      );
      const filter = {
        organizationId,
        userId: userIdObj,
        projectId: projectIdObj,
        date: dateOnly,
      };
      const update = {
        $set: {
          organizationId,
          userId: userIdObj,
          projectId: projectIdObj,
          date: dateOnly,
          status: e.status,
          hoursWorked: e.hoursWorked != null ? Number(e.hoursWorked) : null,
          enteredBy: req.user.id,
          source: "manual",
        },
      };
      return { updateOne: { filter, update, upsert: true } };
    });

    const result = await DailyAttendanceMark.bulkWrite(bulkOps);
    const updated = result.upsertedCount + result.modifiedCount;

    res.status(200).json({
      success: true,
      message: "Attendance marks updated",
      data: { updated },
    });
  } catch (error) {
    logger.error("Set attendance marks bulk error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export default {
  clockIn,
  clockOut,
  getMyAttendance,
  getAllAttendance,
  updateAttendanceMetadata,
  getAttendanceReport,
  getAttendanceSheet,
  setAttendanceMark,
  setAttendanceMarksBulk,
};
