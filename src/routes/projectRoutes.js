import express from 'express';
import { body } from 'express-validator';
import {
  createProject,
  getAllProjects,
  getProjectOptions,
  getProject,
  updateProject,
  deleteProject,
  getProjectAvailableUsers,
  getProjectMembers,
  addProjectMember,
  addProjectMembersBulk,
  removeProjectMember,
} from '../controllers/projectController.js';
import { PERMISSIONS } from '../constants.js';
import { protect, hasPermission, hasAnyPermission } from '../middleware/auth.js';
import validate from '../middleware/validate.js';

const router = express.Router();

// Validation rules
const projectValidation = [
  body('name').trim().notEmpty().withMessage('Project name is required'),
  body('location.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('location.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  body('radius')
    .optional()
    .isFloat({ min: 1 })
    .withMessage('Radius must be a positive number'),
];

const addMemberValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('minWorkHours').optional().isFloat({ min: 0, max: 24 }),
];

const addMembersBulkValidation = [
  body('userIds').isArray().withMessage('userIds must be an array'),
  body('userIds.*').isMongoId().withMessage('Each userId must be a valid ID'),
];

// Routes
router.post('/', protect, hasPermission(PERMISSIONS.PROJECTS_CREATE), projectValidation, validate, createProject);
router.get('/', protect, hasPermission(PERMISSIONS.PROJECTS_READ), getAllProjects);
router.get('/options', protect, hasPermission(PERMISSIONS.PROJECTS_READ), getProjectOptions);
router.get('/:id/available-users', protect, hasPermission(PERMISSIONS.PROJECTS_READ), getProjectAvailableUsers);
router.get('/:id', protect, hasPermission(PERMISSIONS.PROJECTS_READ), getProject);
router.put('/:id', protect, hasPermission(PERMISSIONS.PROJECTS_UPDATE), updateProject);
router.delete('/:id', protect, hasPermission(PERMISSIONS.PROJECTS_DELETE), deleteProject);

// Project members (workers assigned to project)
router.get('/:id/members', protect, hasPermission(PERMISSIONS.PROJECTS_READ), getProjectMembers);
router.post('/:id/members/bulk', protect, hasAnyPermission(PERMISSIONS.PROJECTS_UPDATE, PERMISSIONS.PROJECT_MEMBERS_UPDATE), addMembersBulkValidation, validate, addProjectMembersBulk);
router.post('/:id/members', protect, hasAnyPermission(PERMISSIONS.PROJECTS_UPDATE, PERMISSIONS.PROJECT_MEMBERS_UPDATE), addMemberValidation, validate, addProjectMember);
router.delete('/:id/members/:userId', protect, hasAnyPermission(PERMISSIONS.PROJECTS_UPDATE, PERMISSIONS.PROJECT_MEMBERS_UPDATE), removeProjectMember);

export default router;
