import express from 'express';
import { body } from 'express-validator';
import {
  getAllPermissions,
  createRole,
  getRoleOptions,
  getAllRoles,
  getRole,
  updateRole,
  deleteRole,
  assignRoleToUser,
} from '../controllers/roleController.js';
import { PERMISSIONS } from '../constants.js';
import { protect, hasPermission } from '../middleware/auth.js';
import validate from '../middleware/validate.js';

const router = express.Router();

// Validation rules
const roleValidation = [
  body('name').trim().notEmpty().withMessage('Role name is required'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array'),
];

const assignRoleValidation = [
  body('roleId').notEmpty().withMessage('Role ID is required'),
];

// Routes
router.get('/permissions', protect, hasPermission(PERMISSIONS.ROLES_READ), getAllPermissions);
router.get('/options', protect, hasPermission(PERMISSIONS.ROLES_READ), getRoleOptions);
router.get('/', protect, hasPermission(PERMISSIONS.ROLES_READ), getAllRoles);
router.get('/:id', protect, hasPermission(PERMISSIONS.ROLES_READ), getRole);
router.post('/', protect, hasPermission(PERMISSIONS.ROLES_CREATE), roleValidation, validate, createRole);
router.put('/:id', protect, hasPermission(PERMISSIONS.ROLES_UPDATE), updateRole);
router.delete('/:id', protect, hasPermission(PERMISSIONS.ROLES_DELETE), deleteRole);
router.put('/assign/:userId', protect, hasPermission(PERMISSIONS.USERS_UPDATE), assignRoleValidation, validate, assignRoleToUser);

export default router;
