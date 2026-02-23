// ================================================================
// USER MANAGEMENT ROUTES (routes/users.js)
// ================================================================
// PURPOSE: Admin-only user CRUD (separate from auth routes).
//
// While routes/auth.js handles login/register/profile,
// this file handles the admin's user management panel.
//
// ENDPOINTS:
//   GET  /api/users/             — List all users (paginated)
//   GET  /api/users/:id          — Get user details
//   PUT  /api/users/:id          — Update a user
//   DELETE /api/users/:id        — Delete a user (can't self-delete)
//   GET  /api/users/role/:role   — Get active users by role
//
// ACCESS: L1_ADMIN only (except role listing: L1_ADMIN + PM)
// ================================================================

const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { User } = require('../models');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

// Get all users (Admin only)
router.get('/', 
  authenticateToken, 
  authorizeRoles('L1_ADMIN'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isIn(['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER', 'CEO']),
    query('isActive').optional().isBoolean(),
  ],
  auditLog('VIEW_USERS', 'USER'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const where = {};
      if (req.query.role) where.role = req.query.role;
      if (req.query.isActive !== undefined) where.isActive = req.query.isActive === 'true';

      const { count, rows: users } = await User.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['password'] },
        order: [['createdAt', 'DESC']],
      });

      res.json({
        users,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit),
        },
      });

    } catch (error) {
      logger.error('Get users error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get user by ID
router.get('/:id', 
  authenticateToken, 
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER'),
  auditLog('VIEW_USER', 'USER'),
  async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id, {
        attributes: { exclude: ['password'] }
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ user });

    } catch (error) {
      logger.error('Get user error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Update user (Admin only)
router.put('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('firstName').optional().notEmpty().trim(),
    body('lastName').optional().notEmpty().trim(),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER', 'CEO']),
    body('phone').optional().isMobilePhone(),
    body('isActive').optional().isBoolean(),
  ],
  auditLog('UPDATE_USER', 'USER'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Store original data for audit
      req.originalData = { ...user.toJSON() };
      delete req.originalData.password;

      const { firstName, lastName, email, role, phone, isActive } = req.body;

      // Check if email is already taken by another user
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          return res.status(400).json({ message: 'Email already taken by another user' });
        }
      }

      await user.update({
        firstName: firstName !== undefined ? firstName : user.firstName,
        lastName: lastName !== undefined ? lastName : user.lastName,
        email: email !== undefined ? email : user.email,
        role: role !== undefined ? role : user.role,
        phone: phone !== undefined ? phone : user.phone,
        isActive: isActive !== undefined ? isActive : user.isActive,
      });

      const updatedUser = { ...user.toJSON() };
      delete updatedUser.password;

      res.json({
        message: 'User updated successfully',
        user: updatedUser,
      });

    } catch (error) {
      logger.error('Update user error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Delete user (Admin only)
router.delete('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  auditLog('DELETE_USER', 'USER'),
  async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Prevent admin from deleting themselves
      if (user.id === req.user.id) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      // Store user data for audit before deletion
      req.originalData = { ...user.toJSON() };
      delete req.originalData.password;

      await user.destroy();

      res.json({ message: 'User deleted successfully' });

    } catch (error) {
      logger.error('Delete user error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get users by role (for assignment purposes)
router.get('/by-role/:role',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER'),
  async (req, res) => {
    try {
      const { role } = req.params;
      
      if (!['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER', 'CEO'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      const users = await User.findAll({
        where: { 
          role,
          isActive: true 
        },
        attributes: ['id', 'firstName', 'lastName', 'email', 'role'],
        order: [['firstName', 'ASC']],
      });

      res.json({ users });

    } catch (error) {
      logger.error('Get users by role error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

module.exports = router;