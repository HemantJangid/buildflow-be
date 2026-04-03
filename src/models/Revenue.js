import mongoose from "mongoose";

export const REVENUE_CATEGORIES = [
  "Contract Payment",
  "Milestone Payment",
  "Advance Payment",
  "Retention Release",
  "Other",
];

export const REVENUE_STATUS = ["Draft", "Invoiced", "Received", "Void"];

const revenueSchema = new mongoose.Schema(
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
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recorded by is required"],
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
      enum: REVENUE_CATEGORIES,
    },
    description: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: [true, "Revenue date is required"],
    },
    status: {
      type: String,
      enum: REVENUE_STATUS,
      default: "Draft",
    },
    clientName: { type: String, trim: true },
    invoiceNumber: { type: String, trim: true },
    invoiceUrl: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

revenueSchema.index({ organizationId: 1 });
revenueSchema.index({ projectId: 1 });
revenueSchema.index({ recordedBy: 1 });
revenueSchema.index({ date: 1 });
revenueSchema.index({ status: 1 });
revenueSchema.index({ category: 1 });

const Revenue = mongoose.model("Revenue", revenueSchema);
export default Revenue;
