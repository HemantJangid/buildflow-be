import mongoose from 'mongoose';

const projectMemberSchema = new mongoose.Schema(
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
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project is required'],
    },
    minWorkHours: {
      type: Number,
      min: 0,
      max: 24,
      default: null, // null means use user/project default
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

projectMemberSchema.index({ organizationId: 1 });
projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
projectMemberSchema.index({ userId: 1, isActive: 1 });
projectMemberSchema.index({ projectId: 1, isActive: 1 });

const ProjectMember = mongoose.model('ProjectMember', projectMemberSchema);

export default ProjectMember;
