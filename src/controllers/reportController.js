import Attendance from "../models/Attendance.js";
import OrganizationMember from "../models/OrganizationMember.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import logger from "../utils/logger.js";

/**
 * @desc    Get user cost report
 * @route   GET /api/reports/user-cost/:id
 * @access  Private/Admin/Manager
 */
export const getUserCost = async (req, res) => {
  try {
    const userId = req.params.id;
    const organizationId = req.user.organizationId;
    const { startDate, endDate } = req.query;

    const isInOrg = await OrganizationMember.findOne({
      userId,
      organizationId,
    });
    if (!isInOrg) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const query = { organizationId, userId, status: "CLOCKED_OUT" };

    if (startDate || endDate) {
      query.clockIn = {};
      if (startDate) query.clockIn.$gte = new Date(startDate);
      if (endDate) query.clockIn.$lte = new Date(endDate);
    }

    // Get attendance records
    const attendanceRecords = await Attendance.find(query)
      .populate("projectId", "name")
      .sort({ clockIn: -1 });

    // Calculate costs
    const { dailyRate, visaCost, transportCost, fixedExtras } = user.metadata;

    // Calculate total days worked
    const uniqueDays = new Set(
      attendanceRecords.map(
        (record) => record.clockIn.toISOString().split("T")[0],
      ),
    );
    const daysWorked = uniqueDays.size;

    // Calculate total hours worked
    const totalHoursWorked = attendanceRecords.reduce((total, record) => {
      if (record.clockOut) {
        const hours = (record.clockOut - record.clockIn) / (1000 * 60 * 60);
        return total + hours;
      }
      return total;
    }, 0);

    // Calculate total work units
    const totalWorkUnits = attendanceRecords.reduce((total, record) => {
      return total + (record.metadata?.workUnits || 0);
    }, 0);

    // Calculate total extra site expenses
    const totalExtraSiteExpenses = attendanceRecords.reduce((total, record) => {
      return total + (record.metadata?.extraSiteExpenses || 0);
    }, 0);

    // Calculate costs
    const baseCost = daysWorked * (dailyRate || 0);
    const totalTransportCost = daysWorked * (transportCost || 0);
    const totalFixedExtras = fixedExtras || 0;
    const totalVisaCost = visaCost || 0;

    const totalCost =
      baseCost +
      totalTransportCost +
      totalFixedExtras +
      totalVisaCost +
      totalExtraSiteExpenses;

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          metadata: user.metadata,
        },
        summary: {
          daysWorked,
          totalHoursWorked: totalHoursWorked.toFixed(2),
          totalWorkUnits,
          attendanceCount: attendanceRecords.length,
        },
        costs: {
          baseCost: baseCost.toFixed(2),
          transportCost: totalTransportCost.toFixed(2),
          fixedExtras: totalFixedExtras.toFixed(2),
          visaCost: totalVisaCost.toFixed(2),
          extraSiteExpenses: totalExtraSiteExpenses.toFixed(2),
          totalCost: totalCost.toFixed(2),
        },
        breakdown: {
          dailyRate: dailyRate || 0,
          perDayTransport: transportCost || 0,
        },
        attendanceRecords,
      },
    });
  } catch (error) {
    logger.error("Get user cost error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error during report generation",
    });
  }
};

/**
 * @desc    Get project attendance summary
 * @route   GET /api/reports/project/:id
 * @access  Private/Admin/Manager
 */
export const getProjectReport = async (req, res) => {
  try {
    const projectId = req.params.id;
    const organizationId = req.user.organizationId;
    const { startDate, endDate } = req.query;

    const project = await Project.findOne({
      _id: projectId,
      organizationId,
    });
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const query = { organizationId, projectId };

    if (startDate || endDate) {
      query.clockIn = {};
      if (startDate) query.clockIn.$gte = new Date(startDate);
      if (endDate) query.clockIn.$lte = new Date(endDate);
    }

    const attendanceRecords = await Attendance.find(query)
      .populate("userId", "name email metadata")
      .populate("projectId", "name location")
      .sort({ clockIn: -1 });

    // Group by user
    const userSummary = {};

    attendanceRecords.forEach((record) => {
      const uid = record.userId._id.toString();

      if (!userSummary[uid]) {
        userSummary[uid] = {
          user: record.userId,
          totalHours: 0,
          totalWorkUnits: 0,
          totalExpenses: 0,
          attendanceCount: 0,
          daysWorked: new Set(),
        };
      }

      userSummary[uid].attendanceCount++;
      userSummary[uid].totalWorkUnits += record.metadata?.workUnits || 0;
      userSummary[uid].totalExpenses += record.metadata?.extraSiteExpenses || 0;
      userSummary[uid].daysWorked.add(
        record.clockIn.toISOString().split("T")[0],
      );

      if (record.clockOut) {
        const hours = (record.clockOut - record.clockIn) / (1000 * 60 * 60);
        userSummary[uid].totalHours += hours;
      }
    });

    // Convert Set to count, compute labourCost per worker, and format summary
    const meta = (u) => u?.metadata || {};
    const formattedSummary = Object.values(userSummary).map((summary) => {
      const days = summary.daysWorked.size;
      const dailyRate = meta(summary.user).dailyRate || 0;
      const transportCost = meta(summary.user).transportCost || 0;
      const visaCost = meta(summary.user).visaCost || 0;
      const fixedExtras = meta(summary.user).fixedExtras || 0;
      const labourCost =
        days * dailyRate +
        days * transportCost +
        visaCost +
        fixedExtras +
        summary.totalExpenses;
      return {
        ...summary,
        totalHours: summary.totalHours.toFixed(2),
        daysWorked: days,
        labourCost: Number(labourCost.toFixed(2)),
      };
    });

    // Project-level summary
    const totalPersonDays = formattedSummary.reduce(
      (s, u) => s + u.daysWorked,
      0,
    );
    const totalHours = formattedSummary.reduce(
      (s, u) => s + parseFloat(u.totalHours, 10),
      0,
    );
    const totalWorkUnits = formattedSummary.reduce(
      (s, u) => s + u.totalWorkUnits,
      0,
    );
    const totalExtraExpenses = formattedSummary.reduce(
      (s, u) => s + (u.totalExpenses ?? 0),
      0,
    );
    const totalLabourCost = formattedSummary.reduce(
      (s, u) => s + (u.labourCost ?? 0),
      0,
    );

    const projectSummary = {
      projectName: project.name,
      startDate: startDate || null,
      endDate: endDate || null,
      totalWorkers: formattedSummary.length,
      totalPersonDays,
      totalHours: Number(totalHours.toFixed(2)),
      totalWorkUnits,
      totalExtraExpenses,
      totalLabourCost: Number(totalLabourCost.toFixed(2)),
    };

    res.status(200).json({
      success: true,
      data: {
        projectSummary,
        totalRecords: attendanceRecords.length,
        userSummary: formattedSummary,
        attendanceRecords,
      },
    });
  } catch (error) {
    logger.error("Get project report error", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error during report generation",
    });
  }
};

export default {
  getUserCost,
  getProjectReport,
};
