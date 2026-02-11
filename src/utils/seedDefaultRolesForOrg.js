import { PERMISSIONS, ROLES } from "../constants.js";
import Permission from "../models/Permission.js";
import Role from "../models/Role.js";
import logger from "./logger.js";

/**
 * Default role definitions: name, description, isSystem, permissions (array of permission names or 'all').
 */
const defaultRoleDefinitions = [
  {
    name: ROLES.ADMIN,
    description: "Full system access - can view, edit, and delete everything",
    isSystem: true,
    permissions: "all",
  },
  {
    name: ROLES.SUPERVISOR,
    description:
      "Manages workers in their projects - view project members, update attendance when needed",
    isSystem: true,
    permissions: [
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.ATTENDANCE_CLOCK_IN,
      PERMISSIONS.ATTENDANCE_CLOCK_OUT,
      PERMISSIONS.ATTENDANCE_READ_OWN,
      PERMISSIONS.ATTENDANCE_READ_ALL,
      PERMISSIONS.ATTENDANCE_UPDATE,
      PERMISSIONS.PROJECT_MEMBERS_READ,
      PERMISSIONS.PROJECT_MEMBERS_UPDATE,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.EXPENSES_CREATE,
      PERMISSIONS.EXPENSES_READ_ALL,
      PERMISSIONS.EXPENSES_UPDATE,
    ],
  },
  {
    name: ROLES.WORKER,
    description:
      "Field worker - clock in/out and see own attendance and basic info",
    isSystem: true,
    permissions: [
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.ATTENDANCE_CLOCK_IN,
      PERMISSIONS.ATTENDANCE_CLOCK_OUT,
      PERMISSIONS.ATTENDANCE_READ_OWN,
      PERMISSIONS.EXPENSES_CREATE,
      PERMISSIONS.EXPENSES_READ_OWN,
      PERMISSIONS.EXPENSES_UPDATE,
    ],
  },
];

/**
 * Create default roles for an organization. Assumes global permissions already exist.
 * @param {mongoose.Types.ObjectId} organizationId
 * @returns {Promise<Record<string, mongoose.Types.ObjectId>>} Map of role name -> role _id (e.g. { Admin: id, Supervisor: id, Worker: id })
 */
export async function seedDefaultRolesForOrg(organizationId) {
  const permissionDocs = await Permission.find({});
  const permissionMap = {};
  for (const p of permissionDocs) {
    permissionMap[p.name] = p._id;
  }

  const roleMap = {};
  for (const roleData of defaultRoleDefinitions) {
    const permissionIds =
      roleData.permissions === "all"
        ? Object.values(permissionMap)
        : (roleData.permissions || [])
            .map((name) => permissionMap[name])
            .filter(Boolean);

    const role = await Role.create({
      organizationId,
      name: roleData.name,
      description: roleData.description,
      isSystem: roleData.isSystem,
      permissions: permissionIds,
    });
    roleMap[roleData.name] = role._id;
    logger.info(`Created role ${roleData.name} for org ${organizationId}`);
  }
  return roleMap;
}
