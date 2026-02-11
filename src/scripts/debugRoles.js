import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/Organization.js';
import OrganizationMember from '../models/OrganizationMember.js';
import Role from '../models/Role.js';
import Permission from '../models/Permission.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

dotenv.config();

const debugRoles = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB\n');

    logger.info('=== ALL PERMISSIONS ===');
    const permissions = await Permission.find();
    logger.info(`Total permissions: ${permissions.length}`);
    permissions.forEach((p) => {
      logger.info(`  - ${p.name} (${p.category})`);
    });

    logger.info('\n=== ORGANIZATIONS ===');
    const orgs = await Organization.find();
    logger.info(`Total organizations: ${orgs.length}`);
    orgs.forEach((o) => logger.info(`  - ${o.name} (${o.slug})`));

    logger.info('\n=== ROLES (per org) ===');
    const roles = await Role.find().populate('permissions');
    roles.forEach((role) => {
      const orgLabel = role.organizationId ? role.organizationId.toString() : 'global';
      logger.info(`\n${role.name} [org: ${orgLabel}] (${role.isActive ? 'Active' : 'Inactive'}):`);
      logger.info(`  Description: ${role.description}`);
      logger.info(`  Permissions (${role.permissions?.length || 0}):`);
      if (role.permissions?.length > 0) {
        role.permissions.forEach((p) => logger.info(`    - ${p.name}`));
      } else {
        logger.info('    (none)');
      }
    });

    logger.info('\n=== USERS (role via OrganizationMember) ===');
    const users = await User.find().select('-password');
    const memberships = await OrganizationMember.find({
      userId: { $in: users.map((u) => u._id) },
    })
      .populate('organizationId', 'name slug')
      .populate({ path: 'roleId', populate: { path: 'permissions' } });
    const byUser = memberships.reduce((acc, m) => {
      const uid = m.userId?.toString();
      if (!acc[uid]) acc[uid] = [];
      acc[uid].push(m);
      return acc;
    }, {});

    users.forEach((user) => {
      logger.info(`\n${user.name} (${user.email}):`);
      const mems = byUser[user._id.toString()] || [];
      if (mems.length === 0) {
        logger.info('  Orgs/roles: (none)');
      } else {
        mems.forEach((m) => {
          const orgName = m.organizationId?.name || m.organizationId;
          const roleName = m.roleId?.name || 'No role';
          const permNames = m.roleId?.permissions?.map((p) => p.name) || [];
          logger.info(`  Org: ${orgName} | Role: ${roleName}`);
          if (permNames.length > 0) logger.info(`    Permissions: ${permNames.join(', ')}`);
        });
      }
    });

    process.exit(0);
  } catch (error) {
    logger.error('Error', { error: error.message });
    process.exit(1);
  }
};

debugRoles();
