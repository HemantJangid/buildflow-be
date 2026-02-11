/**
 * Demo data seed for multi-tenant app.
 * Prerequisites: Run seed:permissions then seed:admin (or signup once) so default org and roles exist.
 *
 * Usage: node src/scripts/seedDemoData.js
 *
 * Demo users (password for all non-admin: demo123):
 *   - admin@buildflow.com (Admin) - from seed:admin
 *   - supervisor@buildflow.com (Supervisor)
 *   - worker1@buildflow.com .. worker25@buildflow.com (Worker)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/Organization.js';
import OrganizationMember from '../models/OrganizationMember.js';
import Role from '../models/Role.js';
import Permission from '../models/Permission.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import ProjectMember from '../models/ProjectMember.js';
import Attendance from '../models/Attendance.js';
import DailyAttendanceMark from '../models/DailyAttendanceMark.js';
import AttendanceChangeRequest from '../models/AttendanceChangeRequest.js';
import { seedDefaultRolesForOrg } from '../utils/seedDefaultRolesForOrg.js';
import logger from '../utils/logger.js';
import { ROLES } from '../constants.js';

dotenv.config();

const DEMO_PASSWORD = 'demo123';

const PAGINATION_MIN = 25;
const NUM_PROJECTS = Math.max(PAGINATION_MIN, 25);
const NUM_WORKERS = Math.max(PAGINATION_MIN, 25);
const NUM_EXTRA_ROLES = 12;
const NUM_ATTENDANCE_RECORDS = 40;
const NUM_CHANGE_REQUESTS = 28;

function toDateOnly(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const seedDemoData = async () => {
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

    let adminRole = await Role.findOne({ organizationId: org._id, name: ROLES.ADMIN });
    let supervisorRole = await Role.findOne({ organizationId: org._id, name: ROLES.SUPERVISOR });
    let workerRole = await Role.findOne({ organizationId: org._id, name: ROLES.WORKER });

    if (!adminRole || !supervisorRole || !workerRole) {
      await seedDefaultRolesForOrg(org._id);
      adminRole = await Role.findOne({ organizationId: org._id, name: ROLES.ADMIN });
      supervisorRole = await Role.findOne({ organizationId: org._id, name: ROLES.SUPERVISOR });
      workerRole = await Role.findOne({ organizationId: org._id, name: ROLES.WORKER });
    }

    if (!adminRole || !supervisorRole || !workerRole) {
      logger.error('Roles not found for default org.');
      process.exit(1);
    }

    const existingAdmin = await User.findOne({ email: 'admin@buildflow.com' });
    if (!existingAdmin) {
      logger.error('Admin user not found. Run seed:admin first.');
      process.exit(1);
    }

    let adminMembership = await OrganizationMember.findOne({
      userId: existingAdmin._id,
      organizationId: org._id,
    });
    if (!adminMembership) {
      await OrganizationMember.create({
        userId: existingAdmin._id,
        organizationId: org._id,
        roleId: adminRole._id,
        isDefault: true,
      });
      logger.info('Added admin to default org');
    }

    logger.info('\n--- 1. Extra roles ---');
    const workerPermissions = workerRole.permissions || [];
    for (let r = 1; r <= NUM_EXTRA_ROLES; r++) {
      const name = `Custom Role ${r}`;
      const existing = await Role.findOne({ organizationId: org._id, name });
      if (!existing) {
        await Role.create({
          organizationId: org._id,
          name,
          description: `Demo custom role ${r}`,
          permissions: workerPermissions,
          isSystem: false,
          isActive: true,
        });
        logger.info(`Created role: ${name}`);
      }
    }

    logger.info('\n--- 2. Projects ---');
    const projects = [];
    const baseLat = 37.7749;
    const baseLng = -122.4194;
    for (let i = 1; i <= NUM_PROJECTS; i++) {
      const name = i <= 2 ? (i === 1 ? 'Site Alpha' : 'Site Beta') : `Project ${i}`;
      let proj = await Project.findOne({ organizationId: org._id, name });
      if (!proj) {
        proj = await Project.create({
          organizationId: org._id,
          name,
          location: { lat: baseLat + (i - 1) * 0.002, lng: baseLng + (i - 1) * 0.002 },
          radius: 100 + (i % 5) * 25,
          description: i <= 2 ? (i === 1 ? 'Main construction site' : 'Secondary site') : `Demo project ${i}`,
          isActive: true,
          createdBy: existingAdmin._id,
        });
        logger.info(`Created project: ${proj.name}`);
      } else {
        logger.info(`Project exists: ${proj.name}`);
      }
      projects.push(proj);
    }

    logger.info('\n--- 3. Users (Supervisor + Workers) ---');
    const categories = ['Carpenter', 'Electrician', 'Finance', 'Admin', 'Other'];
    const usersToCreate = [
      { name: 'Jane Supervisor', email: 'supervisor@buildflow.com', roleId: supervisorRole._id, category: 'Admin' },
    ];
    for (let i = 1; i <= NUM_WORKERS; i++) {
      usersToCreate.push({
        name: `Worker ${i}`,
        email: `worker${i}@buildflow.com`,
        roleId: workerRole._id,
        category: categories[(i - 1) % categories.length],
      });
    }

    const userMap = { admin: existingAdmin };
    for (const u of usersToCreate) {
      let user = await User.findOne({ email: u.email });
      if (!user) {
        user = await User.create({
          name: u.name,
          email: u.email,
          password: DEMO_PASSWORD,
          category: u.category,
          metadata: {
            dailyRate: u.roleId.equals(workerRole._id) ? 150 : 0,
            transportCost: 20,
            visaCost: 0,
            fixedExtras: 0,
          },
        });
        await OrganizationMember.create({
          userId: user._id,
          organizationId: org._id,
          roleId: u.roleId,
          isDefault: true,
        });
        logger.info(`Created user: ${user.email}`);
      } else {
        const mem = await OrganizationMember.findOne({ userId: user._id, organizationId: org._id });
        if (!mem) {
          await OrganizationMember.create({
            userId: user._id,
            organizationId: org._id,
            roleId: u.roleId,
            isDefault: true,
          });
        }
        logger.info(`User exists: ${user.email}`);
      }
      userMap[u.email] = user;
    }

    const supervisorUser = userMap['supervisor@buildflow.com'];
    const workers = [];
    for (let i = 1; i <= NUM_WORKERS; i++) {
      const u = userMap[`worker${i}@buildflow.com`];
      if (u) workers.push(u);
    }

    logger.info('\n--- 4. Project members ---');
    const projectMembersToAdd = [];
    if (supervisorUser) projectMembersToAdd.push({ organizationId: org._id, projectId: projects[0]._id, userId: supervisorUser._id });
    for (const w of workers) {
      projectMembersToAdd.push({ organizationId: org._id, projectId: projects[0]._id, userId: w._id });
    }
    for (let i = 0; i < Math.min(15, workers.length); i++) {
      projectMembersToAdd.push({ organizationId: org._id, projectId: projects[1]._id, userId: workers[i]._id });
    }
    for (let p = 2; p < Math.min(10, projects.length); p++) {
      for (let i = 0; i < 3; i++) {
        const w = workers[(p + i) % workers.length];
        if (w) projectMembersToAdd.push({ organizationId: org._id, projectId: projects[p]._id, userId: w._id });
      }
    }

    for (const m of projectMembersToAdd) {
      const exists = await ProjectMember.findOne({
        userId: m.userId,
        projectId: m.projectId,
        organizationId: org._id,
        isActive: true,
      });
      if (!exists) {
        await ProjectMember.create({ ...m, isActive: true });
      }
    }
    logger.info(`Ensured ${projectMembersToAdd.length} project member assignments`);

    logger.info('\n--- 5. Attendance ---');
    const now = new Date();
    const project0 = projects[0];
    const coords = { lat: 37.7749, lng: -122.4194 };
    let attendanceCreated = 0;
    const daysBack = 14;
    const workersForAttendance = workers.slice(0, Math.min(workers.length, 15));

    for (let dayOffset = -daysBack; dayOffset <= 0 && attendanceCreated < NUM_ATTENDANCE_RECORDS + 5; dayOffset++) {
      const dayStart = toDateOnly(addDays(now, dayOffset));
      const clockIn = new Date(dayStart);
      clockIn.setUTCHours(8, 0, 0, 0);
      const clockOut = new Date(dayStart);
      clockOut.setUTCHours(17, 30, 0, 0);
      const isToday = dayOffset === 0;
      for (let wi = 0; wi < workersForAttendance.length && attendanceCreated < NUM_ATTENDANCE_RECORDS + 5; wi++) {
        const worker = workersForAttendance[wi];
        if (!worker) continue;
        if (isToday && wi > 0) continue;
        const status = isToday && wi === 0 ? 'CLOCKED_IN' : 'CLOCKED_OUT';
        const existing = await Attendance.findOne({
          organizationId: org._id,
          userId: worker._id,
          projectId: project0._id,
          clockIn: { $gte: clockIn, $lt: addDays(clockIn, 1) },
        });
        if (!existing) {
          await Attendance.create({
            organizationId: org._id,
            userId: worker._id,
            projectId: project0._id,
            clockIn,
            clockOut: isToday && wi === 0 ? null : clockOut,
            clockInCoordinates: coords,
            clockOutCoordinates: isToday && wi === 0 ? undefined : coords,
            status,
            metadata: { workUnits: 1, workType: 'General' },
            attendanceStatus: isToday && wi === 0 ? 'PENDING' : 'PRESENT',
            hoursWorked: isToday && wi === 0 ? 0 : 9.5,
          });
          attendanceCreated++;
        }
      }
    }
    logger.info(`Created ${attendanceCreated} attendance records`);

    logger.info('\n--- 6. Daily attendance marks ---');
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const statuses = ['PRESENT', 'PRESENT', 'PARTIAL', 'ABSENT'];

    for (let d = 1; d <= Math.min(daysInMonth, now.getDate()); d++) {
      const date = new Date(currentMonth);
      date.setDate(d);
      const dateOnly = toDateOnly(date);
      for (let i = 0; i < workers.length; i++) {
        const w = workers[i];
        if (!w) continue;
        const status = statuses[i % statuses.length];
        const existing = await DailyAttendanceMark.findOne({
          organizationId: org._id,
          userId: w._id,
          projectId: project0._id,
          date: dateOnly,
        });
        if (!existing) {
          await DailyAttendanceMark.create({
            organizationId: org._id,
            userId: w._id,
            date: dateOnly,
            projectId: project0._id,
            status,
            hoursWorked: status === 'PRESENT' ? 8 : status === 'PARTIAL' ? 4 : null,
            source: 'manual',
            enteredBy: existingAdmin._id,
          });
        }
      }
    }
    logger.info(`Created daily marks for current month`);

    logger.info('\n--- 7. Change requests ---');
    const attendanceRecords = await Attendance.find({ organizationId: org._id, status: 'CLOCKED_OUT' })
      .sort({ clockIn: -1 })
      .limit(NUM_CHANGE_REQUESTS + 5)
      .lean();
    const crStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
    let changeRequestsCreated = 0;
    for (let i = 0; i < attendanceRecords.length && changeRequestsCreated < NUM_CHANGE_REQUESTS; i++) {
      const att = attendanceRecords[i];
      const status = crStatuses[i % crStatuses.length];
      const existing = await AttendanceChangeRequest.findOne({
        organizationId: org._id,
        attendanceId: att._id,
        requestedBy: att.userId,
      });
      if (!existing) {
        await AttendanceChangeRequest.create({
          organizationId: org._id,
          attendanceId: att._id,
          requestedBy: att.userId,
          reason: i % 3 === 0 ? 'Correct clock-out time.' : i % 3 === 1 ? 'Add work units.' : 'Fix work type.',
          status,
          reviewedBy: status !== 'PENDING' ? existingAdmin._id : undefined,
          reviewedAt: status !== 'PENDING' ? new Date() : undefined,
          reviewNotes: status === 'APPROVED' ? 'Approved.' : status === 'REJECTED' ? 'Rejected.' : undefined,
          originalValues: {
            clockIn: att.clockIn,
            clockOut: att.clockOut,
            metadata: att.metadata || {},
          },
          proposedChanges: {
            clockIn: att.clockIn,
            clockOut: att.clockOut,
            metadata: { workUnits: 2, workType: 'Installation', extraSiteExpenses: 0 },
          },
        });
        changeRequestsCreated++;
      }
    }
    logger.info(`Created ${changeRequestsCreated} change requests`);

    logger.info('\n--- Seed demo data complete ---');
    logger.info('Demo logins (password for all non-admin: demo123):');
    logger.info('  Admin:     admin@buildflow.com / admin123');
    logger.info('  Supervisor: supervisor@buildflow.com / demo123');
    logger.info(`  Workers:   worker1@buildflow.com .. worker${NUM_WORKERS}@buildflow.com / demo123`);
    process.exit(0);
  } catch (error) {
    logger.error('Seed demo data error', { error: error.message });
    process.exit(1);
  }
};

seedDemoData();
