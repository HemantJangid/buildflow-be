import mongoose from 'mongoose';
import { requestContext } from './requestContext.js';
import logger from './logger.js';

const SKIP_FIELDS = new Set([
  'password',
  '__v',
  '_id',
  'updatedAt',
  'createdAt',
]);

/**
 * Compute a field-level diff between two plain objects.
 * Returns { field: { before, after } } for changed fields only.
 * Returns null if no meaningful changes detected.
 */
export function diffChanges(before, after) {
  if (!before || !after) return null;

  const changes = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;

    const bVal = before[key];
    const aVal = after[key];

    // Simple equality check; JSON.stringify handles nested objects and arrays
    const bStr = JSON.stringify(bVal);
    const aStr = JSON.stringify(aVal);

    if (bStr !== aStr) {
      changes[key] = { before: bVal, after: aVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Fire-and-forget audit log creator.
 * Reads context from AsyncLocalStorage so it never needs req passed explicitly.
 */
function createAuditLog({ organizationId, actorId, actorName, actorEmail, ip, action, resourceType, resourceId, resourceLabel, changes }) {
  // Lazy-require to avoid circular import at module load time
  const AuditLog = mongoose.model('AuditLog');

  AuditLog.create({
    organizationId,
    actorId,
    actorName,
    actorEmail,
    action,
    resourceType,
    resourceId,
    resourceLabel,
    changes: changes || undefined,
    ipAddress: ip,
  }).catch((err) => logger.error('Audit log write failed', { error: err.message }));
}

/**
 * Mongoose plugin that automatically logs CREATE, UPDATE, and DELETE actions.
 *
 * Usage in a model file:
 *   import { auditPlugin } from '../utils/auditPlugin.js';
 *   schema.plugin(auditPlugin, { resourceType: 'PROJECT', labelField: 'name' });
 *
 * @param {mongoose.Schema} schema
 * @param {{ resourceType: string, labelField: string }} options
 */
export function auditPlugin(schema, options = {}) {
  const { resourceType, labelField = 'name' } = options;

  // ─── save() ──────────────────────────────────────────────────────────────

  // Capture before-state for UPDATE via save()
  schema.pre('save', async function () {
    if (!this.isNew) {
      try {
        this._auditBefore = await this.constructor.findById(this._id).lean();
      } catch (_) {
        // Non-critical; diff will be skipped
      }
    }
    this._auditWasNew = this.isNew;
  });

  schema.post('save', function (doc) {
    const ctx = requestContext.getStore();
    if (!ctx?.user) return;

    const { user, ip } = ctx;
    const action = doc._auditWasNew ? 'CREATE' : 'UPDATE';
    const changes = action === 'UPDATE' ? diffChanges(doc._auditBefore, doc.toObject()) : undefined;

    createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      ip,
      action,
      resourceType,
      resourceId: doc._id,
      resourceLabel: String(doc[labelField] || doc._id),
      changes,
    });
  });

  // ─── deleteOne() on document ─────────────────────────────────────────────

  schema.pre('deleteOne', { document: true, query: false }, function () {
    this._auditDeletedDoc = this.toObject();
  });

  schema.post('deleteOne', { document: true, query: false }, function () {
    const ctx = requestContext.getStore();
    if (!ctx?.user) return;

    const { user, ip } = ctx;
    const doc = this._auditDeletedDoc;

    createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      ip,
      action: 'DELETE',
      resourceType,
      resourceId: doc?._id,
      resourceLabel: String(doc?.[labelField] || doc?._id),
    });
  });

  // ─── findOneAndDelete() ───────────────────────────────────────────────────

  schema.post('findOneAndDelete', function (doc) {
    if (!doc) return;
    const ctx = requestContext.getStore();
    if (!ctx?.user) return;

    const { user, ip } = ctx;

    createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      ip,
      action: 'DELETE',
      resourceType,
      resourceId: doc._id,
      resourceLabel: String(doc[labelField] || doc._id),
    });
  });
}
