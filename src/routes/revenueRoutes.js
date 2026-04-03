import express from "express";
import { body } from "express-validator";
import { PERMISSIONS } from "../constants.js";
import {
  createRevenue,
  deleteRevenue,
  exportRevenue,
  getAllRevenue,
  getRevenue,
  getRevenueSummary,
  updateRevenue,
} from "../controllers/revenueController.js";
import { hasPermission, protect } from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { REVENUE_CATEGORIES, REVENUE_STATUS } from "../models/Revenue.js";

const router = express.Router();

const createRevenueValidation = [
  body("projectId").notEmpty().withMessage("Project is required"),
  body("amount")
    .isFloat({ min: 0 })
    .withMessage("Amount must be a positive number"),
  body("currency").optional().trim(),
  body("category")
    .isIn(REVENUE_CATEGORIES)
    .withMessage(`Category must be one of: ${REVENUE_CATEGORIES.join(", ")}`),
  body("description").optional().trim(),
  body("date").optional().isISO8601().withMessage("Valid date required"),
  body("status").optional().isIn(REVENUE_STATUS),
  body("clientName").optional().trim(),
  body("invoiceNumber").optional().trim(),
];

const updateRevenueValidation = [
  body("amount").optional().isFloat({ min: 0 }),
  body("currency").optional().trim(),
  body("category").optional().isIn(REVENUE_CATEGORIES),
  body("description").optional().trim(),
  body("date").optional().isISO8601(),
  body("status").optional().isIn(REVENUE_STATUS),
  body("clientName").optional().trim(),
  body("invoiceNumber").optional().trim(),
];

router.get("/", protect, hasPermission(PERMISSIONS.REVENUE_READ), getAllRevenue);
router.get(
  "/summary",
  protect,
  hasPermission(PERMISSIONS.REVENUE_READ),
  getRevenueSummary,
);
router.get(
  "/export",
  protect,
  hasPermission(PERMISSIONS.REVENUE_READ),
  exportRevenue,
);
router.get("/:id", protect, hasPermission(PERMISSIONS.REVENUE_READ), getRevenue);
router.post(
  "/",
  protect,
  hasPermission(PERMISSIONS.REVENUE_CREATE),
  createRevenueValidation,
  validate,
  createRevenue,
);
router.put(
  "/:id",
  protect,
  hasPermission(PERMISSIONS.REVENUE_UPDATE),
  updateRevenueValidation,
  validate,
  updateRevenue,
);
router.delete(
  "/:id",
  protect,
  hasPermission(PERMISSIONS.REVENUE_DELETE),
  deleteRevenue,
);

export default router;
