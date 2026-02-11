import express from 'express';
import { body } from 'express-validator';
import {
  clockIn,
  clockOut,
  getAllAttendance,
  getAttendanceReport,
  getAttendanceSheet,
  getMyAttendance,
  setAttendanceMark,
  setAttendanceMarksBulk,
  updateAttendanceMetadata,
} from '../controllers/attendanceController.js';
import { PERMISSIONS } from '../constants.js';
import { hasPermission, protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';

const router = express.Router();

// Validation rules
const clockInValidation = [
  body('projectId').optional(),
  body('coordinates.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('coordinates.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
];

const clockOutValidation = [
  body('coordinates.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('coordinates.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  body('metadata.workUnits')
    .optional()
    .isNumeric()
    .withMessage('Work units must be a number'),
  body('metadata.workType')
    .optional()
    .isString()
    .withMessage('Work type must be a string'),
  body('metadata.extraSiteExpenses')
    .optional()
    .isNumeric()
    .withMessage('Extra site expenses must be a number'),
];

const sheetMarkValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('date').notEmpty().withMessage('Date is required'),
  body('projectId').notEmpty().withMessage('Project ID is required'),
  body('status')
    .isIn(['PRESENT', 'ABSENT', 'PARTIAL'])
    .withMessage('Status must be PRESENT, ABSENT, or PARTIAL'),
  body('hoursWorked').optional().isNumeric().withMessage('Hours worked must be a number'),
];

const sheetMarksBulkValidation = [
  body('projectId').notEmpty().withMessage('Project ID is required'),
  body('date').notEmpty().withMessage('Date is required'),
  body('entries')
    .isArray()
    .withMessage('entries must be an array')
    .isLength({ max: 200 })
    .withMessage('entries cannot exceed 200'),
  body('entries.*.userId').notEmpty().withMessage('Each entry must have userId'),
  body('entries.*.status')
    .isIn(['PRESENT', 'ABSENT', 'PARTIAL'])
    .withMessage('Each entry status must be PRESENT, ABSENT, or PARTIAL'),
  body('entries.*.hoursWorked').optional().isNumeric().withMessage('hoursWorked must be a number'),
];

const metadataValidation = [
  body('metadata.workUnits')
    .optional()
    .isNumeric()
    .withMessage('Work units must be a number'),
  body('metadata.workType')
    .optional()
    .isString()
    .withMessage('Work type must be a string'),
  body('metadata.extraSiteExpenses')
    .optional()
    .isNumeric()
    .withMessage('Extra site expenses must be a number'),
];

// Routes
router.post('/clock-in', protect, hasPermission(PERMISSIONS.ATTENDANCE_CLOCK_IN), clockInValidation, validate, clockIn);
router.post('/clock-out', protect, hasPermission(PERMISSIONS.ATTENDANCE_CLOCK_OUT), clockOutValidation, validate, clockOut);
router.get('/my-attendance', protect, getMyAttendance);
router.get('/report', protect, hasPermission(PERMISSIONS.ATTENDANCE_READ_ALL), getAttendanceReport);
router.get('/sheet', protect, hasPermission(PERMISSIONS.ATTENDANCE_READ_ALL), getAttendanceSheet);
router.post('/sheet/mark', protect, hasPermission(PERMISSIONS.ATTENDANCE_UPDATE), sheetMarkValidation, validate, setAttendanceMark);
router.post('/sheet/marks', protect, hasPermission(PERMISSIONS.ATTENDANCE_UPDATE), sheetMarksBulkValidation, validate, setAttendanceMarksBulk);
router.get('/', protect, hasPermission(PERMISSIONS.ATTENDANCE_READ_ALL), getAllAttendance);
router.put('/:id/metadata', protect, metadataValidation, validate, updateAttendanceMetadata);

export default router;
