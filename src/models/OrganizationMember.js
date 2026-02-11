import mongoose from 'mongoose';

const organizationMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'Role is required'],
    },
    isDefault: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

organizationMemberSchema.index(
  { userId: 1, organizationId: 1 },
  { unique: true }
);
organizationMemberSchema.index({ organizationId: 1 });
organizationMemberSchema.index({ userId: 1 });

const OrganizationMember = mongoose.model(
  'OrganizationMember',
  organizationMemberSchema
);

export default OrganizationMember;
