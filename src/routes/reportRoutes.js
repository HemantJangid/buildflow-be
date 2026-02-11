import express from 'express';
import {
  getUserCost,
  getProjectReport,
} from '../controllers/reportController.js';
import { PERMISSIONS } from '../constants.js';
import { protect, hasPermission } from '../middleware/auth.js';

const router = express.Router();

// Routes - requires reports:read permission
router.get('/user-cost/:id', protect, hasPermission(PERMISSIONS.REPORTS_READ), getUserCost);
router.get('/project/:id', protect, hasPermission(PERMISSIONS.REPORTS_READ), getProjectReport);

export default router;
