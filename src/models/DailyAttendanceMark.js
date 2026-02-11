import mongoose from 'mongoose';

/**
 * Manual or derived daily attendance mark (P/A/Partial) for a worker on a date.
 * Used for the daily attendance sheet; manual marks override clock-derived status.
 */
const dailyAttendanceMarkSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project is required'],
    },
    status: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'PARTIAL'],
      required: [true, 'Status is required'],
    },
    hoursWorked: {
      type: Number,
      default: null, // optional override; null = use from clock or default
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    source: {
      type: String,
      enum: ['manual', 'from_clock'],
      default: 'manual',
    },
  },
  { timestamps: true }
);

// One mark per user per day per project (normalize date to start of day for uniqueness)
dailyAttendanceMarkSchema.index({ organizationId: 1 });
dailyAttendanceMarkSchema.index(
  { userId: 1, projectId: 1, date: 1 },
  { unique: true }
);
dailyAttendanceMarkSchema.index({ projectId: 1, date: 1 });

const DailyAttendanceMark = mongoose.model('DailyAttendanceMark', dailyAttendanceMarkSchema);

export default DailyAttendanceMark;
