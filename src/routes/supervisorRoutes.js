import express from 'express';
import {
  getMyProjectMembers,
  getProjectMembersAttendance,
  updateProjectMemberAttendance,
  submitChangeRequest,
  getChangeRequests,
  reviewChangeRequest,
} from '../controllers/supervisorController.js';
import { PERMISSIONS } from '../constants.js';
import { hasPermission, hasAnyPermission, protect } from '../middleware/auth.js';

const router = express.Router();

// All supervisor routes require auth
router.use(protect);

// My project members and their attendance (projectMembers:read, projectMembers:update)
router.get('/my-project-members', hasPermission(PERMISSIONS.PROJECT_MEMBERS_READ), getMyProjectMembers);
router.get('/attendance', hasPermission(PERMISSIONS.PROJECT_MEMBERS_READ), getProjectMembersAttendance);
router.put(
  '/attendance/:id',
  hasPermission(PERMISSIONS.PROJECT_MEMBERS_UPDATE),
  updateProjectMemberAttendance
);

// Change requests: submit, list (my-project-members or all by permission), review
router.post('/change-request', submitChangeRequest);
router.get(
  '/change-requests',
  hasAnyPermission(PERMISSIONS.PROJECT_MEMBERS_READ, PERMISSIONS.ATTENDANCE_UPDATE),
  getChangeRequests
);
router.put(
  '/change-request/:id/review',
  hasPermission(PERMISSIONS.ATTENDANCE_UPDATE),
  reviewChangeRequest
);

export default router;
