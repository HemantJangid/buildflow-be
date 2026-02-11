import mongoose from "mongoose";

const EXPENSE_STATUS = ["Draft", "Submitted", "Approved", "Rejected", "Void"];
const EXPENSE_CATEGORIES = [
  "Materials",
  "Equipment",
  "Transport",
  "Subsistence",
  "Other",
];

const expenseSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required"],
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project is required"],
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Submitted by is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: EXPENSE_CATEGORIES,
    },
    description: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: [true, "Expense date is required"],
    },
    status: {
      type: String,
      enum: EXPENSE_STATUS,
      default: "Draft",
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    approvalComment: { type: String, trim: true },
    vendor: { type: String, trim: true },
    receiptNumber: { type: String, trim: true },
    receiptUrl: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

expenseSchema.index({ organizationId: 1 });
expenseSchema.index({ projectId: 1 });
expenseSchema.index({ submittedBy: 1 });
expenseSchema.index({ date: 1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ category: 1 });

const Expense = mongoose.model("Expense", expenseSchema);
export { EXPENSE_CATEGORIES, EXPENSE_STATUS };
export default Expense;
