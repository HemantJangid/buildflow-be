import { CURRENCIES, DEFAULT_ORG_SETTINGS } from "../constants.js";
import Organization from "../models/Organization.js";
import logger from "../utils/logger.js";

/**
 * Deep merge: target is mutated, source wins for primitive values; objects are merged recursively.
 */
function deepMerge(target, source) {
  if (source == null) return target;
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === "object" &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * @desc    Get organization settings (merged with defaults)
 * @route   GET /api/organization/settings
 * @access  Private / system:settings
 */
export const getOrganizationSettings = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const org = await Organization.findById(organizationId)
      .select("settings name")
      .lean();
    if (!org) {
      return res
        .status(404)
        .json({ success: false, message: "Organization not found" });
    }
    const merged = JSON.parse(JSON.stringify(DEFAULT_ORG_SETTINGS));
    deepMerge(merged, org.settings || {});
    return res.status(200).json({
      success: true,
      data: merged,
      organizationName: org.name,
    });
  } catch (error) {
    logger.error("Get organization settings error", { error: error.message });
    return res.status(500).json({
      success: false,
      message: "Server error while fetching settings",
    });
  }
};

/**
 * @desc    Update organization settings (partial by section)
 * @route   PUT /api/organization/settings
 * @access  Private / system:settings
 */
export const updateOrganizationSettings = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const body = req.body || {};

    const org = await Organization.findById(organizationId);
    if (!org) {
      return res
        .status(404)
        .json({ success: false, message: "Organization not found" });
    }

    const current = org.settings || {};
    const next = JSON.parse(JSON.stringify(current));

    if (body.general != null) {
      next.general = next.general || {};
      if (body.general.currency != null) {
        if (!CURRENCIES.includes(body.general.currency)) {
          return res.status(400).json({
            success: false,
            message: `Currency must be one of: ${CURRENCIES.join(", ")}`,
          });
        }
        next.general.currency = body.general.currency;
      }
      if (body.general.displayName != null) {
        next.general.displayName = String(body.general.displayName).trim();
      }
    }

    if (body.expenses != null && body.expenses.categories != null) {
      const categories = Array.isArray(body.expenses.categories)
        ? body.expenses.categories.map((c) => String(c).trim()).filter(Boolean)
        : [];
      const unique = [...new Set(categories)];
      if (unique.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one expense category is required",
        });
      }
      next.expenses = next.expenses || {};
      next.expenses.categories = unique;
    }

    org.settings = next;
    await org.save();

    const merged = JSON.parse(JSON.stringify(DEFAULT_ORG_SETTINGS));
    deepMerge(merged, org.settings);
    return res.status(200).json({
      success: true,
      data: merged,
      message: "Settings updated successfully",
    });
  } catch (error) {
    logger.error("Update organization settings error", {
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      message: "Server error while updating settings",
    });
  }
};
