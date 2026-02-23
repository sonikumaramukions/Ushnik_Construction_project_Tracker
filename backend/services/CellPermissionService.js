// ================================================================
// CELL PERMISSION SERVICE (services/CellPermissionService.js)
// ================================================================
// PURPOSE: Manages per-cell view/edit access control.
//
// This is the finest-grained access control in the system.
// Example: Cell A3 visible only to Admin and CEO, hidden from Engineers.
//
// METHODS:
//   checkCellPermission()    — Can user view/edit this specific cell?
//   bulkCheckPermissions()   — Check permissions for multiple cells at once
//   setCellPermission()      — Set who can view/edit a cell
//   bulkSetPermissions()     — Set permissions for many cells
//   getPermissionMatrix()    — Get full permission map for a sheet
//   deleteCellPermission()   — Remove permission for a cell
//   copyPermissions()        — Copy permissions from one sheet to another
//
// USED BY: middleware/cellPermission.js, routes/cellPermissions.js
// ================================================================

const { CellPermission, Sheet, sequelize } = require('../models');
const logger = require('../utils/logger');

class CellPermissionService {
    /**
     * Check if user has permission to perform action on a cell
     */
    async checkCellPermission(sheetId, cellId, userId, role, action) {
        try {
            // First check sheet-level permissions
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                return { hasPermission: false, reason: 'Sheet not found' };
            }

            const sheetPermissions = sheet.permissions[role];
            if (!sheetPermissions) {
                return { hasPermission: false, reason: 'No sheet permissions for role' };
            }

            // For view action, check sheet-level canView
            if (action === 'view' && !sheetPermissions.canView) {
                return { hasPermission: false, reason: 'No view permission at sheet level' };
            }

            // For edit action, check sheet-level canEdit
            if (action === 'edit' && !sheetPermissions.canEdit) {
                return { hasPermission: false, reason: 'No edit permission at sheet level' };
            }

            // Check cell-level permissions
            const cellPermission = await CellPermission.findOne({
                where: { sheetId, cellId },
            });

            if (!cellPermission) {
                // No specific cell permission, use sheet-level permission
                return { hasPermission: true, reason: 'Sheet-level permission applies' };
            }

            // Check if cell is locked
            if (cellPermission.isLocked && action === 'edit') {
                return { hasPermission: false, reason: 'Cell is locked' };
            }

            // Check role-based permissions
            if (action === 'view') {
                const canViewRoles = cellPermission.canViewRoles || [];
                const canViewUsers = cellPermission.canViewUsers || [];

                if (canViewRoles.includes(role) || canViewUsers.includes(userId)) {
                    return { hasPermission: true, reason: 'Cell-level view permission granted' };
                }

                // If no specific permissions set, default to sheet-level
                if (canViewRoles.length === 0 && canViewUsers.length === 0) {
                    return { hasPermission: true, reason: 'No cell restrictions, sheet-level applies' };
                }

                return { hasPermission: false, reason: 'No cell-level view permission' };
            }

            if (action === 'edit') {
                const canEditRoles = cellPermission.canEditRoles || [];
                const canEditUsers = cellPermission.canEditUsers || [];

                if (canEditRoles.includes(role) || canEditUsers.includes(userId)) {
                    return { hasPermission: true, reason: 'Cell-level edit permission granted' };
                }

                // If no specific permissions set, default to sheet-level
                if (canEditRoles.length === 0 && canEditUsers.length === 0) {
                    return { hasPermission: true, reason: 'No cell restrictions, sheet-level applies' };
                }

                return { hasPermission: false, reason: 'No cell-level edit permission' };
            }

            return { hasPermission: false, reason: 'Unknown action' };
        } catch (error) {
            logger.error('Check cell permission error:', error);
            return { hasPermission: false, reason: 'Error checking permission' };
        }
    }

    /**
     * Bulk check permissions for multiple cells
     */
    async bulkCheckPermissions(sheetId, cellIds, userId, role, action) {
        try {
            const results = await Promise.all(
                cellIds.map(async (cellId) => {
                    const result = await this.checkCellPermission(sheetId, cellId, userId, role, action);
                    return { cellId, ...result };
                })
            );

            return results;
        } catch (error) {
            logger.error('Bulk check permissions error:', error);
            throw error;
        }
    }

    /**
     * Set cell permissions
     */
    async setCellPermissions(sheetId, cellId, permissions) {
        const transaction = await sequelize.transaction();

        try {
            const [cellPermission, created] = await CellPermission.findOrCreate({
                where: { sheetId, cellId },
                defaults: {
                    sheetId,
                    cellId,
                    canViewRoles: permissions.canViewRoles || [],
                    canViewUsers: permissions.canViewUsers || [],
                    canEditRoles: permissions.canEditRoles || [],
                    canEditUsers: permissions.canEditUsers || [],
                    isLocked: permissions.isLocked || false,
                    notes: permissions.notes || null,
                },
                transaction,
            });

            if (!created) {
                await cellPermission.update({
                    canViewRoles: permissions.canViewRoles || cellPermission.canViewRoles,
                    canViewUsers: permissions.canViewUsers || cellPermission.canViewUsers,
                    canEditRoles: permissions.canEditRoles || cellPermission.canEditRoles,
                    canEditUsers: permissions.canEditUsers || cellPermission.canEditUsers,
                    isLocked: permissions.isLocked !== undefined ? permissions.isLocked : cellPermission.isLocked,
                    notes: permissions.notes || cellPermission.notes,
                }, { transaction });
            }

            await transaction.commit();

            logger.info(`Cell permissions set for ${cellId} in sheet ${sheetId}`);
            return cellPermission;
        } catch (error) {
            await transaction.rollback();
            logger.error('Set cell permissions error:', error);
            throw error;
        }
    }

    /**
     * Bulk set permissions for multiple cells
     */
    async bulkSetPermissions(sheetId, cellPermissions) {
        const transaction = await sequelize.transaction();

        try {
            const results = await Promise.all(
                cellPermissions.map(async (cp) => {
                    return this.setCellPermissions(sheetId, cp.cellId, cp.permissions);
                })
            );

            await transaction.commit();

            logger.info(`Bulk permissions set for ${cellPermissions.length} cells in sheet ${sheetId}`);
            return results;
        } catch (error) {
            await transaction.rollback();
            logger.error('Bulk set permissions error:', error);
            throw error;
        }
    }

    /**
     * Get permission matrix for a sheet
     */
    async getPermissionMatrix(sheetId) {
        try {
            const cellPermissions = await CellPermission.findAll({
                where: { sheetId },
            });

            const matrix = {};
            cellPermissions.forEach(cp => {
                matrix[cp.cellId] = {
                    canViewRoles: cp.canViewRoles,
                    canViewUsers: cp.canViewUsers,
                    canEditRoles: cp.canEditRoles,
                    canEditUsers: cp.canEditUsers,
                    isLocked: cp.isLocked,
                    notes: cp.notes,
                };
            });

            return matrix;
        } catch (error) {
            logger.error('Get permission matrix error:', error);
            throw error;
        }
    }

    /**
     * Delete cell permissions
     */
    async deleteCellPermission(sheetId, cellId) {
        try {
            const result = await CellPermission.destroy({
                where: { sheetId, cellId },
            });

            logger.info(`Cell permission deleted for ${cellId} in sheet ${sheetId}`);
            return result > 0;
        } catch (error) {
            logger.error('Delete cell permission error:', error);
            throw error;
        }
    }

    /**
     * Copy permissions from one sheet to another
     */
    async copyPermissions(sourceSheetId, targetSheetId) {
        const transaction = await sequelize.transaction();

        try {
            const sourcePermissions = await CellPermission.findAll({
                where: { sheetId: sourceSheetId },
                transaction,
            });

            const copiedPermissions = await Promise.all(
                sourcePermissions.map(async (sp) => {
                    return CellPermission.create({
                        sheetId: targetSheetId,
                        cellId: sp.cellId,
                        canViewRoles: sp.canViewRoles,
                        canViewUsers: sp.canViewUsers,
                        canEditRoles: sp.canEditRoles,
                        canEditUsers: sp.canEditUsers,
                        isLocked: sp.isLocked,
                        notes: sp.notes,
                    }, { transaction });
                })
            );

            await transaction.commit();

            logger.info(`Copied ${copiedPermissions.length} permissions from sheet ${sourceSheetId} to ${targetSheetId}`);
            return copiedPermissions;
        } catch (error) {
            await transaction.rollback();
            logger.error('Copy permissions error:', error);
            throw error;
        }
    }
}

module.exports = new CellPermissionService();
