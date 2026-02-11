import mongoose from 'mongoose';

const attendanceChangeRequestSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
    },
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      required: [true, 'Attendance ID is required'],
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requester ID is required'],
    },
    // Store the proposed changes
    proposedChanges: {
      clockIn: Date,
      clockOut: Date,
      metadata: {
        workUnits: Number,
        workType: String,
        extraSiteExpenses: Number,
      },
    },
    // Original values for comparison
    originalValues: {
      clockIn: Date,
      clockOut: Date,
      metadata: {
        workUnits: Number,
        workType: String,
        extraSiteExpenses: Number,
      },
    },
    reason: {
      type: String,
      required: [true, 'Reason for change is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    reviewNotes: String,
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
attendanceChangeRequestSchema.index({ organizationId: 1 });
attendanceChangeRequestSchema.index({ status: 1, createdAt: -1 });
attendanceChangeRequestSchema.index({ requestedBy: 1, createdAt: -1 });
attendanceChangeRequestSchema.index({ attendanceId: 1 });

const AttendanceChangeRequest = mongoose.model(
  'AttendanceChangeRequest',
  attendanceChangeRequestSchema
);

export default AttendanceChangeRequest;
