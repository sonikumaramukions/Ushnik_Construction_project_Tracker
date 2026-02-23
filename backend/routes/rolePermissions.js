// ================================================================
// ROLE PERMISSIONS ROUTES (routes/rolePermissions.js)
// ================================================================
// PURPOSE: Manage permission TEMPLATES and per-sheet role permissions.
//
// Permission templates are pre-built sets of permissions:
//   VIEW_ONLY — Can only view
//   EDITOR    — Can view and edit
//   APPROVER  — Can view, edit, and approve
//   FULL_ACCESS — Can do everything
//
// ENDPOINTS:
//   GET  /api/role-permissions/templates       — Get all permission templates
//   GET  /api/role-permissions/defaults        — Get default permissions per role
//   GET  /api/role-permissions/sheet/:sheetId  — Get all role permissions for a sheet
//   GET  /api/role-permissions/sheet/:sheetId/:role — Get permissions for one role
//   POST /api/role-permissions/sheet/:sheetId/:role — Set permissions for a role
//   POST /api/role-permissions/sheet/:sheetId/batch — Set for multiple roles
//   POST /api/role-permissions/sheet/:sheetId/:role/template — Apply a template
//   GET  /api/role-permissions/check/:sheetId/:role/:action  — Check authorization
//
// ACCESS: L1_ADMIN for setting, all for checking
// USES: services/RolePermissionService.js
// ================================================================

const express = require('express');
const router = express.Router();
const RolePermissionService = require('../services/RolePermissionService');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

/**
 * Role Permission Routes
 * Admin only for managing permissions
 */

/**
 * Get all available permission templates
 * GET /api/role-permissions/templates
 */
router.get('/templates',
    authenticateToken,
    (req, res) => {
        try {
            const templates = RolePermissionService.constructor.getPermissionTemplates();
            res.status(200).json({
                success: true,
                data: templates
            });
        } catch (error) {
            logger.error('Error fetching permission templates:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch permission templates',
                error: error.message
            });
        }
    }
);

/**
 * Get default permissions for all roles
 * GET /api/role-permissions/defaults
 */
router.get('/defaults',
    authenticateToken,
    (req, res) => {
        try {
            const defaults = RolePermissionService.constructor.getDefaultPermissions();
            res.status(200).json({
                success: true,
                data: defaults
            });
        } catch (error) {
            logger.error('Error fetching default permissions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch default permissions',
                error: error.message
            });
        }
    }
);

/**
 * Get all role permissions for a sheet
 * GET /api/role-permissions/:sheetId
 */
router.get('/:sheetId',
    authenticateToken,
    async (req, res) => {
        try {
            const { sheetId } = req.params;
            const permissions = await RolePermissionService.getAllRolePermissions(sheetId);

            res.status(200).json({
                success: true,
                data: permissions
            });
        } catch (error) {
            logger.error('Error fetching role permissions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch role permissions',
                error: error.message
            });
        }
    }
);

/**
 * Get permissions for a specific role on a sheet
 * GET /api/role-permissions/:sheetId/:role
 */
router.get('/:sheetId/:role',
    authenticateToken,
    async (req, res) => {
        try {
            const { sheetId, role } = req.params;
            const permissions = await RolePermissionService.getSheetPermissions(sheetId, role);

            res.status(200).json({
                success: true,
                data: { role, permissions }
            });
        } catch (error) {
            logger.error('Error fetching role permissions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch role permissions',
                error: error.message
            });
        }
    }
);

/**
 * Set permissions for a role on a sheet
 * POST /api/role-permissions/:sheetId/:role
 */
router.post('/:sheetId/:role',
    authenticateToken,
    authorizeRole(['L1_ADMIN']),
    auditLog('SET_ROLE_PERMISSIONS', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId, role } = req.params;
            const { canView, canEdit, canApprove, canDelete, canShare } = req.body;

            const result = await RolePermissionService.setSheetPermissions(sheetId, role, {
                canView,
                canEdit,
                canApprove,
                canDelete,
                canShare
            });

            res.status(200).json({
                success: true,
                message: `Permissions set for role: ${role}`,
                data: result
            });
        } catch (error) {
            logger.error('Error setting role permissions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to set role permissions',
                error: error.message
            });
        }
    }
);

/**
 * Set permissions for multiple roles at once
 * POST /api/role-permissions/:sheetId/batch
 */
router.post('/:sheetId/batch',
    authenticateToken,
    authorizeRole(['L1_ADMIN']),
    auditLog('SET_MULTIPLE_ROLE_PERMISSIONS', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId } = req.params;
            const { rolePermissions } = req.body;

            if (!rolePermissions || typeof rolePermissions !== 'object') {
                return res.status(400).json({
                    success: false,
                    message: 'rolePermissions object is required'
                });
            }

            const result = await RolePermissionService.setMultipleRolePermissions(sheetId, rolePermissions);

            res.status(200).json({
                success: true,
                message: 'Permissions updated for multiple roles',
                data: result
            });
        } catch (error) {
            logger.error('Error setting multiple role permissions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to set multiple role permissions',
                error: error.message
            });
        }
    }
);

/**
 * Apply permission template to a role
 * POST /api/role-permissions/:sheetId/:role/template/:template
 */
router.post('/:sheetId/:role/template/:template',
    authenticateToken,
    authorizeRole(['L1_ADMIN']),
    auditLog('APPLY_PERMISSION_TEMPLATE', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId, role, template } = req.params;

            const templates = RolePermissionService.constructor.getPermissionTemplates();
            const templateData = templates[template];

            if (!templateData) {
                return res.status(400).json({
                    success: false,
                    message: `Template not found: ${template}`
                });
            }

            const result = await RolePermissionService.setSheetPermissions(sheetId, role, templateData);

            res.status(200).json({
                success: true,
                message: `Applied template "${template}" to role "${role}"`,
                data: result
            });
        } catch (error) {
            logger.error('Error applying permission template:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to apply permission template',
                error: error.message
            });
        }
    }
);

/**
 * Check if a role can perform an action
 * GET /api/role-permissions/:sheetId/:role/can/:action
 */
router.get('/:sheetId/:role/can/:action',
    authenticateToken,
    async (req, res) => {
        try {
            const { sheetId, role, action } = req.params;

            const canPerform = await RolePermissionService.canPerformAction(sheetId, role, action);

            res.status(200).json({
                success: true,
                data: {
                    role,
                    action,
                    allowed: canPerform
                }
            });
        } catch (error) {
            logger.error('Error checking action permission:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check action permission',
                error: error.message
            });
        }
    }
);

module.exports = router;
