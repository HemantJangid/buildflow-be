import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    actorName: { type: String },
    actorEmail: { type: String },
    action: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'],
      required: true,
    },
    resourceType: {
      type: String,
      enum: [
        'USER',
        'PROJECT',
        'ATTENDANCE',
        'EXPENSE',
        'REVENUE',
        'ROLE',
        'ORGANIZATION',
        'CHANGE_REQUEST',
        'PROJECT_MEMBER',
      ],
      required: true,
    },
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    resourceLabel: { type: String },
    // { field: { before, after } } — populated for UPDATE actions
    changes: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: true },
);

// Primary query index: org logs sorted by most recent first
auditLogSchema.index({ organizationId: 1, createdAt: -1 });
// Filter by actor
auditLogSchema.index({ actorId: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
