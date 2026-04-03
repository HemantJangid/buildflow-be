import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project ID is required'],
    },
    clockIn: {
      type: Date,
      required: [true, 'Clock in time is required'],
    },
    clockOut: {
      type: Date,
    },
    clockInCoordinates: {
      lat: {
        type: Number,
        required: [true, 'Clock-in latitude is required'],
      },
      lng: {
        type: Number,
        required: [true, 'Clock-in longitude is required'],
      },
    },
    clockOutCoordinates: {
      lat: {
        type: Number,
      },
      lng: {
        type: Number,
      },
    },
    metadata: {
      workUnits: {
        type: Number,
        default: 0,
      },
      workType: {
        type: String,
        trim: true,
      },
      extraSiteExpenses: {
        type: Number,
        default: 0,
      },
    },
    status: {
      type: String,
      enum: ['CLOCKED_IN', 'CLOCKED_OUT'],
      default: 'CLOCKED_IN',
    },
    // Attendance status based on hours worked
    attendanceStatus: {
      type: String,
      enum: ['PENDING', 'PRESENT', 'ABSENT', 'PARTIAL'],
      default: 'PENDING',
    },
    hoursWorked: {
      type: Number,
      default: 0,
    },
    minHoursRequired: {
      type: Number,
      default: null, // Snapshot at clock-out
    },
    // Track edits - supervisors can only edit once
    editCount: {
      type: Number,
      default: 0,
    },
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lastEditedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
attendanceSchema.index({ organizationId: 1 });
attendanceSchema.index({ userId: 1, createdAt: -1 });
attendanceSchema.index({ projectId: 1, createdAt: -1 });
attendanceSchema.index({ userId: 1, status: 1 });
attendanceSchema.index({ attendanceStatus: 1, createdAt: -1 });
attendanceSchema.index({ organizationId: 1, status: 1, clockIn: -1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;
