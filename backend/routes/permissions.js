// ================================================================
// SHEET PERMISSIONS ROUTES (routes/permissions.js)
// ================================================================
// PURPOSE: Manage role-based permissions on sheets.
//
// Controls what each ROLE can do on a specific sheet:
//   - canView, canEdit, canDelete, canApprove, canComment, canShare
//
// ENDPOINTS:
//   GET  /api/permissions/:sheetId              — Get permissions for a sheet
//   PUT  /api/permissions/:sheetId/:role        — Set permissions for a role
//   PUT  /api/permissions/:sheetId/bulk         — Set permissions for all roles at once
//   DELETE /api/permissions/:sheetId/:role      — Reset role permissions to default
//
// ACCESS: L1_ADMIN only (for setting), all roles (for reading their own)
// ================================================================

const express = require('express');
const { body, validationResult } = require('express-validator');
const { Sheet } = require('../models');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

// Get permissions for a sheet
router.get('/:sheetId/permissions',
  authenticateToken,
  async (req, res) => {
    try {
      const { sheetId } = req.params;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      res.json({
        sheetId,
        permissions: sheet.permissions || {},
      });

    } catch (error) {
      logger.error('Get permissions error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Update permissions for a role on a sheet (Admin only)
router.put('/:sheetId/permissions/:role',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('canView').isBoolean(),
    body('canEdit').isBoolean(),
    body('canDelete').isBoolean(),
    body('canApprove').isBoolean().optional(),
    body('canCreateColumns').isBoolean().optional(),
    body('canModifyStructure').isBoolean().optional(),
  ],
  auditLog('UPDATE_PERMISSIONS', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sheetId, role } = req.params;
      const permissionData = req.body;

      // Validate role
      const validRoles = ['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER', 'CEO'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      // Update or create permissions for the role
      if (!sheet.permissions) {
        sheet.permissions = {};
      }

      sheet.permissions[role] = {
        ...sheet.permissions[role],
        ...permissionData,
        updatedAt: new Date(),
      };

      await sheet.save();

      res.json({
        message: 'Permissions updated successfully',
        sheetId,
        role,
        permissions: sheet.permissions[role],
      });

    } catch (error) {
      logger.error('Update permissions error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Bulk update permissions for multiple roles
router.put('/:sheetId/permissions-bulk',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('rolePermissions').isObject(),
  ],
  auditLog('BULK_UPDATE_PERMISSIONS', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sheetId } = req.params;
      const { rolePermissions } = req.body;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      if (!sheet.permissions) {
        sheet.permissions = {};
      }

      // Update permissions for each role
      Object.entries(rolePermissions).forEach(([role, permissions]) => {
        sheet.permissions[role] = {
          ...sheet.permissions[role],
          ...permissions,
          updatedAt: new Date(),
        };
      });

      await sheet.save();

      res.json({
        message: 'Bulk permissions updated successfully',
        sheetId,
        permissions: sheet.permissions,
      });

    } catch (error) {
      logger.error('Bulk update permissions error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Reset permissions for a role
router.delete('/:sheetId/permissions/:role',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  auditLog('RESET_PERMISSIONS', 'SHEET'),
  async (req, res) => {
    try {
      const { sheetId, role } = req.params;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      if (sheet.permissions && sheet.permissions[role]) {
        delete sheet.permissions[role];
        await sheet.save();
      }

      res.json({
        message: 'Permissions reset successfully',
        sheetId,
        role,
      });

    } catch (error) {
      logger.error('Reset permissions error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

module.exports = router;
