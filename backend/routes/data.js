// ================================================================
// CELL DATA ROUTES (routes/data.js)
// ================================================================
// PURPOSE: The CORE data endpoint — reading and writing cell values.
//
// This is what happens when a user types a value into a spreadsheet cell.
// It's the most heavily-used route in the entire application.
//
// ENDPOINTS:
//   GET  /api/data/:sheetId              — Get all cells for a sheet (with formula recalc)
//   PUT  /api/data/:sheetId/:cellId      — Update one cell (triggers formula recalc)
//   PATCH /api/data/:sheetId/:cellId/submit  — Submit cell for approval
//   PATCH /api/data/:sheetId/:cellId/approve — Approve/reject cell (L1_ADMIN, L2)
//   GET  /api/data/pending-approvals         — Get all cells waiting for approval
//   POST /api/data/bulk-update               — Update many cells at once
//   PUT  /api/data/:sheetId/lock-cells       — Lock cells (L1_ADMIN)
//   PUT  /api/data/:sheetId/unlock-cells     — Unlock cells (L1_ADMIN)
//   GET  /api/data/:sheetId/locked-cells     — Get all locked cells
//
// IMPORTANT: Cell updates trigger formula recalculation for the entire sheet.
// USES: services/FormulaService.js, services/formulaEngine.js
// ================================================================

const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { CellData, Sheet, User } = require('../models');
const { authenticateToken, authorizeRoles, checkSheetAccess } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const PermissionService = require('../services/PermissionService');
const FormulaEngine = require('../services/formulaEngine');
const logger = require('../utils/logger');
const { sequelize, dbRetry } = require('../config/database');

const router = express.Router();

// Get cell data for a sheet
router.get('/sheet/:sheetId',
  authenticateToken,
  async (req, res) => {
    try {
      const { sheetId } = req.params;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      // Check view permission via centralized service
      const canView = await PermissionService.canViewSheet(req.user, sheet);
      if (!canView) {
        return res.status(403).json({ message: 'No permission to view this sheet' });
      }

      const cellData = await CellData.findAll({
        where: { sheetId },
        include: [
          { association: 'creator', attributes: ['id', 'firstName', 'lastName'] },
          { association: 'lastModifier', attributes: ['id', 'firstName', 'lastName'] },
          { association: 'approver', attributes: ['id', 'firstName', 'lastName'] },
        ],
        order: [['rowIndex', 'ASC'], ['columnIndex', 'ASC']],
      });

      // If sheet has formulas, recalculate for display (read-only, no persist)
      let displayData = cellData.map(c => c.toJSON());
      try {
        const formulas = sheet.formulas || {};
        if (Object.keys(formulas).length > 0) {
          const cMap = {};
          displayData.forEach(cd => { cMap[cd.cellId] = { value: cd.value }; });
          const recalculated = FormulaEngine.recalculateSheet(formulas, cMap);
          displayData = displayData.map(cd => {
            if (recalculated[cd.cellId] && recalculated[cd.cellId].isCalculated) {
              return { ...cd, value: String(recalculated[cd.cellId].value), computedValue: recalculated[cd.cellId].value };
            }
            return cd;
          });
        }
      } catch (err) {
        logger.warn('Formula recalc on GET failed: ' + err.message);
      }

      res.json({ cellData: displayData });

    } catch (error) {
      logger.error('Get cell data error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ============================================================
// Update cell data — PRIMARY CELL SAVE ENDPOINT
// ============================================================
router.put('/cell',
  authenticateToken,
  [
    body('sheetId').isUUID(),
    body('cellId').notEmpty(),
    body('value').optional(),
    body('dataType').optional().isIn(['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'FILE', 'FORMULA']),
  ],
  auditLog('UPDATE_CELL_DATA', 'CELL_DATA'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sheetId, cellId, value, dataType } = req.body;

      // Get sheet
      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      // Check if sheet is locked
      if (sheet.status === 'LOCKED') {
        return res.status(403).json({ message: 'Sheet is locked and cannot be edited' });
      }

      // Check if the individual cell is locked
      const existingCell = await CellData.findOne({ where: { sheetId, cellId } });
      if (existingCell && existingCell.isLocked) {
        return res.status(403).json({ message: 'This cell is locked and cannot be edited' });
      }

      // Centralized permission check
      const canEdit = await PermissionService.canEditCell(req.user, { sheetId, cellId });
      if (!canEdit) {
        return res.status(403).json({ message: 'No permission to edit this cell' });
      }

      // Parse row/col from cellId (e.g. "A1" -> col=0, row=0)
      const match = cellId.match(/^([A-Z]+)(\d+)$/);
      const columnIndex = match ? match[1].charCodeAt(0) - 65 : 0;
      const rowIndex = match ? parseInt(match[2]) - 1 : 0;

      // Determine data type
      const isFormula = value && String(value).trim().startsWith('=');
      const effectiveDataType = isFormula ? 'FORMULA' : (dataType || 'TEXT');

      // Use transaction with retry wrapper for data consistency
      const result = await dbRetry(() => sequelize.transaction(async (tx) => {
        const cellDataValues = {
          value: value != null ? String(value) : null,
          numericValue: (effectiveDataType === 'NUMBER' && value) ? parseFloat(value) : null,
          dataType: effectiveDataType,
          status: 'DRAFT',
          lastModifiedById: req.user.id,
        };

        // Use findOrCreate to avoid race conditions
        const [cellData, created] = await CellData.findOrCreate({
          where: { sheetId, cellId },
          defaults: {
            sheetId,
            cellId,
            rowIndex,
            columnIndex,
            ...cellDataValues,
            createdById: req.user.id,
            version: 1,
          },
          transaction: tx,
        });

        if (!created) {
          // Record already existed — update it
          req.originalData = cellData.toJSON();
          await cellData.update({
            ...cellDataValues,
            version: cellData.version + 1,
          }, { transaction: tx });
        }

        // If formula, store in sheet.formulas JSON field
        if (isFormula) {
          const s = await Sheet.findByPk(sheetId, { transaction: tx });
          s.formulas = s.formulas || {};
          s.formulas[cellId] = value;
          s.changed('formulas', true);
          await s.save({ transaction: tx });
        }

        // Recalculate all formulas and persist results
        try {
          const sheetWithCells = await Sheet.findByPk(sheetId, {
            include: ['cellData'],
            transaction: tx,
          });
          const formulas = sheetWithCells.formulas || {};
          if (Object.keys(formulas).length > 0) {
            const cMap = {};
            sheetWithCells.cellData.forEach(cd => { cMap[cd.cellId] = { value: cd.value }; });
            const recalculated = FormulaEngine.recalculateSheet(formulas, cMap);

            for (const [cid, obj] of Object.entries(recalculated)) {
              if (!obj.isCalculated) continue;
              const existing = sheetWithCells.cellData.find(x => x.cellId === cid);
              if (existing) {
                existing.value = String(obj.value);
                const numeric = parseFloat(obj.value);
                if (!isNaN(numeric)) existing.numericValue = numeric;
                await existing.save({ transaction: tx });
              } else {
                const m = cid.match(/^([A-Z]+)(\d+)$/);
                const colIdx = m ? m[1].charCodeAt(0) - 65 : 0;
                const rowIdx = m ? parseInt(m[2]) - 1 : 0;
                await CellData.create({
                  sheetId, cellId: cid, value: String(obj.value),
                  dataType: 'FORMULA', rowIndex: rowIdx, columnIndex: colIdx,
                  createdById: req.user.id, lastModifiedById: req.user.id,
                }, { transaction: tx });
              }
            }
          }
        } catch (err) {
          logger.warn('Formula recalculation during cell update: ' + err.message);
        }

        return cellData;
      }), { retries: 3, baseDelay: 300 });

      // Fetch updated data with associations
      const updatedCellData = await CellData.findByPk(result.id, {
        include: [
          { association: 'creator', attributes: ['id', 'firstName', 'lastName'] },
          { association: 'lastModifier', attributes: ['id', 'firstName', 'lastName'] },
        ],
      });

      // Emit real-time update via Socket.io
      if (req.io) {
        req.io.to(`sheet_${sheetId}`).emit('cell_updated', {
          sheetId, cellId, value, dataType: effectiveDataType,
          userId: req.user.id,
          userName: `${req.user.firstName} ${req.user.lastName}`,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        message: 'Cell data updated successfully',
        cellData: updatedCellData,
      });

    } catch (error) {
      logger.error('Update cell data error:', error);
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// Submit cell for approval
router.patch('/cell/:id/submit',
  authenticateToken,
  auditLog('SUBMIT_CELL_DATA', 'CELL_DATA'),
  async (req, res) => {
    try {
      const cellData = await CellData.findByPk(req.params.id);
      if (!cellData) {
        return res.status(404).json({ message: 'Cell data not found' });
      }

      if (cellData.createdById !== req.user.id && !['L1_ADMIN', 'L2_SENIOR_ENGINEER'].includes(req.user.role)) {
        return res.status(403).json({ message: 'No permission to submit this cell data' });
      }

      if (cellData.status !== 'DRAFT') {
        return res.status(400).json({ message: 'Cell data is not in draft status' });
      }

      await cellData.update({ status: 'SUBMITTED', lastModifiedById: req.user.id });
      res.json({ message: 'Cell data submitted for approval', cellData });
    } catch (error) {
      logger.error('Submit cell data error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Approve/Reject cell data
router.patch('/cell/:id/approve',
  authenticateToken,
  [
    body('action').isIn(['approve', 'reject']),
    body('comments').optional().trim(),
  ],
  auditLog('APPROVE_CELL_DATA', 'CELL_DATA'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!['L1_ADMIN', 'L2_SENIOR_ENGINEER'].includes(req.user.role)) {
        return res.status(403).json({ message: 'No permission to approve cell data' });
      }

      const cellData = await CellData.findByPk(req.params.id);
      if (!cellData) {
        return res.status(404).json({ message: 'Cell data not found' });
      }

      if (cellData.status !== 'SUBMITTED') {
        return res.status(400).json({ message: 'Cell data is not submitted for approval' });
      }

      const { action, comments } = req.body;
      const updateData = {
        status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        lastModifiedById: req.user.id,
        metadata: { ...cellData.metadata, approvalComments: comments },
      };

      if (action === 'approve') {
        updateData.approvedById = req.user.id;
        updateData.approvedAt = new Date();
      }

      await cellData.update(updateData);
      res.json({ message: `Cell data ${action}d successfully`, cellData });
    } catch (error) {
      logger.error('Approve cell data error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get pending approvals
router.get('/pending-approvals',
  authenticateToken,
  async (req, res) => {
    try {
      if (!['L1_ADMIN', 'L2_SENIOR_ENGINEER'].includes(req.user.role)) {
        return res.status(403).json({ message: 'No permission to view pending approvals' });
      }

      const pendingData = await CellData.findAll({
        where: { status: 'SUBMITTED' },
        include: [
          { association: 'sheet', attributes: ['id', 'name', 'projectId'], include: [{ association: 'project', attributes: ['id', 'name'] }] },
          { association: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] },
        ],
        order: [['createdAt', 'ASC']],
      });

      res.json({ pendingApprovals: pendingData });
    } catch (error) {
      logger.error('Get pending approvals error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Bulk update cell data
router.post('/bulk-update',
  authenticateToken,
  [
    body('sheetId').isUUID(),
    body('cells').isArray().notEmpty(),
    body('cells.*.cellId').notEmpty(),
    body('cells.*.value').optional(),
  ],
  auditLog('BULK_UPDATE_CELLS', 'CELL_DATA'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { sheetId, cells } = req.body;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      if (sheet.status === 'LOCKED') {
        return res.status(403).json({ success: false, message: 'Sheet is locked' });
      }

      const canEditSheet = await PermissionService.canEditSheet(req.user, sheet);
      if (!canEditSheet) {
        return res.status(403).json({ success: false, message: 'No permission to edit this sheet' });
      }

      const updatedCells = [];
      const failedCells = [];

      await sequelize.transaction(async (tx) => {
        for (const cellUpdate of cells) {
          try {
            const { cellId, value, dataType } = cellUpdate;
            const canEdit = await PermissionService.canEditCell(req.user, { sheetId, cellId });
            if (!canEdit) {
              failedCells.push({ cellId, error: 'No permission' });
              continue;
            }

            // Check if cell is locked
            const existingLocked = await CellData.findOne({ where: { sheetId, cellId }, transaction: tx });
            if (existingLocked && existingLocked.isLocked) {
              failedCells.push({ cellId, error: 'Cell is locked' });
              continue;
            }

            const match = cellId.match(/^([A-Z]+)(\d+)$/);
            const columnIndex = match ? match[1].charCodeAt(0) - 65 : 0;
            const rowIndex = match ? parseInt(match[2]) - 1 : 0;

            let cellData = await CellData.findOne({ where: { sheetId, cellId }, transaction: tx });
            const vals = {
              value: value != null ? String(value) : null,
              numericValue: (dataType === 'NUMBER' && value) ? parseFloat(value) : null,
              dataType: dataType || 'TEXT',
              status: 'DRAFT',
              lastModifiedById: req.user.id,
            };

            if (cellData) {
              await cellData.update({ ...vals, version: cellData.version + 1 }, { transaction: tx });
            } else {
              await CellData.create({ sheetId, cellId, rowIndex, columnIndex, ...vals, createdById: req.user.id, version: 1 }, { transaction: tx });
            }
            updatedCells.push({ cellId, success: true });
          } catch (cellError) {
            failedCells.push({ cellId: cellUpdate.cellId, error: cellError.message });
          }
        }
      });

      if (req.io) {
        req.io.to(`sheet_${sheetId}`).emit('bulk_cells_updated', {
          sheetId, updatedCells, userId: req.user.id, timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        message: `Bulk update: ${updatedCells.length} succeeded, ${failedCells.length} failed`,
        updatedCells, failedCells,
        summary: { total: cells.length, succeeded: updatedCells.length, failed: failedCells.length },
      });
    } catch (error) {
      logger.error('Bulk update error:', error);
      res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
  }
);

// ============================================================
// Lock / Unlock cells — Admin only
// ============================================================
router.put('/cell/lock',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('sheetId').isUUID(),
    body('cellIds').isArray().notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sheetId, cellIds } = req.body;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      const locked = [];
      const failed = [];

      await sequelize.transaction(async (tx) => {
        for (const cellId of cellIds) {
          try {
            const [cellData, created] = await CellData.findOrCreate({
              where: { sheetId, cellId },
              defaults: {
                sheetId,
                cellId,
                rowIndex: (() => { const m = cellId.match(/^([A-Z]+)(\d+)$/); return m ? parseInt(m[2]) - 1 : 0; })(),
                columnIndex: (() => { const m = cellId.match(/^([A-Z]+)(\d+)$/); return m ? m[1].charCodeAt(0) - 65 : 0; })(),
                value: null,
                dataType: 'TEXT',
                status: 'DRAFT',
                isLocked: true,
                lockedById: req.user.id,
                lockedAt: new Date(),
                createdById: req.user.id,
                version: 1,
              },
              transaction: tx,
            });

            if (!created) {
              await cellData.update({
                isLocked: true,
                lockedById: req.user.id,
                lockedAt: new Date(),
              }, { transaction: tx });
            }

            locked.push(cellId);
          } catch (err) {
            failed.push({ cellId, error: err.message });
          }
        }
      });

      // Emit real-time lock update
      if (req.io) {
        req.io.to(`sheet_${sheetId}`).emit('cells_locked', {
          sheetId,
          cellIds: locked,
          lockedBy: { id: req.user.id, name: `${req.user.firstName} ${req.user.lastName}` },
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        message: `${locked.length} cell(s) locked`,
        locked,
        failed,
      });
    } catch (error) {
      logger.error('Lock cells error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.put('/cell/unlock',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('sheetId').isUUID(),
    body('cellIds').isArray().notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sheetId, cellIds } = req.body;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      const unlocked = [];
      const failed = [];

      await sequelize.transaction(async (tx) => {
        for (const cellId of cellIds) {
          try {
            const cellData = await CellData.findOne({ where: { sheetId, cellId }, transaction: tx });
            if (cellData && cellData.isLocked) {
              await cellData.update({
                isLocked: false,
                lockedById: null,
                lockedAt: null,
              }, { transaction: tx });
              unlocked.push(cellId);
            } else {
              failed.push({ cellId, error: 'Cell not found or not locked' });
            }
          } catch (err) {
            failed.push({ cellId, error: err.message });
          }
        }
      });

      // Emit real-time unlock update
      if (req.io) {
        req.io.to(`sheet_${sheetId}`).emit('cells_unlocked', {
          sheetId,
          cellIds: unlocked,
          unlockedBy: { id: req.user.id, name: `${req.user.firstName} ${req.user.lastName}` },
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        message: `${unlocked.length} cell(s) unlocked`,
        unlocked,
        failed,
      });
    } catch (error) {
      logger.error('Unlock cells error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get locked cells for a sheet
router.get('/sheet/:sheetId/locked-cells',
  authenticateToken,
  async (req, res) => {
    try {
      const { sheetId } = req.params;
      const lockedCells = await CellData.findAll({
        where: { sheetId, isLocked: true },
        attributes: ['cellId', 'value', 'isLocked', 'lockedAt', 'lockedById', 'rowIndex', 'columnIndex'],
        include: [
          { model: User, as: 'lockedBy', attributes: ['id', 'firstName', 'lastName'] },
        ],
      });

      res.json({ lockedCells });
    } catch (error) {
      logger.error('Get locked cells error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

module.exports = router;
