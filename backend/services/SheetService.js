// ================================================================
// SHEET SERVICE (services/SheetService.js) — CORE BUSINESS LOGIC
// ================================================================
// PURPOSE: The main service for sheet operations — the brain of the app.
//
// This service handles all the complex business logic:
//   - Sheet CRUD with version snapshots
//   - Cell updates with formula recalculation
//   - Pushing sheets to roles/users (creates UserSheet records)
//   - Getting assigned sheets for a user
//   - Syncing changes back to admin
//
// METHODS:
//   createSheet()         — Create sheet + initial version snapshot
//   updateCell()          — Update cell + recalculate ALL formulas
//   getSheet()            — Get sheet with all cell data
//   pushToRoles()         — Update permissions + create UserSheet records
//   pushToUsers()         — Assign to specific users
//   getAssignedSheets()   — Get sheets assigned to a user
//   syncSheet()           — Sync changes back to admin (bumps version)
//   createVersionSnapshot() — Save a snapshot of current state
//   isUserAssigned()      — Check if user is assigned to a sheet
//   getDefaultPermissions() — Default permissions for all 6 roles
//
// USED BY: routes/sheets.js, routes/data.js
// ================================================================

const { Sheet, SheetAssignment, UserSheet, User, CellData, SheetVersion, sequelize } = require('../models');
const FormulaEngine = require('./formulaEngine');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class SheetService {
        /**
         * Create a new sheet with proper initialization
         */
        async createSheet(data, userId) {
                const transaction = await sequelize.transaction();

                try {
                        const sheetData = {
                                name: data.name,
                                description: data.description,
                                projectId: data.projectId,
                                isTemplate: data.isTemplate || false,
                                createdById: userId,
                                structure: data.structure || {
                                        columns: [],
                                        rows: [],
                                        cells: {},
                                },
                                permissions: data.permissions || this.getDefaultPermissions(),
                                validationRules: data.validationRules || {},
                                status: 'DRAFT',
                                version: 1,
                        };

                        // If creating from template, copy structure
                        if (data.templateId) {
                                const template = await Sheet.findByPk(data.templateId);
                                if (template) {
                                        sheetData.structure = template.structure;
                                        sheetData.permissions = template.permissions;
                                        sheetData.validationRules = template.validationRules;
                                        sheetData.templateId = data.templateId;
                                }
                        }

                        const sheet = await Sheet.create(sheetData, { transaction });

                        // Create initial version
                        await SheetVersion.create({
                                sheetId: sheet.id,
                                version: 1,
                                structure: sheet.structure,
                                cellDataSnapshot: {},
                                permissions: sheet.permissions,
                                changedById: userId,
                                changeType: 'STRUCTURE_CHANGE',
                                changeDescription: 'Initial sheet creation',
                        }, { transaction });

                        await transaction.commit();

                        logger.info(`Sheet created: ${sheet.id} by user ${userId}`);
                        return sheet;
                } catch (error) {
                        await transaction.rollback();
                        logger.error('Create sheet error:', error);
                        throw error;
                }
        }

        /**
         * Update a single cell (with transaction) and recalculate formulas
         */
        async updateCell({ sheetId, cellId, value, dataType, userId }) {
                return sequelize.transaction(async (tx) => {
                        let cell = await CellData.findOne({ where: { sheetId, cellId }, transaction: tx });
                        if (!cell) {
                                cell = await CellData.create({ sheetId, cellId, value, dataType: dataType || 'TEXT', createdById: userId, lastModifiedById: userId }, { transaction: tx });
                        } else {
                                cell.value = value;
                                cell.dataType = dataType || cell.dataType;
                                cell.lastModifiedById = userId;
                                await cell.save({ transaction: tx });
                        }

                        // Recalculate formulas if sheet has formulas (persist results)
                        const sheet = await Sheet.findByPk(sheetId, { include: ['cellData'], transaction: tx });
                        if (sheet && sheet.formulas && Object.keys(sheet.formulas).length > 0) {
                                const cMap = {};
                                sheet.cellData.forEach(cd => { cMap[cd.cellId] = { value: cd.value }; });
                                const recalculated = FormulaEngine.recalculateSheet(sheet.formulas, cMap);
                                for (const [cid, obj] of Object.entries(recalculated)) {
                                        const existing = sheet.cellData.find(x => x.cellId === cid);
                                        if (existing) {
                                                existing.value = obj.value;
                                                existing.numericValue = parseFloat(obj.value) || existing.numericValue;
                                                await existing.save({ transaction: tx });
                                        } else {
                                                const m = cid.match(/([A-Z]+)(\d+)/);
                                                const colIdx = m ? m[1].charCodeAt(0) - 65 : 0;
                                                const rowIdx = m ? parseInt(m[2]) - 1 : 0;
                                                await CellData.create({ sheetId, cellId: cid, value: obj.value, dataType: 'TEXT', rowIndex: rowIdx, columnIndex: colIdx, createdById: userId, lastModifiedById: userId }, { transaction: tx });
                                        }
                                }
                        }

                        return cell;
                });
        }

        async getSheetData(sheetId) {
                const sheet = await Sheet.findByPk(sheetId, { include: ['cellData'] });
                if (!sheet) return null;
                return {
                        sheet: sheet.toJSON(),
                        cells: sheet.cellData.map(c => c.toJSON()),
                };
        }
    

    /**
     * Push sheet to specific roles
     */
    async pushSheetToRoles(sheetId, targetRoles, userId) {
        const transaction = await sequelize.transaction();

        try {
            const sheet = await Sheet.findByPk(sheetId, { transaction });
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            // Update sheet permissions to include target roles
            const updatedPermissions = { ...sheet.permissions };
            targetRoles.forEach(role => {
                if (!updatedPermissions[role]) {
                    updatedPermissions[role] = this.getDefaultPermissions()[role];
                }
            });

            // Update assigned roles
            const currentRoles = sheet.assignedRoles || [];
            const newRoles = [...new Set([...currentRoles, ...targetRoles])];

            await sheet.update({
                permissions: updatedPermissions,
                assignedRoles: newRoles,
                status: 'ACTIVE',
                lastModifiedById: userId,
            }, { transaction });

            // Get all users with these roles
            const users = await User.findAll({
                where: { role: { [Op.in]: targetRoles }, isActive: true },
                transaction,
            });

            // Create UserSheet assignments for each user
            const assignments = await Promise.all(
                users.map(async (user) => {
                    const [assignment, created] = await UserSheet.findOrCreate({
                        where: { userId: user.id, sheetId: sheet.id },
                        defaults: {
                            userId: user.id,
                            sheetId: sheet.id,
                            assignedById: userId,
                            status: 'pending',
                            cellChanges: {},
                            progress: 0,
                        },
                        transaction,
                    });
                    return { assignment, created };
                })
            );

            await transaction.commit();

            logger.info(`Sheet ${sheetId} pushed to roles: ${targetRoles.join(', ')} by user ${userId}`);
            return { sheet, assignments: assignments.filter(a => a.created).map(a => a.assignment) };
        } catch (error) {
            await transaction.rollback();
            logger.error('Push sheet to roles error:', error);
            throw error;
        }
    }

    /**
     * Push sheet to specific users
     */
    async pushSheetToUsers(sheetId, userIds, userId) {
        const transaction = await sequelize.transaction();

        try {
            const sheet = await Sheet.findByPk(sheetId, { transaction });
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            // Verify users exist
            const users = await User.findAll({
                where: { id: { [Op.in]: userIds }, isActive: true },
                transaction,
            });

            if (users.length === 0) {
                throw new Error('No valid users found');
            }

            // Update assigned users
            const currentUsers = sheet.assignedUsers || [];
            const newUsers = [...new Set([...currentUsers, ...userIds])];

            await sheet.update({
                assignedUsers: newUsers,
                status: 'ACTIVE',
                lastModifiedById: userId,
            }, { transaction });

            // Create UserSheet assignments
            const assignments = await Promise.all(
                users.map(async (user) => {
                    const [assignment, created] = await UserSheet.findOrCreate({
                        where: { userId: user.id, sheetId: sheet.id },
                        defaults: {
                            userId: user.id,
                            sheetId: sheet.id,
                            assignedById: userId,
                            status: 'pending',
                            cellChanges: {},
                            progress: 0,
                        },
                        transaction,
                    });
                    return { assignment, created, user };
                })
            );

            await transaction.commit();

            logger.info(`Sheet ${sheetId} pushed to ${users.length} user(s) by user ${userId}`);
            return {
                sheet,
                assignments: assignments.filter(a => a.created).map(a => a.assignment),
                users: assignments.map(a => a.user),
            };
        } catch (error) {
            await transaction.rollback();
            logger.error('Push sheet to users error:', error);
            throw error;
        }
    }

    /**
     * Get sheets assigned to a specific user
     */
    async getAssignedSheets(userId, role) {
        try {
            // Get sheets where user is explicitly assigned OR user's role is in assignedRoles
            const userSheets = await UserSheet.findAll({
                where: { userId, status: { [Op.ne]: 'revoked' } },
                include: [
                    {
                        model: Sheet,
                        as: 'sheet',
                        include: [
                            {
                                association: 'project',
                                attributes: ['id', 'name', 'status', 'location'],
                            },
                            {
                                association: 'creator',
                                attributes: ['id', 'firstName', 'lastName', 'email'],
                            },
                            {
                                association: 'lastModifier',
                                attributes: ['id', 'firstName', 'lastName'],
                            },
                        ],
                    },
                ],
                order: [[{ model: Sheet, as: 'sheet' }, 'updatedAt', 'DESC']],
            });

            // Also get sheets where user's role is in assignedRoles
            const roleSheets = await Sheet.findAll({
                where: {
                    assignedRoles: { [Op.contains]: [role] },
                    status: { [Op.ne]: 'ARCHIVED' },
                },
                include: [
                    {
                        association: 'project',
                        attributes: ['id', 'name', 'status', 'location'],
                    },
                    {
                        association: 'creator',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    },
                    {
                        association: 'lastModifier',
                        attributes: ['id', 'firstName', 'lastName'],
                    },
                ],
                order: [['updatedAt', 'DESC']],
            });

            // Merge and deduplicate
            const sheetMap = new Map();

            userSheets.forEach(us => {
                if (us.sheet) {
                    sheetMap.set(us.sheet.id, us.sheet);
                }
            });

            roleSheets.forEach(sheet => {
                if (!sheetMap.has(sheet.id)) {
                    sheetMap.set(sheet.id, sheet);
                }
            });

            return Array.from(sheetMap.values());
        } catch (error) {
            logger.error('Get assigned sheets error:', error);
            throw error;
        }
    }

    /**
     * Sync sheet updates back to admin
     */
    async syncSheetToAdmin(sheetId, userId) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                throw new Error('Sheet not found');
            }

            await sheet.update({
                lastModifiedById: userId,
                lastSyncedAt: new Date(),
                version: sheet.version + 1,
            });

            logger.info(`Sheet ${sheetId} synced to admin by user ${userId}`);
            return sheet;
        } catch (error) {
            logger.error('Sync sheet to admin error:', error);
            throw error;
        }
    }

    /**
     * Create a version snapshot of the sheet
     */
    async createSheetVersion(sheetId, changeType, userId, changeDescription = '') {
        const transaction = await sequelize.transaction();

        try {
            const sheet = await Sheet.findByPk(sheetId, {
                include: [{ association: 'cellData' }],
                transaction,
            });

            if (!sheet) {
                throw new Error('Sheet not found');
            }

            // Get current cell data as snapshot
            const cellDataSnapshot = {};
            if (sheet.cellData) {
                sheet.cellData.forEach(cell => {
                    cellDataSnapshot[cell.cellId] = {
                        value: cell.value,
                        dataType: cell.dataType,
                        status: cell.status,
                    };
                });
            }

            const version = await SheetVersion.create({
                sheetId: sheet.id,
                version: sheet.version,
                structure: sheet.structure,
                cellDataSnapshot,
                permissions: sheet.permissions,
                changedById: userId,
                changeType,
                changeDescription,
            }, { transaction });

            await transaction.commit();

            logger.info(`Sheet version created: ${version.id} for sheet ${sheetId}`);
            return version;
        } catch (error) {
            await transaction.rollback();
            logger.error('Create sheet version error:', error);
            throw error;
        }
    }

    /**
     * Check if user is assigned to a sheet
     */
    async isUserAssigned(sheetId, userId, role) {
        try {
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                return false;
            }

            // Check if user is explicitly assigned
            const assignedUsers = sheet.assignedUsers || [];
            if (assignedUsers.includes(userId)) {
                return true;
            }

            // Check if user's role is in assignedRoles
            const assignedRoles = sheet.assignedRoles || [];
            if (assignedRoles.includes(role)) {
                return true;
            }

            // Check UserSheet table
            const userSheet = await UserSheet.findOne({
                where: { userId, sheetId, status: { [Op.ne]: 'revoked' } },
            });

            return !!userSheet;
        } catch (error) {
            logger.error('Check user assignment error:', error);
            return false;
        }
    }

    /**
     * Get default permissions for all roles
     */
    getDefaultPermissions() {
        return {
            'L1_ADMIN': {
                canView: true,
                canEdit: true,
                canDelete: true,
                canCreateRows: true,
                canCreateColumns: true,
                canModifyStructure: true,
                canLock: true,
                canUnlock: true,
            },
            'L2_SENIOR_ENGINEER': {
                canView: true,
                canEdit: true,
                canDelete: false,
                canCreateRows: false,
                canCreateColumns: false,
                canModifyStructure: false,
                canLock: false,
                canUnlock: false,
            },
            'L3_JUNIOR_ENGINEER': {
                canView: true,
                canEdit: true,
                canDelete: false,
                canCreateRows: false,
                canCreateColumns: false,
                canModifyStructure: false,
                canLock: false,
                canUnlock: false,
            },
            'PROJECT_MANAGER': {
                canView: true,
                canEdit: false,
                canDelete: false,
                canCreateRows: false,
                canCreateColumns: false,
                canModifyStructure: false,
                canLock: false,
                canUnlock: false,
            },
            'GROUND_MANAGER': {
                canView: true,
                canEdit: true,
                canDelete: false,
                canCreateRows: false,
                canCreateColumns: false,
                canModifyStructure: false,
                canLock: false,
                canUnlock: false,
            },
            'CEO': {
                canView: true,
                canEdit: false,
                canDelete: false,
                canCreateRows: false,
                canCreateColumns: false,
                canModifyStructure: false,
                canLock: false,
                canUnlock: false,
            },
        };
    }
}

module.exports = new SheetService();
