import { PERMISSIONS, ROLES } from "../constants.js";
import Revenue from "../models/Revenue.js";
import Project from "../models/Project.js";
import ProjectMember from "../models/ProjectMember.js";
import logger from "../utils/logger.js";
import { getPagination, paginatedResponse } from "../utils/pagination.js";

async function getAllowedProjectIds(req) {
  if (req._allowedProjectIds !== undefined) {
    return req._allowedProjectIds;
  }
  const organizationId = req.user.organizationId;
  let ids;
  if (req.user.role?.name === ROLES.ADMIN) {
    ids = await Project.find({ organizationId }).distinct("_id");
    req._allowedProjectIds = ids.map((id) => id.toString());
  } else {
    const memberships = await ProjectMember.find({
      userId: req.user.id,
      organizationId,
      isActive: true,
    }).select("projectId");
    req._allowedProjectIds = [
      ...new Set(memberships.map((m) => m.projectId.toString())),
    ];
  }
  return req._allowedProjectIds;
}

/**
 * @desc    Get all revenue (paginated)
 * @route   GET /api/revenue?page=1&limit=10&projectId=&startDate=&endDate=&category=&status=
 * @access  Private (revenue:read)
 */
export const getAllRevenue = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const { page, limit, skip } = getPagination(req.query, 10);
    const { projectId, startDate, endDate, category, status } = req.query;

    const projectIds = await getAllowedProjectIds(req);
    if (projectIds.length === 0) {
      return paginatedResponse(res, { data: [], total: 0, page, limit });
    }

    const query = { organizationId, projectId: { $in: projectIds } };

    const hasReadAll = req.user.permissions?.includes(PERMISSIONS.REVENUE_READ);
    if (!hasReadAll) {
      query.recordedBy = req.user.id;
    }

    if (projectId) query.projectId = projectId;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    if (category) query.category = category;
    if (status) query.status = status;

    const [revenues, total] = await Promise.all([
      Revenue.find(query)
        .populate("projectId", "name")
        .populate("recordedBy", "name email")
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Revenue.countDocuments(query),
    ]);

    return paginatedResponse(res, { data: revenues, total, page, limit });
  } catch (error) {
    logger.error("Get revenue error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Get single revenue record
 * @route   GET /api/revenue/:id
 * @access  Private
 */
export const getRevenue = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const projectIds = await getAllowedProjectIds(req);

    const revenue = await Revenue.findOne({
      _id: req.params.id,
      organizationId,
      projectId: { $in: projectIds },
    })
      .populate("projectId", "name")
      .populate("recordedBy", "name email")
      .lean();

    if (!revenue) {
      return res
        .status(404)
        .json({ success: false, message: "Revenue not found" });
    }

    const hasReadAll = req.user.permissions?.includes(PERMISSIONS.REVENUE_READ);
    if (!hasReadAll && revenue.recordedBy?._id?.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ success: false, message: "Revenue not found" });
    }

    return res.status(200).json({ success: true, data: revenue });
  } catch (error) {
    logger.error("Get revenue error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Create revenue record
 * @route   POST /api/revenue
 * @access  Private (revenue:create)
 */
export const createRevenue = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const projectIds = await getAllowedProjectIds(req);
    const {
      projectId,
      amount,
      currency,
      category,
      description,
      date,
      status,
      clientName,
      invoiceNumber,
    } = req.body;

    if (!projectIds.includes(projectId)) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    const revenue = await Revenue.create({
      organizationId,
      projectId,
      recordedBy: req.user.id,
      amount: Number(amount),
      currency: currency || "USD",
      category,
      description: description || "",
      date: date ? new Date(date) : new Date(),
      status: status || "Draft",
      clientName: clientName || "",
      invoiceNumber: invoiceNumber || "",
    });

    await revenue.populate("projectId", "name");
    await revenue.populate("recordedBy", "name email");

    res.status(201).json({
      success: true,
      message: "Revenue created successfully",
      data: revenue,
    });
  } catch (error) {
    logger.error("Create revenue error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Update revenue record
 * @route   PUT /api/revenue/:id
 * @access  Private (revenue:update)
 */
export const updateRevenue = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const projectIds = await getAllowedProjectIds(req);
    const revenue = await Revenue.findOne({
      _id: req.params.id,
      organizationId,
      projectId: { $in: projectIds },
    });

    if (!revenue) {
      return res
        .status(404)
        .json({ success: false, message: "Revenue not found" });
    }

    const hasReadAll = req.user.permissions?.includes(PERMISSIONS.REVENUE_READ);
    if (!hasReadAll && revenue.recordedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own revenue records",
      });
    }

    const {
      amount,
      currency,
      category,
      description,
      date,
      status,
      clientName,
      invoiceNumber,
    } = req.body;
    if (amount != null) revenue.amount = Number(amount);
    if (currency != null) revenue.currency = currency;
    if (category != null) revenue.category = category;
    if (description != null) revenue.description = description;
    if (date != null) revenue.date = new Date(date);
    if (status != null) revenue.status = status;
    if (clientName != null) revenue.clientName = clientName;
    if (invoiceNumber != null) revenue.invoiceNumber = invoiceNumber;

    await revenue.save();
    await revenue.populate("projectId", "name");
    await revenue.populate("recordedBy", "name email");

    return res.status(200).json({ success: true, data: revenue });
  } catch (error) {
    logger.error("Update revenue error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Delete revenue record
 * @route   DELETE /api/revenue/:id
 * @access  Private (revenue:delete)
 */
export const deleteRevenue = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const projectIds = await getAllowedProjectIds(req);

    const revenue = await Revenue.findOne({
      _id: req.params.id,
      organizationId,
      projectId: { $in: projectIds },
    });

    if (!revenue) {
      return res
        .status(404)
        .json({ success: false, message: "Revenue not found" });
    }

    await Revenue.findByIdAndDelete(revenue._id);
    return res.status(200).json({ success: true, message: "Revenue deleted" });
  } catch (error) {
    logger.error("Delete revenue error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Get revenue summary (aggregation-based)
 * @route   GET /api/revenue/summary?groupBy=project|category|period&startDate=&endDate=&projectId=
 * @access  Private (revenue:read)
 */
export const getRevenueSummary = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const projectIds = await getAllowedProjectIds(req);
    if (projectIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { groups: [], totalAmount: 0, count: 0 },
      });
    }

    const { groupBy, startDate, endDate, projectId } = req.query;
    const key = groupBy || "project";

    const matchStage = { organizationId, projectId: { $in: projectIds } };
    if (projectId) matchStage.projectId = projectId;
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    let groupId;
    if (key === "project") groupId = "$projectId";
    else if (key === "category") groupId = { $ifNull: ["$category", "Other"] };
    else if (key === "period")
      groupId = { $dateToString: { format: "%Y-%m", date: "$date" } };
    else
      return res.status(200).json({
        success: true,
        data: { groups: [], totalAmount: 0, count: 0 },
      });

    const [totalsResult, groupsResult] = await Promise.all([
      Revenue.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Revenue.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: groupId,
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: key === "period" ? { _id: 1 } : { amount: -1 } },
      ]),
    ]);

    const totalAmount = totalsResult[0]?.totalAmount ?? 0;
    const count = totalsResult[0]?.count ?? 0;

    let groups = groupsResult.map((g) => ({
      id: g._id?.toString?.() ?? g._id,
      label: g._id?.toString?.() ?? g._id,
      amount: g.amount,
      count: g.count,
    }));

    if (key === "project" && groups.length > 0) {
      const Project = (await import("../models/Project.js")).default;
      const ids = groups.map((g) => g.id);
      const projects = await Project.find({ _id: { $in: ids } })
        .select("name")
        .lean();
      const nameMap = Object.fromEntries(
        projects.map((p) => [p._id.toString(), p.name || p._id.toString()]),
      );
      groups = groups.map((g) => ({ ...g, label: nameMap[g.id] || g.id }));
    }

    return res.status(200).json({
      success: true,
      data: { groups, totalAmount, count },
    });
  } catch (error) {
    logger.error("Revenue summary error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Export revenue as CSV
 * @route   GET /api/revenue/export
 * @access  Private (revenue:read)
 */
export const exportRevenue = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const projectIds = await getAllowedProjectIds(req);
    if (projectIds.length === 0) {
      res.setHeader("Content-Type", "text/csv");
      return res
        .status(200)
        .send(
          "date,project,category,amount,currency,status,clientName,invoiceNumber,recordedBy,description\n",
        );
    }

    const { projectId, startDate, endDate, category, status } = req.query;
    const query = { organizationId, projectId: { $in: projectIds } };
    if (projectId) query.projectId = projectId;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    if (category) query.category = category;
    if (status) query.status = status;

    const revenues = await Revenue.find(query)
      .populate("projectId", "name")
      .populate("recordedBy", "name email")
      .sort({ date: -1 })
      .limit(5000)
      .lean();

    const rows = revenues.map((r) => {
      const date = r.date ? new Date(r.date).toISOString().slice(0, 10) : "";
      const project = (r.projectId?.name || r.projectId || "")
        .toString()
        .replace(/"/g, '""');
      const recordedBy = (
        r.recordedBy?.name ||
        r.recordedBy?.email ||
        r.recordedBy ||
        ""
      )
        .toString()
        .replace(/"/g, '""');
      const desc = (r.description || "").toString().replace(/"/g, '""');
      const client = (r.clientName || "").toString().replace(/"/g, '""');
      const invoice = (r.invoiceNumber || "").toString().replace(/"/g, '""');
      return `"${date}","${project}","${r.category || ""}",${r.amount || 0},"${r.currency || "USD"}","${r.status || ""}","${client}","${invoice}","${recordedBy}","${desc}"`;
    });
    const csv =
      "date,project,category,amount,currency,status,clientName,invoiceNumber,recordedBy,description\n" +
      rows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=revenue.csv");
    return res.status(200).send(csv);
  } catch (error) {
    logger.error("Export revenue error", { error: error.message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};
