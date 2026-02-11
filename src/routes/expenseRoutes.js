import express from "express";
import { body } from "express-validator";
import { PERMISSIONS } from "../constants.js";
import {
  createExpense,
  deleteExpense,
  exportExpenses,
  getAllExpenses,
  getExpense,
  getExpenseSummary,
  updateExpense,
} from "../controllers/expenseController.js";
import {
  hasAnyPermission,
  hasPermission,
  protect,
} from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { EXPENSE_CATEGORIES, EXPENSE_STATUS } from "../models/Expense.js";

const router = express.Router();

const createExpenseValidation = [
  body("projectId").notEmpty().withMessage("Project is required"),
  body("amount")
    .isFloat({ min: 0 })
    .withMessage("Amount must be a positive number"),
  body("currency").optional().trim(),
  body("category")
    .isIn(EXPENSE_CATEGORIES)
    .withMessage(`Category must be one of: ${EXPENSE_CATEGORIES.join(", ")}`),
  body("description").optional().trim(),
  body("date").optional().isISO8601().withMessage("Valid date required"),
  body("status").optional().isIn(EXPENSE_STATUS),
  body("vendor").optional().trim(),
  body("receiptNumber").optional().trim(),
];

const updateExpenseValidation = [
  body("amount").optional().isFloat({ min: 0 }),
  body("currency").optional().trim(),
  body("category").optional().isIn(EXPENSE_CATEGORIES),
  body("description").optional().trim(),
  body("date").optional().isISO8601(),
  body("status").optional().isIn(EXPENSE_STATUS),
  body("vendor").optional().trim(),
  body("receiptNumber").optional().trim(),
];

router.get(
  "/",
  protect,
  hasAnyPermission(
    PERMISSIONS.EXPENSES_READ_OWN,
    PERMISSIONS.EXPENSES_READ_ALL,
  ),
  getAllExpenses,
);
router.get(
  "/summary",
  protect,
  hasPermission(PERMISSIONS.EXPENSES_READ_ALL),
  getExpenseSummary,
);
router.get(
  "/export",
  protect,
  hasPermission(PERMISSIONS.EXPENSES_READ_ALL),
  exportExpenses,
);
router.get(
  "/:id",
  protect,
  hasAnyPermission(
    PERMISSIONS.EXPENSES_READ_OWN,
    PERMISSIONS.EXPENSES_READ_ALL,
  ),
  getExpense,
);
router.post(
  "/",
  protect,
  hasPermission(PERMISSIONS.EXPENSES_CREATE),
  createExpenseValidation,
  validate,
  createExpense,
);
router.put(
  "/:id",
  protect,
  hasPermission(PERMISSIONS.EXPENSES_UPDATE),
  updateExpenseValidation,
  validate,
  updateExpense,
);
router.delete(
  "/:id",
  protect,
  hasPermission(PERMISSIONS.EXPENSES_DELETE),
  deleteExpense,
);

export default router;
