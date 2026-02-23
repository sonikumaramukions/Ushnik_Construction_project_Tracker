// ================================================================
// CELL PERMISSION MIDDLEWARE (middleware/cellPermission.js)
// ================================================================
// PURPOSE: Controls WHO can VIEW or EDIT specific cells in a sheet.
//
// WHY CELL-LEVEL PERMISSIONS?
//   In a construction project, different people should see different data:
//   - A Site Engineer might only edit cells in their assigned columns
//   - A Ground Manager might only see cells related to their site
//   - An Admin can see and edit everything
//
// HOW IT WORKS:
//   This middleware runs BEFORE the route handler.
//   It checks: "Does this user have permission to VIEW/EDIT this cell?"
//   If YES → continue to the route handler
//   If NO  → return 403 Forbidden
//
// USED IN: routes/data.js (cell update), routes/cellPermissions.js
// ================================================================

const CellPermissionService = require('../services/CellPermissionService');
const logger = require('../utils/logger');

// ============================================================
// checkCellPermission — Verify user can view/edit ONE cell
// ============================================================
// Usage: router.put('/cell', authenticateToken, checkCellPermission('edit'), handler)
// The 'action' parameter is either 'view' or 'edit'
const checkCellPermission = (action) => {
    return async (req, res, next) => {
        try {
            const { sheetId, cellId } = req.body || req.params;
            const userId = req.user.id;
            const role = req.user.role;

            if (!sheetId || !cellId) {
                return res.status(400).json({
                    message: 'sheetId and cellId are required'
                });
            }

            const permissionCheck = await CellPermissionService.checkCellPermission(
                sheetId,
                cellId,
                userId,
                role,
                action
            );

            if (!permissionCheck.hasPermission) {
                logger.warn(`Cell permission denied: ${permissionCheck.reason} for user ${userId} on cell ${cellId}`);
                return res.status(403).json({
                    message: `You do not have permission to ${action} this cell`,
                    reason: permissionCheck.reason,
                });
            }

            // Attach permission info to request
            req.cellPermission = permissionCheck;
            next();
        } catch (error) {
            logger.error('Cell permission check error:', error);
            return res.status(500).json({ message: 'Error checking cell permissions' });
        }
    };
};

// ============================================================
// checkBulkCellPermissions — Verify user can view/edit MULTIPLE cells at once
// ============================================================
// Used when saving multiple cells in one request (bulk update).
// If ANY cell is denied, the entire request is rejected with a list of denied cells.
// This is more efficient than checking one cell at a time.
const checkBulkCellPermissions = (action) => {
    return async (req, res, next) => {
        try {
            const { sheetId, cells } = req.body;
            const userId = req.user.id;
            const role = req.user.role;

            if (!sheetId || !cells || !Array.isArray(cells)) {
                return res.status(400).json({
                    message: 'sheetId and cells array are required'
                });
            }

            const cellIds = cells.map(c => c.cellId);
            const permissionChecks = await CellPermissionService.bulkCheckPermissions(
                sheetId,
                cellIds,
                userId,
                role,
                action
            );

            // Filter out cells without permission
            const deniedCells = permissionChecks.filter(p => !p.hasPermission);

            if (deniedCells.length > 0) {
                logger.warn(`Bulk cell permission denied for ${deniedCells.length} cells for user ${userId}`);
                return res.status(403).json({
                    message: `You do not have permission to ${action} some cells`,
                    deniedCells: deniedCells.map(c => ({ cellId: c.cellId, reason: c.reason })),
                });
            }

            // Attach permission info to request
            req.cellPermissions = permissionChecks;
            next();
        } catch (error) {
            logger.error('Bulk cell permission check error:', error);
            return res.status(500).json({ message: 'Error checking cell permissions' });
        }
    };
};

module.exports = {
    checkCellPermission,
    checkBulkCellPermissions,
};
