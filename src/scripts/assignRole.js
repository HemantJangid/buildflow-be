import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/Organization.js';
import OrganizationMember from '../models/OrganizationMember.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

dotenv.config();

const email = process.argv[2];
const roleName = process.argv[3];
const orgSlug = process.argv[4] || 'default';

if (!email || !roleName) {
  logger.info('Usage: node src/scripts/assignRole.js <email> <roleName> [orgSlug]');
  logger.info('Example: node src/scripts/assignRole.js john@example.com Supervisor');
  process.exit(1);
}

const assignRole = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB\n');

    const org = await Organization.findOne({ slug: orgSlug });
    if (!org) {
      logger.error(`Organization with slug "${orgSlug}" not found.`);
      process.exit(1);
    }

    const role = await Role.findOne({ organizationId: org._id, name: roleName });
    if (!role) {
      logger.error(`Role "${roleName}" not found in org "${orgSlug}".`);
      const roles = await Role.find({ organizationId: org._id });
      roles.forEach((r) => logger.info(`  - ${r.name}`));
      process.exit(1);
    }

    const user = await User.findOne({ email });
    if (!user) {
      logger.error(`User with email "${email}" not found.`);
      process.exit(1);
    }

    const membership = await OrganizationMember.findOne({
      userId: user._id,
      organizationId: org._id,
    });
    if (!membership) {
      logger.error(`User "${email}" is not a member of org "${orgSlug}".`);
      process.exit(1);
    }

    membership.roleId = role._id;
    await membership.save();

    logger.info(`Successfully assigned role "${roleName}" to user "${email}" in org "${orgSlug}"`);
    await role.populate('permissions');
    if (role.permissions?.length) {
      logger.info('Role permissions:');
      role.permissions.forEach((p) => logger.info(`  - ${p.name}`));
    }

    process.exit(0);
  } catch (error) {
    logger.error('Error', { error: error.message });
    process.exit(1);
  }
};

assignRole();
