import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/Organization.js';
import OrganizationMember from '../models/OrganizationMember.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { seedDefaultRolesForOrg } from '../utils/seedDefaultRolesForOrg.js';
import logger from '../utils/logger.js';
import { ROLES } from '../constants.js';

dotenv.config();

/**
 * Bootstrap a default org and admin user for local/dev. Run seedPermissions first.
 */
const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');

    let org = await Organization.findOne({ slug: 'default' });
    if (!org) {
      org = await Organization.create({
        name: 'Default Organization',
        slug: 'default',
        isActive: true,
      });
      logger.info('Created default Organization');
    }

    const existingAdmin = await User.findOne({ email: 'admin@buildflow.com' });
    if (existingAdmin) {
      const existingMembership = await OrganizationMember.findOne({
        userId: existingAdmin._id,
        organizationId: org._id,
      });
      if (existingMembership) {
        logger.info('Admin user already exists and is in default org');
        process.exit(0);
      }
      const adminRole = await Role.findOne({
        organizationId: org._id,
        name: ROLES.ADMIN,
      });
      if (adminRole) {
        await OrganizationMember.create({
          userId: existingAdmin._id,
          organizationId: org._id,
          roleId: adminRole._id,
          isDefault: true,
        });
        logger.info('Added existing admin user to default org');
      }
      process.exit(0);
    }

    let adminRole = await Role.findOne({
      organizationId: org._id,
      name: ROLES.ADMIN,
    });
    if (!adminRole) {
      const roleMap = await seedDefaultRolesForOrg(org._id);
      adminRole = await Role.findById(roleMap[ROLES.ADMIN]);
    }
    if (!adminRole) {
      logger.error('Admin role not found. Run seed:permissions first.');
      process.exit(1);
    }

    const user = await User.create({
      name: 'Admin User',
      email: 'admin@buildflow.com',
      password: 'admin123',
      metadata: {
        dailyRate: 0,
        visaCost: 0,
        transportCost: 0,
        fixedExtras: 0,
      },
    });

    await OrganizationMember.create({
      userId: user._id,
      organizationId: org._id,
      roleId: adminRole._id,
      isDefault: true,
    });

    logger.info('Admin user created:');
    logger.info('Email: admin@buildflow.com');
    logger.info('Password: admin123');

    process.exit(0);
  } catch (error) {
    logger.error('Error seeding admin', { error: error.message });
    process.exit(1);
  }
};

seedAdmin();
