import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Permission name is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['users', 'projects', 'attendance', 'team', 'teams', 'projectMembers', 'reports', 'roles', 'system'],
      required: true,
    },
    isSystem: {
      type: Boolean,
      default: false, // System permissions cannot be deleted
    },
  },
  {
    timestamps: true,
  }
);

const Permission = mongoose.model('Permission', permissionSchema);

export default Permission;
