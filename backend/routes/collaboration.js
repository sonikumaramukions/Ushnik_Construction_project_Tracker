// ================================================================
// COLLABORATION ROUTES (routes/collaboration.js)
// ================================================================
// PURPOSE: Share sheets with roles/users and manage collaboration.
//
// This is the "push" system — admin shares sheets with specific roles
// and users, and can later revoke access.
//
// ENDPOINTS:
//   POST /api/collaboration/:sheetId/publish   — Share sheet with roles
//   POST /api/collaboration/:sheetId/share     — Share with specific users
//   GET  /api/collaboration/shared/me          — Get my shared sheets
//   DELETE /api/collaboration/:sheetId/:role   — Revoke role access
//   GET  /api/collaboration/:sheetId/info      — Get collaboration details
//
// ACCESS: L1_ADMIN for sharing/revoking, all authenticated for viewing own
// ================================================================

const express = require('express');
const { body, validationResult } = require('express-validator');
const { Sheet, User } = require('../models');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

// Publish/Share sheet with roles
router.post('/:sheetId/publish',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('roles').isArray().notEmpty(),
    body('roles.*').isIn(['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER', 'CEO']),
  ],
  auditLog('PUBLISH_SHEET', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sheetId } = req.params;
      const { roles } = req.body;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      // Initialize assigned roles if not exists
      if (!sheet.assignedRoles) {
        sheet.assignedRoles = [];
      }

      // Add new roles
      sheet.assignedRoles = [...new Set([...sheet.assignedRoles, ...roles])];

      // Update status to ACTIVE if in DRAFT
      if (sheet.status === 'DRAFT') {
        sheet.status = 'ACTIVE';
      }

      await sheet.save();

      // Notify through Socket.io
      if (req.io) {
        req.io.emit('sheet:published', {
          sheetId: sheet.id,
          roles,
          publishedAt: new Date(),
          sheetName: sheet.name,
        });
      }

      res.json({
        message: 'Sheet published successfully',
        sheetId,
        assignedRoles: sheet.assignedRoles,
        status: sheet.status,
      });

    } catch (error) {
      logger.error('Publish sheet error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Share sheet with specific users
router.post('/:sheetId/share-users',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('userIds').isArray().notEmpty(),
    body('userIds.*').isUUID(),
  ],
  auditLog('SHARE_SHEET_USERS', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sheetId } = req.params;
      const { userIds } = req.body;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      // Verify users exist
      const users = await User.findAll({
        where: { id: userIds },
        attributes: ['id', 'firstName', 'lastName', 'role'],
      });

      if (users.length !== userIds.length) {
        return res.status(400).json({ message: 'Some users not found' });
      }

      // Initialize assigned users if not exists
      if (!sheet.assignedUsers) {
        sheet.assignedUsers = [];
      }

      // Add new users
      sheet.assignedUsers = [...new Set([...sheet.assignedUsers, ...userIds])];

      if (sheet.status === 'DRAFT') {
        sheet.status = 'ACTIVE';
      }

      await sheet.save();

      // Notify through Socket.io
      if (req.io) {
        req.io.emit('sheet:shared-users', {
          sheetId: sheet.id,
          users: users.map(u => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName}`,
            role: u.role,
          })),
          sharedAt: new Date(),
        });
      }

      res.json({
        message: 'Sheet shared with users successfully',
        sheetId,
        sharedWith: users.map(u => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role,
        })),
      });

    } catch (error) {
      logger.error('Share sheet with users error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get shared sheets for logged-in user
router.get('/shared/me',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Get sheets shared with this user's role or this specific user
      const sheets = await Sheet.findAll({
        where: {
          status: 'ACTIVE',
        },
        include: [
          {
            association: 'project',
            attributes: ['id', 'name'],
          },
          {
            association: 'creator',
            attributes: ['id', 'firstName', 'lastName'],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Filter sheets based on user's access
      const accessibleSheets = sheets.filter(sheet => {
        // Check if shared with user's role
        if (sheet.assignedRoles && sheet.assignedRoles.includes(userRole)) {
          return true;
        }
        // Check if shared with specific user
        if (sheet.assignedUsers && sheet.assignedUsers.includes(userId)) {
          return true;
        }
        // Check role-based permissions
        if (sheet.permissions && sheet.permissions[userRole]?.canView) {
          return true;
        }
        return false;
      });

      res.json({
        sheets: accessibleSheets,
        count: accessibleSheets.length,
      });

    } catch (error) {
      logger.error('Get shared sheets error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Revoke sheet access from role
router.delete('/:sheetId/revoke-role/:role',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  auditLog('REVOKE_SHEET_ROLE', 'SHEET'),
  async (req, res) => {
    try {
      const { sheetId, role } = req.params;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      if (sheet.assignedRoles && sheet.assignedRoles.includes(role)) {
        sheet.assignedRoles = sheet.assignedRoles.filter(r => r !== role);
        await sheet.save();
      }

      res.json({
        message: 'Sheet access revoked successfully',
        sheetId,
        role,
        remainingRoles: sheet.assignedRoles,
      });

    } catch (error) {
      logger.error('Revoke sheet role error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get collaboration info for a sheet
router.get('/:sheetId/collaboration',
  authenticateToken,
  async (req, res) => {
    try {
      const { sheetId } = req.params;

      const sheet = await Sheet.findByPk(sheetId, {
        include: [
          {
            association: 'creator',
            attributes: ['id', 'firstName', 'lastName'],
          },
        ],
      });

      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      // Get user details for assignedUsers
      let assignedUserDetails = [];
      if (sheet.assignedUsers && sheet.assignedUsers.length > 0) {
        const users = await User.findAll({
          where: { id: sheet.assignedUsers },
          attributes: ['id', 'firstName', 'lastName', 'role'],
        });
        assignedUserDetails = users;
      }

      res.json({
        sheetId: sheet.id,
        sheetName: sheet.name,
        createdBy: sheet.creator,
        createdAt: sheet.createdAt,
        status: sheet.status,
        assignedRoles: sheet.assignedRoles || [],
        assignedUsers: assignedUserDetails,
        permissions: sheet.permissions || {},
      });

    } catch (error) {
      logger.error('Get collaboration info error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

module.exports = router;
