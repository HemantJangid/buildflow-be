import express from 'express';
import { body } from 'express-validator';
import {
  signup,
  register,
  login,
  getMe,
  updateUserMetadata,
  getUserOptions,
  getAllUsers,
  updateUser,
} from '../controllers/authController.js';
import { PERMISSIONS, USER_CATEGORIES } from '../constants.js';
import { protect, hasPermission } from '../middleware/auth.js';
import validate from '../middleware/validate.js';

const router = express.Router();

// Validation rules
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('roleId').notEmpty().withMessage('Role is required'),
  body('category')
    .optional()
    .isIn(USER_CATEGORIES)
    .withMessage(`category must be one of: ${USER_CATEGORIES.join(', ')}`),
];

const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

const signupValidation = [
  body('organizationName').trim().notEmpty().withMessage('Organization name is required'),
  body('organizationSlug')
    .optional()
    .trim()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug must be lowercase letters, numbers, and hyphens only'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

// Routes
router.post('/signup', signupValidation, validate, signup);
router.post('/register', protect, hasPermission(PERMISSIONS.USERS_CREATE), registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.get('/me', protect, getMe);
router.get('/users/options', protect, hasPermission(PERMISSIONS.USERS_READ), getUserOptions);
router.get('/users', protect, hasPermission(PERMISSIONS.USERS_READ), getAllUsers);
router.put('/users/:id/metadata', protect, hasPermission(PERMISSIONS.USERS_UPDATE), updateUserMetadata);
router.put('/users/:id', protect, hasPermission(PERMISSIONS.USERS_UPDATE), updateUser);

export default router;
