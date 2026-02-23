// ================================================================
// ROLE PERMISSION SERVICE (services/RolePermissionService.js)
// ================================================================
// PURPOSE: Manages role-based permissions on sheets.
//
// Each sheet has a 'permissions' JSON field that stores what each role can do.
// This service reads/writes that field.
//
// PERMISSION TEMPLATES (pre-built sets):
//   VIEW_ONLY    — canView only
//   EDITOR       — canView + canEdit
//   APPROVER     — canView + canEdit + canApprove
//   FULL_ACCESS  — Everything enabled
//   NONE         — Nothing enabled
//
// METHODS:
//   setRolePermission()     — Set permissions for one role on a sheet
//   getRolePermission()     — Get permissions for a role
//   setAllRolePermissions() — Set for all roles at once
//   checkAction()           — Can this role do this action?
//   getTemplates()          — Get all available templates
//   getDefaults()           — Get default permissions for all 6 roles
//
// USED BY: routes/rolePermissions.js, routes/permissions.js
// ================================================================

const { Sheet, CellPermission } = require('../models');
const logger = require('../utils/logger');

/**
 * Role Permission Service
 * Manages edit/view permissions for roles on sheets and cells
 */
class RolePermissionService {
    /**
     * Set permissions for a role on a sheet
     * @param {string} sheetId - Sheet ID
     * @param {string} role - User role
     * @param {Object} permissions - Permission object {canView, canEdit}
     * @returns {Promise<Object>} Updated permissions
     */
    async setSheetPermissions(sheetId, role, permissions) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            // Validate role
            const validRoles = ['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER', 'CEO'];
            if (!validRoles.includes(role)) {
                throw new Error(`Invalid role: ${role}`);
            }

            // Update sheet permissions
            const currentPermissions = sheet.permissions || {};
            currentPermissions[role] = {
                canView: permissions.canView ?? false,
                canEdit: permissions.canEdit ?? false,
                canApprove: permissions.canApprove ?? false,
                canDelete: permissions.canDelete ?? false,
                canShare: permissions.canShare ?? false,
                setAt: new Date().toISOString()
            };

            sheet.permissions = currentPermissions;
            await sheet.save();

            return {
                sheetId,
                role,
                permissions: currentPermissions[role]
            };
        } catch (error) {
            logger.error('Error setting sheet permissions:', error);
            throw error;
        }
    }

    /**
     * Get permissions for a role on a sheet
     * @param {string} sheetId - Sheet ID
     * @param {string} role - User role
     * @returns {Promise<Object>} Role permissions
     */
    async getSheetPermissions(sheetId, role) {
        try {
            const sheet = await Sheet.findByPk(sheetId, {
                attributes: ['id', 'permissions']
            });

            if (!sheet) {
                throw new Error('Sheet not found');
            }

            return sheet.permissions?.[role] || {
                canView: false,
                canEdit: false,
                canApprove: false,
                canDelete: false,
                canShare: false
            };
        } catch (error) {
            logger.error('Error getting sheet permissions:', error);
            throw error;
        }
    }

    /**
     * Set permissions for all roles on a sheet
     * @param {string} sheetId - Sheet ID
     * @param {Object} rolePermissions - Object with role: permissions mapping
     * @returns {Promise<Object>} Updated permissions
     */
    async setMultipleRolePermissions(sheetId, rolePermissions) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            const updatedPermissions = sheet.permissions || {};

            for (const [role, permissions] of Object.entries(rolePermissions)) {
                updatedPermissions[role] = {
                    canView: permissions.canView ?? false,
                    canEdit: permissions.canEdit ?? false,
                    canApprove: permissions.canApprove ?? false,
                    canDelete: permissions.canDelete ?? false,
                    canShare: permissions.canShare ?? false,
                    setAt: new Date().toISOString()
                };
            }

            sheet.permissions = updatedPermissions;
            await sheet.save();

            return {
                sheetId,
                permissions: updatedPermissions
            };
        } catch (error) {
            logger.error('Error setting multiple role permissions:', error);
            throw error;
        }
    }

    /**
     * Set cell-level permissions for a role
     * @param {string} sheetId - Sheet ID
     * @param {string} cellId - Cell ID
     * @param {string} role - User role
     * @param {Object} permissions - Cell permissions
     * @returns {Promise<Object>} Updated cell permissions
     */
    async setCellPermissions(sheetId, cellId, role, permissions) {
        try {
            let cellPerm = await CellPermission.findOne({
                where: { sheetId, cellId, role }
            });

            if (!cellPerm) {
                cellPerm = await CellPermission.create({
                    sheetId,
                    cellId,
                    role,
                    canView: permissions.canView ?? false,
                    canEdit: permissions.canEdit ?? false
                });
            } else {
                cellPerm.canView = permissions.canView ?? cellPerm.canView;
                cellPerm.canEdit = permissions.canEdit ?? cellPerm.canEdit;
                await cellPerm.save();
            }

            return cellPerm;
        } catch (error) {
            logger.error('Error setting cell permissions:', error);
            throw error;
        }
    }

    /**
     * Get cell permissions for a role
     * @param {string} sheetId - Sheet ID
     * @param {string} cellId - Cell ID
     * @param {string} role - User role
     * @returns {Promise<Object>} Cell permissions
     */
    async getCellPermissions(sheetId, cellId, role) {
        try {
            const cellPerm = await CellPermission.findOne({
                where: { sheetId, cellId, role }
            });

            return cellPerm ? {
                canView: cellPerm.canView,
                canEdit: cellPerm.canEdit
            } : {
                canView: false,
                canEdit: false
            };
        } catch (error) {
            logger.error('Error getting cell permissions:', error);
            throw error;
        }
    }

    /**
     * Check if a role can perform an action
     * @param {string} sheetId - Sheet ID
     * @param {string} role - User role
     * @param {string} action - Action (view, edit, approve, delete, share)
     * @returns {Promise<boolean>} Whether action is allowed
     */
    async canPerformAction(sheetId, role, action) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                return false;
            }

            const permissions = sheet.permissions?.[role];
            if (!permissions) {
                return false;
            }

            const actionMap = {
                'view': 'canView',
                'edit': 'canEdit',
                'approve': 'canApprove',
                'delete': 'canDelete',
                'share': 'canShare'
            };

            return permissions[actionMap[action]] ?? false;
        } catch (error) {
            logger.error('Error checking action permission:', error);
            return false;
        }
    }

    /**
     * Get all roles with their permissions for a sheet
     * @param {string} sheetId - Sheet ID
     * @returns {Promise<Object>} All role permissions
     */
    async getAllRolePermissions(sheetId) {
        try {
            const sheet = await Sheet.findByPk(sheetId, {
                attributes: ['id', 'permissions']
            });

            if (!sheet) {
                throw new Error('Sheet not found');
            }

            return sheet.permissions || {};
        } catch (error) {
            logger.error('Error getting all role permissions:', error);
            throw error;
        }
    }

    /**
     * Get permission templates (presets)
     * @returns {Object} Permission templates
     */
    static getPermissionTemplates() {
        return {
            VIEW_ONLY: {
                canView: true,
                canEdit: false,
                canApprove: false,
                canDelete: false,
                canShare: false
            },
            EDITOR: {
                canView: true,
                canEdit: true,
                canApprove: false,
                canDelete: false,
                canShare: false
            },
            APPROVER: {
                canView: true,
                canEdit: true,
                canApprove: true,
                canDelete: false,
                canShare: false
            },
            FULL_ACCESS: {
                canView: true,
                canEdit: true,
                canApprove: true,
                canDelete: true,
                canShare: true
            },
            NONE: {
                canView: false,
                canEdit: false,
                canApprove: false,
                canDelete: false,
                canShare: false
            }
        };
    }

    /**
     * Get default permissions for each role
     * @returns {Object} Default permissions per role
     */
    static getDefaultPermissions() {
        return {
            L1_ADMIN: {
                canView: true,
                canEdit: true,
                canApprove: true,
                canDelete: true,
                canShare: true
            },
            L2_SENIOR_ENGINEER: {
                canView: true,
                canEdit: true,
                canApprove: true,
                canDelete: false,
                canShare: false
            },
            L3_JUNIOR_ENGINEER: {
                canView: true,
                canEdit: true,
                canApprove: false,
                canDelete: false,
                canShare: false
            },
            PROJECT_MANAGER: {
                canView: true,
                canEdit: true,
                canApprove: false,
                canDelete: false,
                canShare: true
            },
            GROUND_MANAGER: {
                canView: true,
                canEdit: true,
                canApprove: false,
                canDelete: false,
                canShare: false
            },
            CEO: {
                canView: true,
                canEdit: false,
                canApprove: false,
                canDelete: false,
                canShare: false
            }
        };
    }
}

module.exports = new RolePermissionService();
