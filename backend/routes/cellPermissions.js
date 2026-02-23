// ================================================================
// CELL PERMISSIONS ROUTES (routes/cellPermissions.js)
// ================================================================
// PURPOSE: Manage per-cell view/edit access control.
//
// This is the FINEST level of access control in the system:
//   Project → Sheet → Role Permission → Cell Permission
//
// ENDPOINTS:
//   GET  /api/cell-permissions/:sheetId          — Get all cell permissions for a sheet
//   GET  /api/cell-permissions/:sheetId/:cellId   — Get permission for one cell
//   POST /api/cell-permissions/                   — Set permission for a cell
//   PUT  /api/cell-permissions/:sheetId/:cellId   — Update cell permission
//   DELETE /api/cell-permissions/:sheetId/:cellId — Remove cell permission
//   POST /api/cell-permissions/bulk               — Set permissions for many cells at once
//   POST /api/cell-permissions/check              — Check if user can view/edit a cell
//
// ACCESS: L1_ADMIN for setting permissions, all roles for checking
// USES: services/CellPermissionService.js
// ================================================================

const express = require('express');
const router = express.Router();
const { CellPermission, Sheet, User } = require('../models');
const { authenticateToken } = require('../middleware/auth');


// Get all permissions for a sheet
router.get('/sheets/:sheetId/permissions', authenticateToken, async (req, res) => {
    try {
        const { sheetId } = req.params;

        const permissions = await CellPermission.findAll({
            where: { sheetId },
            order: [['cellId', 'ASC']],
        });

        res.json({
            success: true,
            permissions,
        });
    } catch (error) {
        console.error('Error fetching permissions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch permissions',
            error: error.message,
        });
    }
});

// Get permission for a specific cell
router.get('/sheets/:sheetId/permissions/:cellId', authenticateToken, async (req, res) => {
    try {
        const { sheetId, cellId } = req.params;

        const permission = await CellPermission.findOne({
            where: { sheetId, cellId },
        });

        res.json({
            success: true,
            permission: permission || null,
        });
    } catch (error) {
        console.error('Error fetching cell permission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch cell permission',
            error: error.message,
        });
    }
});

// Set permission for a cell
router.post('/sheets/:sheetId/permissions/cell', authenticateToken, async (req, res) => {
    try {
        const { sheetId } = req.params;
        const { cellId, canViewRoles, canViewUsers, canEditRoles, canEditUsers, isLocked, notes } = req.body;

        // Check if permission already exists
        let permission = await CellPermission.findOne({
            where: { sheetId, cellId },
        });

        if (permission) {
            // Update existing permission
            await permission.update({
                canViewRoles: canViewRoles || [],
                canViewUsers: canViewUsers || [],
                canEditRoles: canEditRoles || [],
                canEditUsers: canEditUsers || [],
                isLocked: isLocked || false,
                notes: notes || null,
            });
        } else {
            // Create new permission
            permission = await CellPermission.create({
                sheetId,
                cellId,
                canViewRoles: canViewRoles || [],
                canViewUsers: canViewUsers || [],
                canEditRoles: canEditRoles || [],
                canEditUsers: canEditUsers || [],
                isLocked: isLocked || false,
                notes: notes || null,
            });
        }

        res.json({
            success: true,
            permission,
            message: 'Cell permission saved successfully',
        });
    } catch (error) {
        console.error('Error saving cell permission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save cell permission',
            error: error.message,
        });
    }
});

// Update permission for a cell
router.put('/sheets/:sheetId/permissions/cell/:cellId', authenticateToken, async (req, res) => {
    try {
        const { sheetId, cellId } = req.params;
        const { canViewRoles, canViewUsers, canEditRoles, canEditUsers, isLocked, notes } = req.body;

        const permission = await CellPermission.findOne({
            where: { sheetId, cellId },
        });

        if (!permission) {
            return res.status(404).json({
                success: false,
                message: 'Permission not found',
            });
        }

        await permission.update({
            canViewRoles: canViewRoles !== undefined ? canViewRoles : permission.canViewRoles,
            canViewUsers: canViewUsers !== undefined ? canViewUsers : permission.canViewUsers,
            canEditRoles: canEditRoles !== undefined ? canEditRoles : permission.canEditRoles,
            canEditUsers: canEditUsers !== undefined ? canEditUsers : permission.canEditUsers,
            isLocked: isLocked !== undefined ? isLocked : permission.isLocked,
            notes: notes !== undefined ? notes : permission.notes,
        });

        res.json({
            success: true,
            permission,
            message: 'Cell permission updated successfully',
        });
    } catch (error) {
        console.error('Error updating cell permission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update cell permission',
            error: error.message,
        });
    }
});

// Delete permission for a cell
router.delete('/sheets/:sheetId/permissions/cell/:cellId', authenticateToken, async (req, res) => {
    try {
        const { sheetId, cellId } = req.params;

        const permission = await CellPermission.findOne({
            where: { sheetId, cellId },
        });

        if (!permission) {
            return res.status(404).json({
                success: false,
                message: 'Permission not found',
            });
        }

        await permission.destroy();

        res.json({
            success: true,
            message: 'Cell permission deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting cell permission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete cell permission',
            error: error.message,
        });
    }
});

// Bulk set permissions for multiple cells
router.post('/sheets/:sheetId/permissions/bulk', authenticateToken, async (req, res) => {
    try {
        const { sheetId } = req.params;
        const { cells } = req.body; // Array of { cellId, canViewRoles, canViewUsers, canEditRoles, canEditUsers, isLocked }

        if (!Array.isArray(cells)) {
            return res.status(400).json({
                success: false,
                message: 'cells must be an array',
            });
        }

        const results = [];

        for (const cellData of cells) {
            const { cellId, canViewRoles, canViewUsers, canEditRoles, canEditUsers, isLocked, notes } = cellData;

            let permission = await CellPermission.findOne({
                where: { sheetId, cellId },
            });

            if (permission) {
                await permission.update({
                    canViewRoles: canViewRoles || [],
                    canViewUsers: canViewUsers || [],
                    canEditRoles: canEditRoles || [],
                    canEditUsers: canEditUsers || [],
                    isLocked: isLocked || false,
                    notes: notes || null,
                });
            } else {
                permission = await CellPermission.create({
                    sheetId,
                    cellId,
                    canViewRoles: canViewRoles || [],
                    canViewUsers: canViewUsers || [],
                    canEditRoles: canEditRoles || [],
                    canEditUsers: canEditUsers || [],
                    isLocked: isLocked || false,
                    notes: notes || null,
                });
            }

            results.push(permission);
        }

        res.json({
            success: true,
            permissions: results,
            message: `Bulk permissions saved for ${results.length} cells`,
        });
    } catch (error) {
        console.error('Error saving bulk permissions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save bulk permissions',
            error: error.message,
        });
    }
});

// Check if user has permission to view/edit a cell
router.post('/sheets/:sheetId/permissions/check', authenticateToken, async (req, res) => {
    try {
        const { sheetId } = req.params;
        const { cellId, userId, userRole } = req.body;

        const permission = await CellPermission.findOne({
            where: { sheetId, cellId },
        });

        // If no permission set, allow all by default
        if (!permission) {
            return res.json({
                success: true,
                canView: true,
                canEdit: true,
                isLocked: false,
            });
        }

        // Check if locked
        if (permission.isLocked) {
            return res.json({
                success: true,
                canView: true,
                canEdit: false,
                isLocked: true,
            });
        }

        // Check view permission
        const canView =
            permission.canViewRoles.length === 0 ||
            permission.canViewRoles.includes(userRole) ||
            permission.canViewUsers.includes(userId);

        // Check edit permission
        const canEdit =
            permission.canEditRoles.length === 0 ||
            permission.canEditRoles.includes(userRole) ||
            permission.canEditUsers.includes(userId);

        res.json({
            success: true,
            canView,
            canEdit,
            isLocked: false,
        });
    } catch (error) {
        console.error('Error checking permission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check permission',
            error: error.message,
        });
    }
});

module.exports = router;
