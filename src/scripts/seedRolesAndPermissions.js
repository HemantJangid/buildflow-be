import dotenv from "dotenv";
import mongoose from "mongoose";
import { PERMISSIONS } from "../constants.js";
import Permission from "../models/Permission.js";
import logger from "../utils/logger.js";

dotenv.config();

// Define all system permissions (names from constants). Roles are now per-org; only permissions are global.
const systemPermissions = [
  {
    name: PERMISSIONS.USERS_CREATE,
    description: "Create new users",
    category: "users",
    isSystem: true,
  },
  {
    name: PERMISSIONS.USERS_READ,
    description: "View user list and details",
    category: "users",
    isSystem: true,
  },
  {
    name: PERMISSIONS.USERS_UPDATE,
    description: "Update user information",
    category: "users",
    isSystem: true,
  },
  {
    name: PERMISSIONS.USERS_DELETE,
    description: "Delete/deactivate users",
    category: "users",
    isSystem: true,
  },
  {
    name: PERMISSIONS.PROJECTS_CREATE,
    description: "Create new projects",
    category: "projects",
    isSystem: true,
  },
  {
    name: PERMISSIONS.PROJECTS_READ,
    description: "View project list and details",
    category: "projects",
    isSystem: true,
  },
  {
    name: PERMISSIONS.PROJECTS_UPDATE,
    description: "Update project information",
    category: "projects",
    isSystem: true,
  },
  {
    name: PERMISSIONS.PROJECTS_DELETE,
    description: "Delete/deactivate projects",
    category: "projects",
    isSystem: true,
  },
  {
    name: PERMISSIONS.ATTENDANCE_CLOCK_IN,
    description: "Clock in to a project",
    category: "attendance",
    isSystem: true,
  },
  {
    name: PERMISSIONS.ATTENDANCE_CLOCK_OUT,
    description: "Clock out from a project",
    category: "attendance",
    isSystem: true,
  },
  {
    name: PERMISSIONS.ATTENDANCE_READ_OWN,
    description: "View own attendance records",
    category: "attendance",
    isSystem: true,
  },
  {
    name: PERMISSIONS.ATTENDANCE_READ_ALL,
    description: "View all attendance records",
    category: "attendance",
    isSystem: true,
  },
  {
    name: PERMISSIONS.ATTENDANCE_UPDATE,
    description: "Update attendance records (admin)",
    category: "attendance",
    isSystem: true,
  },
  {
    name: PERMISSIONS.PROJECT_MEMBERS_READ,
    description: "View project members and their attendance",
    category: "projectMembers",
    isSystem: true,
  },
  {
    name: PERMISSIONS.PROJECT_MEMBERS_UPDATE,
    description: "Update project member attendance (one-time edit)",
    category: "projectMembers",
    isSystem: true,
  },
  {
    name: PERMISSIONS.REPORTS_READ,
    description: "View reports",
    category: "reports",
    isSystem: true,
  },
  {
    name: PERMISSIONS.REPORTS_EXPORT,
    description: "Export reports",
    category: "reports",
    isSystem: true,
  },
  {
    name: PERMISSIONS.EXPENSES_CREATE,
    description: "Add expense",
    category: "expenses",
    isSystem: true,
  },
  {
    name: PERMISSIONS.EXPENSES_READ_OWN,
    description: "View own expenses",
    category: "expenses",
    isSystem: true,
  },
  {
    name: PERMISSIONS.EXPENSES_READ_ALL,
    description: "View all expenses in scope",
    category: "expenses",
    isSystem: true,
  },
  {
    name: PERMISSIONS.EXPENSES_UPDATE,
    description: "Edit expenses",
    category: "expenses",
    isSystem: true,
  },
  {
    name: PERMISSIONS.EXPENSES_DELETE,
    description: "Delete/void expenses",
    category: "expenses",
    isSystem: true,
  },
  {
    name: PERMISSIONS.EXPENSES_APPROVE,
    description: "Approve/reject expenses",
    category: "expenses",
    isSystem: true,
  },
  {
    name: PERMISSIONS.ROLES_CREATE,
    description: "Create new roles",
    category: "roles",
    isSystem: true,
  },
  {
    name: PERMISSIONS.ROLES_READ,
    description: "View roles and permissions",
    category: "roles",
    isSystem: true,
  },
  {
    name: PERMISSIONS.ROLES_UPDATE,
    description: "Update role permissions",
    category: "roles",
    isSystem: true,
  },
  {
    name: PERMISSIONS.ROLES_DELETE,
    description: "Delete roles",
    category: "roles",
    isSystem: true,
  },
  {
    name: PERMISSIONS.SYSTEM_SETTINGS,
    description: "Manage system settings",
    category: "system",
    isSystem: true,
  },
  {
    name: PERMISSIONS.SYSTEM_LOGS,
    description: "View system logs",
    category: "system",
    isSystem: true,
  },
  {
    name: PERMISSIONS.REVENUE_CREATE,
    description: "Add revenue records",
    category: "revenue",
    isSystem: true,
  },
  {
    name: PERMISSIONS.REVENUE_READ,
    description: "View revenue records",
    category: "revenue",
    isSystem: true,
  },
  {
    name: PERMISSIONS.REVENUE_UPDATE,
    description: "Edit revenue records",
    category: "revenue",
    isSystem: true,
  },
  {
    name: PERMISSIONS.REVENUE_DELETE,
    description: "Delete revenue records",
    category: "revenue",
    isSystem: true,
  },
];

/**
 * Seed only global permissions. Roles are created per-org (via signup or seedDefaultRolesForOrg).
 */
const seedPermissions = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info("Connected to MongoDB");

    logger.info("\n--- Creating Permissions ---");
    const permissionMap = {};

    for (const perm of systemPermissions) {
      const existing = await Permission.findOne({ name: perm.name });
      if (existing) {
        logger.info(`Permission exists: ${perm.name}`);
        permissionMap[perm.name] = existing._id;
      } else {
        const created = await Permission.create(perm);
        logger.info(`Created permission: ${perm.name}`);
        permissionMap[perm.name] = created._id;
      }
    }

    logger.info("\n--- Seed Complete ---");
    logger.info(`Total permissions: ${Object.keys(permissionMap).length}`);
    logger.info(
      "Roles are created per-org (signup or seedDefaultRolesForOrg).",
    );

    process.exit(0);
  } catch (error) {
    logger.error("Error seeding permissions", { error: error.message });
    process.exit(1);
  }
};

seedPermissions();
