import express from 'express';
import {
  getUserCost,
  getProjectReport,
  getProjectProfitLoss,
} from '../controllers/reportController.js';
import { PERMISSIONS } from '../constants.js';
import { protect, hasPermission } from '../middleware/auth.js';

const router = express.Router();

// Routes - requires reports:read permission
router.get('/user-cost/:id', protect, hasPermission(PERMISSIONS.REPORTS_READ), getUserCost);
router.get('/project/:id', protect, hasPermission(PERMISSIONS.REPORTS_READ), getProjectReport);
router.get('/profit-loss', protect, hasPermission(PERMISSIONS.REPORTS_READ), getProjectProfitLoss);

export default router;
