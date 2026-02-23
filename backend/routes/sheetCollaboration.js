// ================================================================
// SHEET COLLABORATION ROUTES (routes/sheetCollaboration.js)
// ================================================================
// PURPOSE: Real-time sheet collaboration via Socket.io.
//
// This handles the LIVE collaboration features:
//   - Pushing sheets to roles (with real-time Socket.io notification)
//   - Broadcasting updates to all collaborators instantly
//   - Cell-level push updates
//   - Dashboard sync
//   - Offline sync support
//
// ENDPOINTS:
//   POST /api/sheet-collaboration/:sheetId/push-to-roles  — Push to roles (real-time)
//   POST /api/sheet-collaboration/:sheetId/broadcast      — Broadcast update to all
//   POST /api/sheet-collaboration/:sheetId/push-cell      — Push cell update
//   DELETE /api/sheet-collaboration/:sheetId/role/:role   — Remove role collaboration
//   GET  /api/sheet-collaboration/:sheetId/collaborators  — List collaborators
//   POST /api/sheet-collaboration/:sheetId/sync-dashboard — Sync to dashboard
//   POST /api/sheet-collaboration/:sheetId/offline-sync   — Enable offline sync
//
// USES: services/SheetCollaborationService.js, Socket.io
// ================================================================

const express = require('express');
const router = express.Router();
const SheetCollaborationService = require('../services/SheetCollaborationService');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

/**
 * Sheet Collaboration Routes
 */

/**
 * Push sheet to collaborate with roles
 * POST /api/sheets/:sheetId/push-collaborate
 */
router.post('/:sheetId/push-collaborate',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'PROJECT_MANAGER']),
    auditLog('PUSH_SHEET_COLLABORATE', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId } = req.params;
            const { rolesToShare } = req.body;

            if (!rolesToShare || !Array.isArray(rolesToShare) || rolesToShare.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'rolesToShare array is required with at least one role'
                });
            }

            const io = req.io;
            const result = await SheetCollaborationService.pushSheetToRoles(
                sheetId,
                rolesToShare,
                req.user.id,
                io
            );

            res.status(200).json({
                success: true,
                message: result.message,
                data: result
            });

        } catch (error) {
            logger.error('Error pushing sheet:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to push sheet for collaboration',
                error: error.message
            });
        }
    }
);

/**
 * Broadcast sheet update to collaborators
 * POST /api/sheets/:sheetId/broadcast-update
 */
router.post('/:sheetId/broadcast-update',
    authenticateToken,
    auditLog('BROADCAST_SHEET_UPDATE', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId } = req.params;
            const updateData = req.body;

            const io = req.io;
            await SheetCollaborationService.broadcastSheetUpdate(sheetId, updateData, io);

            res.status(200).json({
                success: true,
                message: 'Update broadcasted to all collaborators'
            });

        } catch (error) {
            logger.error('Error broadcasting update:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to broadcast update',
                error: error.message
            });
        }
    }
);

/**
 * Push cell update to collaborators
 * POST /api/sheets/:sheetId/push-cell-update
 */
router.post('/:sheetId/push-cell-update',
    authenticateToken,
    auditLog('PUSH_CELL_UPDATE', 'CELL'),
    async (req, res) => {
        try {
            const { sheetId } = req.params;
            const { cellId, cellData } = req.body;

            if (!cellId || !cellData) {
                return res.status(400).json({
                    success: false,
                    message: 'cellId and cellData are required'
                });
            }

            const io = req.io;
            await SheetCollaborationService.pushCellUpdate(sheetId, cellId, cellData, io);

            res.status(200).json({
                success: true,
                message: 'Cell update pushed to collaborators'
            });

        } catch (error) {
            logger.error('Error pushing cell update:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to push cell update',
                error: error.message
            });
        }
    }
);

/**
 * Remove role collaboration from sheet
 * DELETE /api/sheets/:sheetId/collaboration/:role
 */
router.delete('/:sheetId/collaboration/:role',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'L2_SENIOR_ENGINEER']),
    auditLog('REMOVE_COLLABORATION', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId, role } = req.params;

            const result = await SheetCollaborationService.removeRoleCollaboration(sheetId, role);

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Error removing collaboration:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove collaboration',
                error: error.message
            });
        }
    }
);

/**
 * Get sheet collaborators
 * GET /api/sheets/:sheetId/collaborators
 */
router.get('/:sheetId/collaborators',
    authenticateToken,
    async (req, res) => {
        try {
            const { sheetId } = req.params;

            const collaborators = await SheetCollaborationService.getSheetCollaborators(sheetId);

            res.status(200).json({
                success: true,
                data: collaborators
            });

        } catch (error) {
            logger.error('Error fetching collaborators:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch collaborators',
                error: error.message
            });
        }
    }
);

/**
 * Sync sheet to user dashboard
 * POST /api/sheets/:sheetId/sync-dashboard/:role
 */
router.post('/:sheetId/sync-dashboard/:role',
    authenticateToken,
    authorizeRole(['L1_ADMIN']),
    auditLog('SYNC_SHEET_DASHBOARD', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId, role } = req.params;

            const io = req.io;
            await SheetCollaborationService.syncSheetToDashboard(sheetId, role, io);

            res.status(200).json({
                success: true,
                message: `Sheet synced to dashboard for role: ${role}`
            });

        } catch (error) {
            logger.error('Error syncing to dashboard:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to sync to dashboard',
                error: error.message
            });
        }
    }
);

/**
 * Enable offline sync for a sheet
 * POST /api/sheets/:sheetId/offline-sync/:role
 */
router.post('/:sheetId/offline-sync/:role',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'L2_SENIOR_ENGINEER']),
    auditLog('ENABLE_OFFLINE_SYNC', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId, role } = req.params;

            const result = await SheetCollaborationService.enableOfflineSync(sheetId, role);

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Error enabling offline sync:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to enable offline sync',
                error: error.message
            });
        }
    }
);

module.exports = router;
