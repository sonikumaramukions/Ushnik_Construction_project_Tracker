// ================================================================
// USER SHEETS ROUTES (routes/userSheets.js)
// ================================================================
// PURPOSE: User-facing sheet access — view and fill in assigned sheets.
//
// This is what ENGINEERS and GROUND MANAGERS use to:
//   1. See which sheets are assigned to them
//   2. View assigned cells/questions
//   3. Fill in cell values
//   4. Submit their work for review
//
// ENDPOINTS:
//   GET  /api/user-sheets/my-sheets         — Get all sheets assigned to me
//   GET  /api/user-sheets/my-sheets/:sheetId/assigned — Get my assigned cells
//   GET  /api/user-sheets/my-sheets/:sheetId — Get an assigned sheet
//   PUT  /api/user-sheets/my-sheets/:sheetId/cells/:cellId — Update a cell
//   POST /api/user-sheets/my-sheets/:sheetId/submit — Submit for review
//   PUT  /api/user-sheets/my-sheets/:sheetId/status — Update status
//
// ACCESS: All authenticated users (they only see their own assignments)
// ================================================================

const express = require('express');
const router = express.Router();
const { UserSheet, Sheet, CellPermission, CellData, User, SheetAssignment } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');

// Get all sheets assigned to the current user
router.get('/my-sheets', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const userSheets = await UserSheet.findAll({
            where: { userId },
            include: [
                {
                    model: Sheet,
                    as: 'sheet',
                    include: [
                        {
                            model: User,
                            as: 'creator',
                            attributes: ['id', 'firstName', 'lastName', 'email'],
                        },
                    ],
                },
            ],
            order: [['createdAt', 'DESC']],
        });

        res.json({
            success: true,
            sheets: userSheets,
        });
    } catch (error) {
        console.error('Error fetching user sheets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user sheets',
            error: error.message,
        });
    }
});

// Get assigned questions (cells/rows/columns) for current user
router.get('/questions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        const { CellPermission, Sheet } = require('../models');

        // Optionally filter by sheetId
        const sheetId = req.query.sheetId;

        // Find cell permissions where user is included or role is included
        const where = {};
        if (sheetId) where.sheetId = sheetId;

        const perms = await CellPermission.findAll({ where });

        const assigned = perms.filter(p => {
            if ((p.canEditUsers || []).includes(String(userId))) return true;
            if ((p.canEditRoles || []).includes(userRole)) return true;
            return false;
        });

        // Build question list
        const questions = [];
        for (const p of assigned) {
            const sheet = await Sheet.findByPk(p.sheetId);
            questions.push({
                sheetId: p.sheetId,
                sheetName: sheet ? sheet.name : null,
                cellId: p.cellId,
                canEdit: true,
                canView: true,
            });
        }

        // Also include any UserSheet assignments with tracked cellChanges (if any)
        const userSheets = await UserSheet.findAll({ where: { userId } });
        for (const us of userSheets) {
            const s = await Sheet.findByPk(us.sheetId);
            // if cellChanges present, include those cells
            const cc = us.cellChanges || {};
            Object.keys(cc).forEach(cellId => {
                questions.push({ sheetId: us.sheetId, sheetName: s ? s.name : null, cellId, canEdit: true, fromUserSheet: true });
            });
        }

        // Deduplicate by sheetId+cellId
        const unique = {};
        questions.forEach(q => { unique[`${q.sheetId}:${q.cellId}`] = q; });

        res.json({ success: true, questions: Object.values(unique) });
    } catch (error) {
        console.error('Error fetching assigned questions:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch questions', error: error.message });
    }
});

// Get a specific sheet assigned to the user with permissions + assignment visibility
router.get('/my-sheets/:sheetId', authenticateToken, async (req, res) => {
    try {
        const { sheetId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Check if user has access to this sheet
        const userSheet = await UserSheet.findOne({
            where: { sheetId, userId },
            include: [
                {
                    model: Sheet,
                    as: 'sheet',
                },
            ],
        });

        if (!userSheet) {
            return res.status(403).json({
                success: false,
                message: 'You do not have access to this sheet',
            });
        }

        // ─── FETCH ASSIGNMENTS (row/column/cell level) ───
        // Find all SheetAssignments for this user (by userId or by role)
        const assignments = await SheetAssignment.findAll({
            where: {
                sheetId,
                [Op.or]: [
                    { userId },
                    { assignedRole: userRole },
                ],
            },
        });

        // Aggregate all assigned rows, columns, and cells from all assignments
        let assignedRows = [];
        let assignedColumns = [];
        let assignedCells = [];
        let hasGranularAssignment = false; // true if any ROW/COLUMN/CELL assignment exists

        // Helper: safely parse JSONB fields that may come back as strings
        const safeArray = (val) => {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string') {
                try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; }
                catch { return []; }
            }
            return [];
        };

        assignments.forEach(a => {
            const type = a.assignmentType || 'SHEET';
            if (type === 'ROW') {
                hasGranularAssignment = true;
                assignedRows = [...assignedRows, ...safeArray(a.assignedRows)];
            }
            if (type === 'COLUMN') {
                hasGranularAssignment = true;
                assignedColumns = [...assignedColumns, ...safeArray(a.assignedColumns)];
            }
            if (type === 'CELL') {
                hasGranularAssignment = true;
                assignedCells = [...assignedCells, ...safeArray(a.assignedCells)];
            }
            // For SHEET type, no filtering — user sees everything
        });

        // Deduplicate
        assignedRows = [...new Set(assignedRows)];
        assignedColumns = [...new Set(assignedColumns)];
        assignedCells = [...new Set(assignedCells)];

        // Get all cell data for this sheet
        const cellData = await CellData.findAll({
            where: { sheetId },
        });

        // Get all cell permissions
        const cellPermissions = await CellPermission.findAll({
            where: { sheetId },
        });

        // Build permissions map for easy access
        const permissionsMap = {};
        cellPermissions.forEach(perm => {
            const canView =
                perm.canViewRoles.length === 0 ||
                perm.canViewRoles.includes(userRole) ||
                perm.canViewUsers.includes(userId);

            const canEdit =
                !perm.isLocked && (
                    perm.canEditRoles.length === 0 ||
                    perm.canEditRoles.includes(userRole) ||
                    perm.canEditUsers.includes(userId)
                );

            permissionsMap[perm.cellId] = {
                canView,
                canEdit,
                isLocked: perm.isLocked,
            };
        });

        res.json({
            success: true,
            userSheet,
            cellData,
            permissions: permissionsMap,
            // Assignment visibility data
            assignment: {
                hasGranularAssignment,
                assignedRows,       // e.g. [1, 2, 3] (1-based row numbers)
                assignedColumns,    // e.g. ["A", "B", "C"] (column letters)
                assignedCells,      // e.g. ["A1", "B3"] (specific cell IDs)
            },
        });
    } catch (error) {
        console.error('Error fetching sheet:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sheet',
            error: error.message,
        });
    }
});

// Update a cell value in user's assigned sheet
router.put('/my-sheets/:sheetId/cells/:cellId', authenticateToken, async (req, res) => {
    try {
        const { sheetId, cellId } = req.params;
        const { value } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Check if user has access to this sheet
        const userSheet = await UserSheet.findOne({
            where: { sheetId, userId },
        });

        if (!userSheet) {
            return res.status(403).json({
                success: false,
                message: 'You do not have access to this sheet',
            });
        }

        // Check cell permission
        const cellPermission = await CellPermission.findOne({
            where: { sheetId, cellId },
        });

        // Check if user can edit this cell
        if (cellPermission) {
            if (cellPermission.isLocked) {
                return res.status(403).json({
                    success: false,
                    message: 'This cell is locked and cannot be edited',
                });
            }

            const canEdit =
                cellPermission.canEditRoles.length === 0 ||
                cellPermission.canEditRoles.includes(userRole) ||
                cellPermission.canEditUsers.includes(userId);

            if (!canEdit) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to edit this cell',
                });
            }
        }

        // Update or create cell data
        let cell = await CellData.findOne({
            where: { sheetId, cellId },
        });

        if (cell) {
            await cell.update({
                value,
                lastModifiedById: userId,
            });
        } else {
            cell = await CellData.create({
                sheetId,
                cellId,
                value,
                dataType: 'TEXT',
                createdById: userId,
                lastModifiedById: userId,
            });
        }

        // Update user sheet status and track changes
        const cellChanges = userSheet.cellChanges || {};
        cellChanges[cellId] = {
            oldValue: cell.value,
            newValue: value,
            timestamp: new Date().toISOString(),
        };

        await userSheet.update({
            status: 'in_progress',
            lastModified: new Date(),
            cellChanges,
        });

        res.json({
            success: true,
            cell,
            message: 'Cell updated successfully',
        });
    } catch (error) {
        console.error('Error updating cell:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update cell',
            error: error.message,
        });
    }
});

// Submit user's changes for review
router.post('/my-sheets/:sheetId/submit', authenticateToken, async (req, res) => {
    try {
        const { sheetId } = req.params;
        const { notes } = req.body;
        const userId = req.user.id;

        const userSheet = await UserSheet.findOne({
            where: { sheetId, userId },
        });

        if (!userSheet) {
            return res.status(403).json({
                success: false,
                message: 'You do not have access to this sheet',
            });
        }

        await userSheet.update({
            status: 'submitted',
            submittedAt: new Date(),
            notes: notes || userSheet.notes,
        });

        res.json({
            success: true,
            userSheet,
            message: 'Changes submitted successfully',
        });
    } catch (error) {
        console.error('Error submitting changes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit changes',
            error: error.message,
        });
    }
});

// Update user sheet status
router.put('/my-sheets/:sheetId/status', authenticateToken, async (req, res) => {
    try {
        const { sheetId } = req.params;
        const { status } = req.body;
        const userId = req.user.id;

        const userSheet = await UserSheet.findOne({
            where: { sheetId, userId },
        });

        if (!userSheet) {
            return res.status(403).json({
                success: false,
                message: 'You do not have access to this sheet',
            });
        }

        await userSheet.update({ status });

        res.json({
            success: true,
            userSheet,
            message: 'Status updated successfully',
        });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update status',
            error: error.message,
        });
    }
});

module.exports = router;

