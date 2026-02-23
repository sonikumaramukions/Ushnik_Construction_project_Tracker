// ================================================================
// SHEET COLLABORATION SERVICE (services/SheetCollaborationService.js)
// ================================================================
// PURPOSE: Handles real-time sheet collaboration via Socket.io.
//
// This is the LIVE collaboration engine:
//   - Push sheets to roles with instant Socket.io notifications
//   - Broadcast updates to all collaborators in real-time
//   - Cell-level push (only to users who can view that cell)
//   - Dashboard sync (update user's dashboard instantly)
//   - Offline sync support with sync tokens
//
// METHODS:
//   pushToRoles()          — Push sheet + notify via Socket.io
//   broadcastUpdate()      — Broadcast change to all assigned roles
//   pushCellUpdate()       — Push cell change (respects permissions)
//   removeCollaboration()  — Remove role access + revoke permissions
//   getCollaborators()     — List all collaborating roles + users
//   syncToDashboard()      — Push update to user's dashboard
//   enableOfflineSync()    — Set up offline sync with token
//
// USED BY: routes/sheetCollaboration.js
// ================================================================

const { Sheet, Notification, User } = require('../models');
const logger = require('../utils/logger');

/**
 * Sheet Collaboration Service
 * Handles sheet sharing, pushing to roles, and real-time synchronization
 */
class SheetCollaborationService {
    /**
     * Push a sheet to collaborate with specified roles
     * Creates notifications and updates sheet assignments
     * @param {string} sheetId - Sheet ID
     * @param {Array} rolesToShare - Array of roles to share with
     * @param {string} userId - User ID pushing the sheet
     * @param {Object} io - Socket.io instance
     * @returns {Promise<Object>} Result of push operation
     */
    async pushSheetToRoles(sheetId, rolesToShare, userId, io) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            // Update sheet to mark as shared
            sheet.isShared = true;
            sheet.sharedAt = new Date();
            sheet.sharedBy = userId;
            
            // Store roles the sheet is shared with
            const currentSharedRoles = sheet.assignedRoles || [];
            sheet.assignedRoles = [...new Set([...currentSharedRoles, ...rolesToShare])];
            
            await sheet.save();

            // Get all users with the specified roles
            const usersToNotify = await User.findAll({
                where: {
                    role: rolesToShare
                },
                attributes: ['id', 'role', 'email', 'firstName', 'lastName']
            });

            // Create notifications for each user
            const notifications = [];
            for (const user of usersToNotify) {
                const notification = await Notification.create({
                    userId: user.id,
                    type: 'SHEET_SHARED',
                    title: 'New Sheet Shared',
                    message: `Sheet "${sheet.name}" has been shared with you for collaboration`,
                    metadata: {
                        sheetId,
                        sheetName: sheet.name,
                        sharedBy: userId,
                        timestamp: new Date().toISOString()
                    }
                });
                notifications.push(notification);

                // Emit real-time notification via Socket.io
                if (io) {
                    io.to(`user_${user.id}`).emit('sheet_shared', {
                        sheetId,
                        sheetName: sheet.name,
                        permissions: sheet.permissions?.[user.role],
                        timestamp: new Date().toISOString()
                    });

                    // Broadcast to role-based rooms
                    io.to(`role_${user.role}`).emit('sheet_shared_to_role', {
                        sheetId,
                        sheetName: sheet.name,
                        role: user.role,
                        permissions: sheet.permissions?.[user.role]
                    });
                }
            }

            return {
                success: true,
                sheetId,
                sharedRoles: rolesToShare,
                notificationsCreated: notifications.length,
                message: `Sheet shared with ${rolesToShare.length} role(s)`
            };

        } catch (error) {
            logger.error('Error pushing sheet to roles:', error);
            throw error;
        }
    }

    /**
     * Broadcast sheet update to all collaborators
     * @param {string} sheetId - Sheet ID
     * @param {Object} updateData - Update data
     * @param {Object} io - Socket.io instance
     * @returns {Promise<void>}
     */
    async broadcastSheetUpdate(sheetId, updateData, io) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            // Get all assigned roles
            const assignedRoles = sheet.assignedRoles || [];

            // Broadcast to each role
            for (const role of assignedRoles) {
                if (io) {
                    io.to(`role_${role}`).emit('sheet_updated', {
                        sheetId,
                        sheetName: sheet.name,
                        ...updateData,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            logger.info(`Sheet update broadcasted to ${assignedRoles.length} role(s)`);

        } catch (error) {
            logger.error('Error broadcasting sheet update:', error);
        }
    }

    /**
     * Push cell update to collaborators
     * Respects cell-level permissions
     * @param {string} sheetId - Sheet ID
     * @param {string} cellId - Cell ID
     * @param {Object} cellData - Cell data
     * @param {Object} io - Socket.io instance
     * @returns {Promise<void>}
     */
    async pushCellUpdate(sheetId, cellId, cellData, io) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            const assignedRoles = sheet.assignedRoles || [];

            // Broadcast to collaborating roles
            for (const role of assignedRoles) {
                const permissions = sheet.permissions?.[role];
                
                // Only send update to roles that can view this sheet
                if (permissions?.canView) {
                    if (io) {
                        io.to(`role_${role}`).emit('cell_updated', {
                            sheetId,
                            cellId,
                            cellData,
                            canEdit: permissions?.canEdit ?? false,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }

        } catch (error) {
            logger.error('Error pushing cell update:', error);
        }
    }

    /**
     * Stop collaborating with a role
     * @param {string} sheetId - Sheet ID
     * @param {string} roleToRemove - Role to remove collaboration
     * @returns {Promise<Object>} Result
     */
    async removeRoleCollaboration(sheetId, roleToRemove) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            const assignedRoles = sheet.assignedRoles || [];
            sheet.assignedRoles = assignedRoles.filter(r => r !== roleToRemove);

            // Remove permissions for this role
            const permissions = sheet.permissions || {};
            if (permissions[roleToRemove]) {
                permissions[roleToRemove] = {
                    canView: false,
                    canEdit: false,
                    canApprove: false,
                    canDelete: false,
                    canShare: false
                };
            }

            sheet.permissions = permissions;
            await sheet.save();

            return {
                success: true,
                sheetId,
                roleRemoved: roleToRemove,
                message: `Collaboration removed for role: ${roleToRemove}`
            };

        } catch (error) {
            logger.error('Error removing role collaboration:', error);
            throw error;
        }
    }

    /**
     * Get all collaborators of a sheet (roles and users)
     * @param {string} sheetId - Sheet ID
     * @returns {Promise<Object>} Collaboration info
     */
    async getSheetCollaborators(sheetId) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            const assignedRoles = sheet.assignedRoles || [];
            const permissions = sheet.permissions || {};

            // Get users for each role
            const collaborators = {};
            for (const role of assignedRoles) {
                const users = await User.findAll({
                    where: { role },
                    attributes: ['id', 'email', 'firstName', 'lastName', 'role']
                });

                collaborators[role] = {
                    users,
                    permissions: permissions[role],
                    count: users.length
                };
            }

            return {
                sheetId,
                isShared: sheet.isShared,
                sharedAt: sheet.sharedAt,
                sharedBy: sheet.sharedBy,
                assignedRoles,
                collaborators,
                totalCollaborators: Object.values(collaborators).reduce((sum, r) => sum + r.count, 0)
            };

        } catch (error) {
            logger.error('Error getting sheet collaborators:', error);
            throw error;
        }
    }

    /**
     * Sync sheet to dashboard for a role
     * Updates the sheet in user's active sheets
     * @param {string} sheetId - Sheet ID
     * @param {string} role - Target role
     * @param {Object} io - Socket.io instance
     * @returns {Promise<void>}
     */
    async syncSheetToDashboard(sheetId, role, io) {
        try {
            const sheet = await Sheet.findByPk(sheetId, {
                attributes: ['id', 'name', 'projectId', 'status', 'permissions', 'assignedRoles']
            });

            if (!sheet) {
                throw new Error('Sheet not found');
            }

            // Only sync if this role has access
            if (!sheet.assignedRoles?.includes(role)) {
                return;
            }

            const permissions = sheet.permissions?.[role];

            if (io) {
                io.to(`role_${role}`).emit('sheet_synced_to_dashboard', {
                    sheetId,
                    name: sheet.name,
                    projectId: sheet.projectId,
                    status: sheet.status,
                    permissions,
                    syncedAt: new Date().toISOString()
                });
            }

            logger.info(`Sheet ${sheetId} synced to dashboard for role ${role}`);

        } catch (error) {
            logger.error('Error syncing sheet to dashboard:', error);
        }
    }

    /**
     * Enable offline sync for a sheet
     * Allows role to work offline and sync when back online
     * @param {string} sheetId - Sheet ID
     * @param {string} role - Target role
     * @returns {Promise<Object>} Offline sync token
     */
    async enableOfflineSync(sheetId, role) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            // Store offline sync metadata
            const offlineSyncToken = `${sheetId}_${role}_${Date.now()}`;
            
            sheet.metadata = sheet.metadata || {};
            sheet.metadata.offlineSync = sheet.metadata.offlineSync || {};
            sheet.metadata.offlineSync[role] = {
                enabled: true,
                token: offlineSyncToken,
                enabledAt: new Date().toISOString()
            };

            await sheet.save();

            return {
                sheetId,
                role,
                token: offlineSyncToken,
                enabled: true,
                message: 'Offline sync enabled'
            };

        } catch (error) {
            logger.error('Error enabling offline sync:', error);
            throw error;
        }
    }
}

module.exports = new SheetCollaborationService();
