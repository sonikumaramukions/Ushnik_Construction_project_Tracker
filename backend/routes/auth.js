// ================================================================
// AUTHENTICATION ROUTES (routes/auth.js)
// ================================================================
// PURPOSE: User login, registration, profile management, and admin user CRUD.
//
// PUBLIC ENDPOINTS (no token needed):
//   POST /api/auth/register  — Register a new user (dev only)
//   POST /api/auth/login     — Login with email + password → returns JWT token
//
// AUTHENTICATED ENDPOINTS (need JWT token):
//   GET  /api/auth/me            — Get current user's profile
//   PUT  /api/auth/profile       — Update your own profile
//   PUT  /api/auth/change-password — Change your own password
//   POST /api/auth/logout        — Logout (client removes token)
//   POST /api/auth/refresh       — Get a fresh JWT token
//
// ADMIN-ONLY ENDPOINTS (L1_ADMIN role):
//   POST /api/auth/create-user        — Create a new user
//   GET  /api/auth/all-users          — List all users
//   GET  /api/auth/users-by-role/:role — Filter users by role
//   PUT  /api/auth/update-user/:id    — Update any user
//   POST /api/auth/reset-password/:id — Reset a user's password
//
// USES: JWT tokens (7-day expiry), bcrypt for password hashing
// ================================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { authenticateToken, authorizeRoles, invalidateUserCache } = require('../middleware/auth');
const { logUserAction } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

// Validation middleware
const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 }).withMessage('Password is required'),
];

const validateRegister = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('role').isIn(['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER', 'CEO']),
];

// Generate JWT token
const JWT_SECRET = process.env.JWT_SECRET || 'construction-tracker-default-dev-secret-key-2024';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
};

// User registration (only for development - in production, this should be admin-only)
router.post('/register', validateRegister, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, role, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
      phone,
    });

    // Generate token
    const token = generateToken(user);

    // Log registration
    await logUserAction(user.id, 'REGISTER', 'USER', user.id, null, { email, role });

    // Remove password from response
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;

    res.status(201).json({
      message: 'User registered successfully',
      user: userResponse,
      token,
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error during registration' });
  }
});

// User login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated. Please contact administrator.' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Update last login time (non-blocking)
    user.update({ lastLoginAt: new Date() }).catch(err => logger.warn('Update lastLogin failed:', err.message));

    // Clear cached user data so auth middleware gets fresh data after login
    invalidateUserCache(user.id);

    // Generate token
    const token = generateToken(user);

    // Log login (non-blocking — don't fail login if audit fails)
    logUserAction(user.id, 'LOGIN', 'USER', user.id).catch(err => logger.warn('Audit log failed:', err.message));

    // Remove password from response
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;

    res.json({
      message: 'Login successful',
      user: userResponse,
      token,
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error during login' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = { ...req.user.toJSON() };
    delete user.password;
    
    res.json({ user });
  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, [
  body('firstName').optional().notEmpty().trim(),
  body('lastName').optional().notEmpty().trim(),
  body('phone').optional().isMobilePhone(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, phone, preferences } = req.body;
    const oldValues = { ...req.user.toJSON() };
    delete oldValues.password;

    await req.user.update({
      firstName: firstName || req.user.firstName,
      lastName: lastName || req.user.lastName,
      phone: phone || req.user.phone,
      preferences: preferences || req.user.preferences,
    });

    await logUserAction(req.user.id, 'UPDATE_PROFILE', 'USER', req.user.id, oldValues, req.body);

    const updatedUser = { ...req.user.toJSON() };
    delete updatedUser.password;

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });

  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Change password
router.put('/change-password', authenticateToken, [
  body('currentPassword').isLength({ min: 6 }),
  body('newPassword').isLength({ min: 6 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, req.user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await req.user.update({ password: hashedNewPassword });

    await logUserAction(req.user.id, 'CHANGE_PASSWORD', 'USER', req.user.id);

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    logger.error('Password change error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Logout (client-side token removal, but we log it)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await logUserAction(req.user.id, 'LOGOUT', 'USER', req.user.id);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const newToken = generateToken(req.user);
    res.json({ token: newToken });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new user (L1_ADMIN only)
router.post('/create-user', authenticateToken, authorizeRoles('L1_ADMIN'), [
  body('email').isEmail().normalizeEmail(),
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('role').isIn(['L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, firstName, lastName, role, phone } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    
    const user = await User.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
      phone: phone || null,
      isActive: true,
      mustChangePassword: true,
      preferences: {}
    });
    
    // Log user creation
    await logUserAction(req.user.id, 'CREATE_USER', 'USER', user.id, null, { email, role });
    
    // Return user data without password
    const userData = { ...user.toJSON() };
    delete userData.password;
    
    res.status(201).json({
      message: 'User created successfully',
      user: userData,
      temporaryPassword: tempPassword
    });
  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all users (L1_ADMIN only)
router.get('/users', authenticateToken, authorizeRoles('L1_ADMIN'), async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });
    
    res.json({ users });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get users by role
router.get('/users/:role', authenticateToken, async (req, res) => {
  try {
    const { role } = req.params;
    const users = await User.findAll({
      where: { role, isActive: true },
      attributes: { exclude: ['password'] },
      order: [['firstName', 'ASC']]
    });
    
    res.json({ users });
  } catch (error) {
    logger.error('Get users by role error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update user (L1_ADMIN only)
router.put('/users/:id', authenticateToken, authorizeRoles('L1_ADMIN'), [
  body('firstName').optional().notEmpty().trim(),
  body('lastName').optional().notEmpty().trim(),
  body('role').optional().isIn(['L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { firstName, lastName, phone, role, isActive } = req.body;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const oldValues = { ...user.toJSON() };
    delete oldValues.password;
    
    await user.update({
      firstName: firstName || user.firstName,
      lastName: lastName || user.lastName,
      phone: phone || user.phone,
      role: role || user.role,
      isActive: isActive !== undefined ? isActive : user.isActive
    });
    
    await logUserAction(req.user.id, 'UPDATE_USER', 'USER', user.id, oldValues, req.body);
    
    const updatedUser = { ...user.toJSON() };
    delete updatedUser.password;
    
    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Reset user password (L1_ADMIN only)
router.post('/users/:id/reset-password', authenticateToken, authorizeRoles('L1_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Generate new temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    
    await user.update({
      password: hashedPassword,
      mustChangePassword: true
    });
    
    await logUserAction(req.user.id, 'RESET_PASSWORD', 'USER', user.id);
    
    res.json({
      message: 'Password reset successfully',
      temporaryPassword: tempPassword
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;