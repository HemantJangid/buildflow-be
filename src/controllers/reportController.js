import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Expense from "../models/Expense.js";
import OrganizationMember from "../models/OrganizationMember.js";
import Project from "../models/Project.js";
import Revenue from "../models/Revenue.js";
import User from "../models/User.js";
import logger from "../utils/logger.js";

/**
 * @desc    Get user cost report (aggregation for summary; same response shape)
 * @route   GET /api/reports/user-cost/:id
 * @access  Private/Admin/Manager
 */
export const getUserCost = async (req, res) => {
  try {
    const userId = req.params.id;
    const organizationId = req.user.organizationId;
    const { startDate, endDate } = req.query;

    const [isInOrg, user, aggResult] = await Promise.all([
      OrganizationMember.findOne({ userId, organizationId }),
      User.findById(userId).lean(),
      (async () => {
        const match = {
          organizationId,
          userId: new mongoose.Types.ObjectId(userId),
          status: "CLOCKED_OUT",
        };
        if (startDate || endDate) {
          match.clockIn = {};
          if (startDate) match.clockIn.$gte = new Date(startDate);
          if (endDate) match.clockIn.$lte = new Date(endDate);
        }
        const pipeline = [
          { $match: match },
          {
            $group: {
              _id: null,
              totalHoursWorked: {
                $sum: {
                  $cond: [
                    { $ne: ["$clockOut", null] },
                    {
                      $divide: [
                        { $subtract: ["$clockOut", "$clockIn"] },
                        1000 * 60 * 60,
                      ],
                    },
                    0,
                  ],
                },
              },
              totalWorkUnits: { $sum: { $ifNull: ["$metadata.workUnits", 0] } },
              extraSiteExpenses: {
                $sum: { $ifNull: ["$metadata.extraSiteExpenses", 0] },
              },
              daysWorked: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$clockIn" } } },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              totalHoursWorked: 1,
              totalWorkUnits: 1,
              extraSiteExpenses: 1,
              attendanceCount: "$count",
              daysWorked: { $size: "$daysWorked" },
            },
          },
        ];
        const out = await Attendance.aggregate(pipeline);
        return out[0] || null;
      })(),
    ]);

    if (!isInOrg || !user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const daysWorked = aggResult?.daysWorked ?? 0;
    const totalHoursWorked = aggResult?.totalHoursWorked ?? 0;
    const totalWorkUnits = aggResult?.totalWorkUnits ?? 0;
    const totalExtraSiteExpenses = aggResult?.extraSiteExpenses ?? 0;
    const attendanceCount = aggResult?.attendanceCount ?? 0;

    const { dailyRate, visaCost, transportCost, fixedExtras } = user.metadata || {};
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

    // Optional: return last 50 attendance records for compatibility (Reports.jsx does not display them)
    let attendanceRecords = [];
    const matchQuery = {
      organizationId,
      userId,
      status: "CLOCKED_OUT",
    };
    if (startDate || endDate) {
      matchQuery.clockIn = {};
      if (startDate) matchQuery.clockIn.$gte = new Date(startDate);
      if (endDate) matchQuery.clockIn.$lte = new Date(endDate);
    }
    attendanceRecords = await Attendance.find(matchQuery)
      .populate("projectId", "name")
      .sort({ clockIn: -1 })
      .limit(50)
      .lean();

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
          attendanceCount,
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
 * @desc    Get project attendance summary (aggregation for per-user stats; same response shape)
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
    }).lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const match = { organizationId, projectId: new mongoose.Types.ObjectId(projectId) };
    if (startDate || endDate) {
      match.clockIn = {};
      if (startDate) match.clockIn.$gte = new Date(startDate);
      if (endDate) match.clockIn.$lte = new Date(endDate);
    }

    const aggResult = await Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$userId",
          totalHours: {
            $sum: {
              $cond: [
                { $ne: ["$clockOut", null] },
                {
                  $divide: [
                    { $subtract: ["$clockOut", "$clockIn"] },
                    1000 * 60 * 60,
                  ],
                },
                0,
              ],
            },
          },
          totalWorkUnits: { $sum: { $ifNull: ["$metadata.workUnits", 0] } },
          totalExpenses: { $sum: { $ifNull: ["$metadata.extraSiteExpenses", 0] } },
          attendanceCount: { $sum: 1 },
          daysSet: {
            $addToSet: {
              $dateToString: { format: "%Y-%m-%d", date: "$clockIn" },
            },
          },
        },
      },
      {
        $project: {
          userId: "$_id",
          totalHours: 1,
          totalWorkUnits: 1,
          totalExpenses: 1,
          attendanceCount: 1,
          daysWorked: { $size: "$daysSet" },
        },
      },
    ]);

    const userIds = aggResult.map((r) => r.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select("name email metadata")
      .lean();
    const userMap = Object.fromEntries(
      users.map((u) => [u._id.toString(), u]),
    );

    const meta = (u) => u?.metadata || {};
    const formattedSummary = aggResult.map((r) => {
      const uid = r.userId.toString();
      const userDoc = userMap[uid] || {};
      const days = r.daysWorked;
      const dailyRate = meta(userDoc).dailyRate || 0;
      const transportCost = meta(userDoc).transportCost || 0;
      const visaCost = meta(userDoc).visaCost || 0;
      const fixedExtras = meta(userDoc).fixedExtras || 0;
      const labourCost =
        days * dailyRate +
        days * transportCost +
        visaCost +
        fixedExtras +
        (r.totalExpenses ?? 0);
      return {
        user: userDoc,
        totalHours: r.totalHours.toFixed(2),
        totalWorkUnits: r.totalWorkUnits,
        totalExpenses: r.totalExpenses,
        attendanceCount: r.attendanceCount,
        daysWorked: days,
        labourCost: Number(labourCost.toFixed(2)),
      };
    });

    const totalPersonDays = formattedSummary.reduce((s, u) => s + u.daysWorked, 0);
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

    const totalRecords = await Attendance.countDocuments(match);
    const attendanceRecords = await Attendance.find(match)
      .populate("userId", "name email metadata")
      .populate("projectId", "name location")
      .sort({ clockIn: -1 })
      .limit(100)
      .lean();

    res.status(200).json({
      success: true,
      data: {
        projectSummary,
        totalRecords,
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

/**
 * @desc    Get Profit & Loss report per project
 * @route   GET /api/reports/profit-loss?startDate=&endDate=&projectId=
 * @access  Private (reports:read)
 */
export const getProjectProfitLoss = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const { startDate, endDate, projectId } = req.query;

    const revenueMatch = { organizationId };
    const expenseMatch = { organizationId };

    if (startDate || endDate) {
      revenueMatch.date = {};
      expenseMatch.date = {};
      if (startDate) {
        revenueMatch.date.$gte = new Date(startDate);
        expenseMatch.date.$gte = new Date(startDate);
      }
      if (endDate) {
        revenueMatch.date.$lte = new Date(endDate);
        expenseMatch.date.$lte = new Date(endDate);
      }
    }

    if (projectId) {
      revenueMatch.projectId = new mongoose.Types.ObjectId(projectId);
      expenseMatch.projectId = new mongoose.Types.ObjectId(projectId);
    }

    const [revenueByProject, expenseByProject] = await Promise.all([
      Revenue.aggregate([
        { $match: revenueMatch },
        { $group: { _id: "$projectId", revenue: { $sum: "$amount" } } },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: "$projectId", expenses: { $sum: "$amount" } } },
      ]),
    ]);

    // Merge by projectId
    const projectMap = {};
    for (const r of revenueByProject) {
      const id = r._id.toString();
      projectMap[id] = { projectId: id, revenue: r.revenue, expenses: 0 };
    }
    for (const e of expenseByProject) {
      const id = e._id.toString();
      if (!projectMap[id]) {
        projectMap[id] = { projectId: id, revenue: 0, expenses: e.expenses };
      } else {
        projectMap[id].expenses = e.expenses;
      }
    }

    // Lookup project names
    const allProjectIds = Object.keys(projectMap);
    const projects = await Project.find({ _id: { $in: allProjectIds } })
      .select("name")
      .lean();
    const nameMap = Object.fromEntries(
      projects.map((p) => [p._id.toString(), p.name]),
    );

    const breakdown = Object.values(projectMap).map((p) => {
      const netProfit = p.revenue - p.expenses;
      const margin =
        p.revenue > 0 ? Number(((netProfit / p.revenue) * 100).toFixed(1)) : 0;
      return {
        projectId: p.projectId,
        projectName: nameMap[p.projectId] || p.projectId,
        revenue: Number(p.revenue.toFixed(2)),
        expenses: Number(p.expenses.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        margin,
      };
    });

    // Sort by revenue descending
    breakdown.sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = breakdown.reduce((s, p) => s + p.revenue, 0);
    const totalExpenses = breakdown.reduce((s, p) => s + p.expenses, 0);
    const netProfit = totalRevenue - totalExpenses;
    const avgMargin =
      totalRevenue > 0
        ? Number(((netProfit / totalRevenue) * 100).toFixed(1))
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        breakdown,
        totals: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalExpenses: Number(totalExpenses.toFixed(2)),
          netProfit: Number(netProfit.toFixed(2)),
          avgMargin,
        },
      },
    });
  } catch (error) {
    logger.error("Profit & Loss report error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export default {
  getUserCost,
  getProjectReport,
  getProjectProfitLoss,
};
