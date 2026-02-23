// ================================================================
// SHEET ROUTES (routes/sheets.js) — THE LARGEST ROUTE FILE (1400+ lines)
// ================================================================
// PURPOSE: Full sheet lifecycle — create, edit, push, sync, lock, formulas.
//
// This is the HEART of the application. Sheets are Excel-like spreadsheets
// that the admin creates, pushes to users, and users fill in.
//
// SHEET CRUD:
//   GET  /api/sheets/project/:projectId  — Get sheets for a project
//   GET  /api/sheets/:id                 — Get sheet with all data
//   POST /api/sheets/                    — Create a new sheet
//   PUT  /api/sheets/:id                 — Update sheet structure
//   DELETE /api/sheets/:id               — Delete a sheet
//
// ROW & COLUMN MANAGEMENT (Excel-like):
//   POST /api/sheets/:id/rows            — Add rows
//   DELETE /api/sheets/:id/rows          — Remove rows
//   POST /api/sheets/:id/columns         — Add columns
//   DELETE /api/sheets/:id/columns       — Remove columns
//
// CELL UPDATES:
//   POST /api/sheets/:id/cells           — Update a cell (with formula recalc)
//   POST /api/sheets/:id/edit-log        — Save cell edit audit log
//   GET  /api/sheets/:id/edit-log        — Get cell edit history
//
// PUSH & SYNC (task system):
//   POST /api/sheets/:id/push            — Push sheet to roles
//   POST /api/sheets/:id/push-to-users   — Push to specific users
//   POST /api/sheets/:id/sync            — Sync changes back to admin
//   GET  /api/sheets/my/sheets           — Get sheets assigned to me
//
// LOCK & FORMULAS:
//   PATCH /api/sheets/:id/lock           — Lock/unlock the entire sheet
//   POST /api/sheets/:id/formulas        — Set a formula
//   GET  /api/sheets/:id/formulas        — Get all formulas
//   DELETE /api/sheets/:id/formulas/:cellId — Remove a formula
//   POST /api/sheets/:id/formulas/calculate — Calculate a formula
// ================================================================

const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Sheet, Project, UserSheet, CellData } = require('../models');
const { authenticateToken, authorizeRoles, checkSheetAccess } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');
const FormulaEngine = require('../services/formulaEngine');
const PermissionService = require('../services/PermissionService');

const router = express.Router();

// ─── GET ALL SHEETS (Admin only) ───
// Returns all sheets for the sheet management list view
router.get('/',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'CEO'),
  async (req, res) => {
    try {
      const sheets = await Sheet.findAll({
        include: [{ model: Project, as: 'project', attributes: ['id', 'name'] }],
        order: [['updatedAt', 'DESC']],
      });
      res.json({ success: true, sheets });
    } catch (error) {
      logger.error('Get all sheets error:', error);
      res.status(500).json({ success: false, message: 'Failed to load sheets', error: error.message });
    }
  }
);

// Get sheets by project ID
router.get('/project/:projectId',
  authenticateToken,
  [
    query('status').optional().isIn(['DRAFT', 'ACTIVE', 'LOCKED', 'ARCHIVED']),
  ],
  async (req, res) => {
    try {
      const { projectId } = req.params;

      const where = { projectId };
      if (req.query.status) where.status = req.query.status;

      const sheets = await Sheet.findAll({
        where,
        include: [
          {
            association: 'creator',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            association: 'project',
            attributes: ['id', 'name'],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Filter sheets based on user permissions
      // Admin always sees everything
      if (req.user.role === 'L1_ADMIN') {
        return res.json({ sheets });
      }

      // For other roles, check permissions + explicit assignment
      const { UserSheet: US, SheetAssignment: SA } = require('../models');
      const userSheetIds = (await US.findAll({
        where: { userId: req.user.id },
        attributes: ['sheetId'],
      })).map(us => us.sheetId);
      const assignedSheetIds = (await SA.findAll({
        where: {
          [require('sequelize').Op.or]: [
            { userId: req.user.id },
            { assignedRole: req.user.role },
          ],
        },
        attributes: ['sheetId'],
      })).map(sa => sa.sheetId);
      const accessSet = new Set([...userSheetIds, ...assignedSheetIds]);

      const filteredSheets = sheets.filter(sheet => {
        // Check role permission on sheet
        const perm = sheet.permissions && sheet.permissions[req.user.role];
        if (perm && perm.canView) return true;
        // Check explicit assignment
        return accessSet.has(sheet.id);
      });

      res.json({ sheets: filteredSheets });

    } catch (error) {
      logger.error('Get project sheets error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get sheet by ID
router.get('/:id',
  authenticateToken,
  checkSheetAccess,
  auditLog('VIEW_SHEET', 'SHEET'),
  async (req, res) => {
    try {
      const sheet = await Sheet.findByPk(req.params.id, {
        include: [
          {
            association: 'project',
            attributes: ['id', 'name', 'status'],
          },
          {
            association: 'creator',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            association: 'lastModifier',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            association: 'cellData',
            attributes: ['id', 'cellId', 'value', 'numericValue', 'dataType', 'status', 'createdAt', 'updatedAt'],
            include: [
              {
                association: 'creator',
                attributes: ['id', 'firstName', 'lastName'],
              },
            ],
          },
        ],
      });

      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      // Build a map of cellData keyed by cellId for easy lookup
      const cellMap = {};
      for (const c of sheet.cellData) {
        cellMap[c.cellId] = c.toJSON ? c.toJSON() : c;
      }

      // Apply permissions: prefer explicit cell-level permissions defined in structure, but
      // if a cell exists in DB but not in structure, include it (don't drop user data).
      const userRole = req.user.role;
      const filteredCellData = sheet.cellData.filter(cellData => {
        const cellDef = sheet.structure && sheet.structure.cells ? sheet.structure.cells[cellData.cellId] : null;
        if (!cellDef) {
          // No explicit structure definition: allow if user can view the sheet generally
          return true;
        }

        // If explicit cannotSee exists deny
        if (cellDef.permissions && cellDef.permissions.cannotSee && cellDef.permissions.cannotSee.includes(userRole)) {
          return false;
        }

        // If explicit canView is provided, ensure role is included
        if (cellDef.permissions && cellDef.permissions.canView) {
          return cellDef.permissions.canView.includes(userRole);
        }

        // Fallback to sheet-level permissions
        return (sheet.permissions && sheet.permissions[userRole] && sheet.permissions[userRole].canView) || false;
      });

      // If there are formulas defined on sheet, try a local recalculation to reflect computed values
      try {
        if (sheet.formulas && Object.keys(sheet.formulas).length > 0) {
          const inputMap = {};
          Object.entries(cellMap).forEach(([cellId, c]) => {
            inputMap[cellId] = c.value;
          });

          const calculated = FormulaEngine.recalculateSheet(sheet.formulas, Object.fromEntries(Object.entries(cellMap).map(([k, v]) => [k, { value: v.value }] )));

          // Apply calculated values back into filteredCellData for response (do NOT persist here)
          filteredCellData.forEach(cd => {
            if (calculated && calculated[cd.cellId] && calculated[cd.cellId].value !== undefined) {
              cd.value = calculated[cd.cellId].value;
            }
          });
        }
      } catch (err) {
        logger.warn('Formula recalculation on sheet fetch failed: ' + err.message);
      }

      const responseSheet = {
        ...sheet.toJSON(),
        cellData: filteredCellData,
        userPermissions: req.userPermissions,
      };

      res.json({ sheet: responseSheet });

    } catch (error) {
      logger.error('Get sheet error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Create sheet (Admin only)
router.post('/',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('name').notEmpty().trim().isLength({ min: 3, max: 255 }),
    body('description').optional().trim(),
    body('projectId').isUUID(),
    body('isTemplate').optional().isBoolean(),
    body('templateId').optional().isUUID(),
    body('structure').optional().isObject(),
  ],
  auditLog('CREATE_SHEET', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Verify project exists
      const project = await Project.findByPk(req.body.projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      let sheetData = {
        name: req.body.name,
        description: req.body.description,
        projectId: req.body.projectId,
        isTemplate: req.body.isTemplate || false,
        createdById: req.user.id,
        structure: req.body.structure || {
          columns: [],
          rows: [],
          cells: {},
        },
        permissions: getDefaultPermissions(),
        validationRules: {},
        status: 'DRAFT',
        version: 1,
      };

      // If creating from template, copy structure
      if (req.body.templateId) {
        const template = await Sheet.findByPk(req.body.templateId);
        if (template) {
          sheetData.structure = template.structure;
          sheetData.permissions = template.permissions;
          sheetData.validationRules = template.validationRules;
          sheetData.templateId = req.body.templateId;
        }
      }

      const sheet = await Sheet.create(sheetData);

      // Fetch created sheet with associations
      const createdSheet = await Sheet.findByPk(sheet.id, {
        include: [
          {
            association: 'project',
            attributes: ['id', 'name'],
          },
          {
            association: 'creator',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
        ],
      });

      res.status(201).json({
        message: 'Sheet created successfully',
        sheet: createdSheet,
      });

    } catch (error) {
      logger.error('Create sheet error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Update sheet metadata (permissions, name, description, status)
router.put('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER'),
  checkSheetAccess,
  async (req, res) => {
    try {
      const sheet = await Sheet.findByPk(req.params.id);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      const { name, description, status, permissions } = req.body;
      const updates = {};

      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      if (permissions !== undefined) {
        updates.permissions = permissions;
        // Mark JSONB field as changed
        sheet.changed('permissions', true);
      }

      await sheet.update(updates);

      logger.info(`Sheet ${req.params.id} updated by user ${req.user.id}: ${Object.keys(updates).join(', ')}`);

      res.json({
        success: true,
        message: 'Sheet updated successfully',
        sheet,
      });
    } catch (error) {
      logger.error('Update sheet error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Update sheet structure (Admin only)
router.put('/:id/structure',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  checkSheetAccess,
  [
    body('structure').isObject(),
    body('permissions').optional().isObject(),
    body('validationRules').optional().isObject(),
  ],
  auditLog('UPDATE_SHEET_STRUCTURE', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const sheet = req.sheet;

      // Store original data for audit
      req.originalData = {
        structure: sheet.structure,
        permissions: sheet.permissions,
        validationRules: sheet.validationRules,
      };

      // Update sheet structure
      const updateData = {
        structure: req.body.structure,
        version: sheet.version + 1,
        lastModifiedById: req.user.id,
      };

      if (req.body.permissions) {
        updateData.permissions = req.body.permissions;
      }

      if (req.body.validationRules) {
        updateData.validationRules = req.body.validationRules;
      }

      await sheet.update(updateData);

      res.json({
        message: 'Sheet structure updated successfully',
        sheet,
      });

    } catch (error) {
      logger.error('Update sheet structure error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ==========================================
// Dynamic Row/Column Management (Excel-like)
// ==========================================

// Add rows at end or insert at position
router.post('/:id/rows',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  checkSheetAccess,
  [
    body('count').optional().isInt({ min: 1, max: 100 }).toInt(),
    body('position').optional().isInt({ min: 0 }).toInt(),
  ],
  async (req, res) => {
    try {
      const sheet = req.sheet;
      const count = req.body.count || 1;
      const position = req.body.position; // undefined = append at end
      const structure = sheet.structure || { rows: 0, cols: 5, columns: [] };

      const currentRows = typeof structure.rows === 'number' ? structure.rows : 10;
      const newRows = currentRows + count;

      // If inserting at a position, shift existing cell data
      if (position !== undefined && position < currentRows) {
        const { CellData } = require('../models');
        const { sequelize: sq } = require('../config/database');
        
        await sq.transaction(async (tx) => {
          // Shift cells down: rows >= position get row += count
          const cellsToShift = await CellData.findAll({
            where: { sheetId: sheet.id, rowIndex: { [require('sequelize').Op.gte]: position } },
            order: [['rowIndex', 'DESC']], // process from bottom up to avoid conflicts
            transaction: tx,
          });
          for (const cell of cellsToShift) {
            const newRowIdx = cell.rowIndex + count;
            const colLetter = String.fromCharCode(65 + cell.columnIndex);
            const newCellId = `${colLetter}${newRowIdx + 1}`;
            await cell.update({ rowIndex: newRowIdx, cellId: newCellId }, { transaction: tx });
          }
        });
      }

      structure.rows = newRows;
      sheet.changed('structure', true);
      await sheet.update({ structure, version: sheet.version + 1, lastModifiedById: req.user.id });

      res.json({
        success: true,
        message: `${count} row(s) ${position !== undefined ? 'inserted at position ' + position : 'added'}`,
        sheet: { id: sheet.id, structure: sheet.structure },
      });
    } catch (error) {
      logger.error('Add rows error:', error);
      res.status(500).json({ message: 'Failed to add rows', error: error.message });
    }
  }
);

// Remove rows (from end or at specific position)
router.delete('/:id/rows',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  checkSheetAccess,
  async (req, res) => {
    try {
      const sheet = req.sheet;
      const count = parseInt(req.query.count) || 1;
      const position = req.query.position !== undefined ? parseInt(req.query.position) : undefined;
      const structure = sheet.structure || { rows: 10, cols: 5, columns: [] };
      const currentRows = typeof structure.rows === 'number' ? structure.rows : 10;

      if (count >= currentRows) {
        return res.status(400).json({ message: 'Cannot remove all rows' });
      }

      const { CellData } = require('../models');
      const { sequelize: sq } = require('../config/database');
      const { Op } = require('sequelize');

      await sq.transaction(async (tx) => {
        if (position !== undefined) {
          // Remove specific rows and shift cells up
          const deleteFrom = position;
          const deleteTo = position + count - 1;

          await CellData.destroy({
            where: {
              sheetId: sheet.id,
              rowIndex: { [Op.between]: [deleteFrom, deleteTo] },
            },
            transaction: tx,
          });

          // Shift rows above the deleted range down
          const cellsToShift = await CellData.findAll({
            where: { sheetId: sheet.id, rowIndex: { [Op.gt]: deleteTo } },
            order: [['rowIndex', 'ASC']],
            transaction: tx,
          });
          for (const cell of cellsToShift) {
            const newRowIdx = cell.rowIndex - count;
            const colLetter = String.fromCharCode(65 + cell.columnIndex);
            const newCellId = `${colLetter}${newRowIdx + 1}`;
            await cell.update({ rowIndex: newRowIdx, cellId: newCellId }, { transaction: tx });
          }
        } else {
          // Remove from end
          await CellData.destroy({
            where: {
              sheetId: sheet.id,
              rowIndex: { [Op.gte]: currentRows - count },
            },
            transaction: tx,
          });
        }
      });

      structure.rows = currentRows - count;
      sheet.changed('structure', true);
      await sheet.update({ structure, version: sheet.version + 1, lastModifiedById: req.user.id });

      res.json({
        success: true,
        message: `${count} row(s) removed`,
        sheet: { id: sheet.id, structure: sheet.structure },
      });
    } catch (error) {
      logger.error('Remove rows error:', error);
      res.status(500).json({ message: 'Failed to remove rows', error: error.message });
    }
  }
);

// Add columns at end or insert at position
router.post('/:id/columns',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  checkSheetAccess,
  [
    body('count').optional().isInt({ min: 1, max: 26 }).toInt(),
    body('position').optional().isInt({ min: 0 }).toInt(),
  ],
  async (req, res) => {
    try {
      const sheet = req.sheet;
      const count = req.body.count || 1;
      const position = req.body.position;
      const structure = sheet.structure || { rows: 10, cols: 5, columns: [] };
      const currentCols = typeof structure.cols === 'number' ? structure.cols : (structure.columns?.length || 5);

      if (currentCols + count > 26) {
        return res.status(400).json({ message: 'Maximum 26 columns (A-Z) supported' });
      }

      // If inserting at position, shift cell data
      if (position !== undefined && position < currentCols) {
        const { CellData } = require('../models');
        const { sequelize: sq } = require('../config/database');

        await sq.transaction(async (tx) => {
          const cellsToShift = await CellData.findAll({
            where: { sheetId: sheet.id, columnIndex: { [require('sequelize').Op.gte]: position } },
            order: [['columnIndex', 'DESC']],
            transaction: tx,
          });
          for (const cell of cellsToShift) {
            const newColIdx = cell.columnIndex + count;
            const colLetter = String.fromCharCode(65 + newColIdx);
            const newCellId = `${colLetter}${cell.rowIndex + 1}`;
            await cell.update({ columnIndex: newColIdx, cellId: newCellId }, { transaction: tx });
          }
        });
      }

      const newCols = currentCols + count;
      structure.cols = newCols;
      // Update columns array if it exists
      if (Array.isArray(structure.columns)) {
        for (let i = 0; i < count; i++) {
          const idx = position !== undefined ? position + i : structure.columns.length;
          const letter = String.fromCharCode(65 + (currentCols + i));
          const colDef = { id: letter, name: `Column ${letter}`, type: 'text' };
          if (position !== undefined) {
            structure.columns.splice(idx, 0, colDef);
          } else {
            structure.columns.push(colDef);
          }
        }
      }
      sheet.changed('structure', true);
      await sheet.update({ structure, version: sheet.version + 1, lastModifiedById: req.user.id });

      res.json({
        success: true,
        message: `${count} column(s) ${position !== undefined ? 'inserted at position ' + position : 'added'}`,
        sheet: { id: sheet.id, structure: sheet.structure },
      });
    } catch (error) {
      logger.error('Add columns error:', error);
      res.status(500).json({ message: 'Failed to add columns', error: error.message });
    }
  }
);

// Remove columns
router.delete('/:id/columns',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  checkSheetAccess,
  async (req, res) => {
    try {
      const sheet = req.sheet;
      const count = parseInt(req.query.count) || 1;
      const position = req.query.position !== undefined ? parseInt(req.query.position) : undefined;
      const structure = sheet.structure || { rows: 10, cols: 5, columns: [] };
      const currentCols = typeof structure.cols === 'number' ? structure.cols : (structure.columns?.length || 5);

      if (count >= currentCols) {
        return res.status(400).json({ message: 'Cannot remove all columns' });
      }

      const { CellData } = require('../models');
      const { sequelize: sq } = require('../config/database');
      const { Op } = require('sequelize');

      await sq.transaction(async (tx) => {
        if (position !== undefined) {
          const deleteFrom = position;
          const deleteTo = position + count - 1;

          await CellData.destroy({
            where: { sheetId: sheet.id, columnIndex: { [Op.between]: [deleteFrom, deleteTo] } },
            transaction: tx,
          });

          const cellsToShift = await CellData.findAll({
            where: { sheetId: sheet.id, columnIndex: { [Op.gt]: deleteTo } },
            order: [['columnIndex', 'ASC']],
            transaction: tx,
          });
          for (const cell of cellsToShift) {
            const newColIdx = cell.columnIndex - count;
            const colLetter = String.fromCharCode(65 + newColIdx);
            const newCellId = `${colLetter}${cell.rowIndex + 1}`;
            await cell.update({ columnIndex: newColIdx, cellId: newCellId }, { transaction: tx });
          }
        } else {
          await CellData.destroy({
            where: { sheetId: sheet.id, columnIndex: { [Op.gte]: currentCols - count } },
            transaction: tx,
          });
        }
      });

      structure.cols = currentCols - count;
      if (Array.isArray(structure.columns)) {
        if (position !== undefined) {
          structure.columns.splice(position, count);
        } else {
          structure.columns.splice(-count);
        }
      }
      sheet.changed('structure', true);
      await sheet.update({ structure, version: sheet.version + 1, lastModifiedById: req.user.id });

      res.json({
        success: true,
        message: `${count} column(s) removed`,
        sheet: { id: sheet.id, structure: sheet.structure },
      });
    } catch (error) {
      logger.error('Remove columns error:', error);
      res.status(500).json({ message: 'Failed to remove columns', error: error.message });
    }
  }
);

// Lock/Unlock sheet
router.patch('/:id/lock',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  checkSheetAccess,
  [
    body('action').isIn(['lock', 'unlock']),
  ],
  auditLog('LOCK_SHEET', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const sheet = req.sheet;
      const { action } = req.body;

      const updateData = {
        status: action === 'lock' ? 'LOCKED' : 'ACTIVE',
        lastModifiedById: req.user.id,
      };

      if (action === 'lock') {
        updateData.lockedAt = new Date();
        updateData.lockedById = req.user.id;
      } else {
        updateData.lockedAt = null;
        updateData.lockedById = null;
      }

      await sheet.update(updateData);

      res.json({
        message: `Sheet ${action}ed successfully`,
        sheet,
      });

    } catch (error) {
      logger.error('Lock sheet error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Update or create cell data
router.post('/:id/cells',
  authenticateToken,
  checkSheetAccess,
  auditLog('UPDATE_CELL', 'CELL'),
  async (req, res) => {
    try {
      const { id: sheetId } = req.params;
      const { cellId, value, dataType } = req.body;

      if (!cellId) {
        return res.status(400).json({
          success: false,
          message: 'Cell ID is required'
        });
      }

      // Check sheet exists
      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({
          success: false,
          message: 'Sheet not found'
        });
      }

      // Centralized permission check
      const canEdit = await PermissionService.canEditCell(req.user, { sheetId, cellId });
      if (!canEdit) {
        return res.status(403).json({ success: false, message: 'No permission to edit this cell' });
      }

      // Use transaction: create/update cell and then recalculate formulas and persist results
      const sequelize = require('../config/database').sequelize;
      await sequelize.transaction(async (tx) => {
        // Find or create cell
        let cell = await CellData.findOne({ where: { sheetId, cellId }, transaction: tx });

        // Parse cell ID to get row and column indices
        const match = cellId.match(/([A-Z]+)(\d+)/);
        const columnIndex = match ? match[1].charCodeAt(0) - 65 : 0;
        const rowIndex = match ? parseInt(match[2]) - 1 : 0;

        if (!cell) {
          cell = await CellData.create({
            sheetId,
            cellId,
            value: value || '',
            dataType: dataType || 'TEXT',
            rowIndex,
            columnIndex,
            createdById: req.user.id,
            lastModifiedById: req.user.id
          }, { transaction: tx });
        } else {
          cell.value = value || '';
          cell.dataType = dataType || cell.dataType;
          cell.lastModifiedById = req.user.id;

          // Try to parse numeric value
          const numValue = parseFloat(value);
          if (!isNaN(numValue) && (dataType !== 'FORMULA' && cell.dataType !== 'FORMULA')) {
            cell.numericValue = numValue;
          }

          await cell.save({ transaction: tx });
        }

        // If this value is a formula (starts with =) and the user is admin, persist it in sheet.formulas
        if ((value || '').toString().trim().startsWith('=')) {
          // ensure sheet.formulas object exists
          const s = await Sheet.findByPk(sheetId, { transaction: tx });
          const updatedFormulas = { ...(s.formulas || {}), [cellId]: value };
          s.formulas = updatedFormulas;  // Reassign (not mutate) so Sequelize detects the change
          s.changed('formulas', true);   // Belt-and-suspenders: force JSONB change detection
          await s.save({ transaction: tx });
        }

        // Recalculate formulas for the sheet and persist calculated values into CellData
        try {
          const sheetWithCells = await Sheet.findByPk(sheetId, { include: ['cellData'], transaction: tx });
          const formulas = sheetWithCells.formulas || {};
          if (formulas && Object.keys(formulas).length > 0) {
            // Build cell data map
            const cMap = {};
            sheetWithCells.cellData.forEach(cd => { cMap[cd.cellId] = { value: cd.value }; });

            const recalculated = FormulaEngine.recalculateSheet(formulas, cMap);

            // Persist recalculated values back to CellData
            for (const [cid, obj] of Object.entries(recalculated)) {
              if (!obj.isCalculated) continue; // Only update formula cells
              const existing = sheetWithCells.cellData.find(x => x.cellId === cid);
              if (existing) {
                existing.value = String(obj.value);
                existing.dataType = 'FORMULA';
                const numeric = parseFloat(obj.value);
                existing.numericValue = (!isNaN(numeric) ? numeric : null);
                await existing.save({ transaction: tx });
              } else {
                // Create if not exists
                const m = cid.match(/([A-Z]+)(\d+)/);
                const colIdx = m ? m[1].charCodeAt(0) - 65 : 0;
                const rowIdx = m ? parseInt(m[2]) - 1 : 0;
                await CellData.create({ sheetId, cellId: cid, value: obj.value, dataType: 'TEXT', rowIndex: rowIdx, columnIndex: colIdx, createdById: req.user.id, lastModifiedById: req.user.id }, { transaction: tx });
              }
            }
          }
        } catch (err) {
          logger.warn('Formula recalculation failed during cell update: ' + err.message);
          // continue without failing the whole update - but log warning
        }

        // Return updated cell (refetch to include latest persisted state)
      });

      const updated = await CellData.findOne({ where: { sheetId, cellId } });

      res.json({
        success: true,
        message: 'Cell updated successfully',
        cell: {
          cellId: updated.cellId,
          value: updated.value,
          dataType: updated.dataType,
          numericValue: updated.numericValue
        }
      });

    } catch (error) {
      logger.error('Update cell error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

// Save edit log
router.post('/edit-log',
  async (req, res) => {
    try {
      const { cellId, oldValue, newValue, role, timestamp } = req.body;

      const { AuditLog } = require('../models');

      const log = await AuditLog.create({
        userId: req.user?.id || null,
        action: 'CELL_EDIT',
        resource: 'spreadsheet_cell',
        resourceId: cellId,
        oldValues: { cellId, value: oldValue },
        newValues: { cellId, value: newValue },
        metadata: {
          role,
          cellId,
          timestamp: timestamp || new Date().toISOString()
        }
      });

      logger.info(`Edit log created: ${cellId} changed from "${oldValue}" to "${newValue}" by ${role}`);

      res.json({
        success: true,
        logId: log.id,
        message: 'Edit logged successfully'
      });

    } catch (error) {
      logger.error('Save edit log error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to save edit log',
        error: error.message
      });
    }
  }
);

// Get edit logs
router.get('/edit-logs',
  async (req, res) => {
    try {
      const { AuditLog, User } = require('../models');

      const logs = await AuditLog.findAll({
        where: { action: 'CELL_EDIT' },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'email', 'role']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: 100
      });

      const formattedLogs = logs.map(log => ({
        id: log.id,
        cellId: log.metadata?.cellId || log.resourceId,
        oldValue: log.oldValues?.value || '',
        newValue: log.newValues?.value || '',
        role: log.metadata?.role || log.user?.role || 'Unknown',
        user: log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown',
        timestamp: log.createdAt,
        formattedTime: new Date(log.createdAt).toLocaleString()
      }));

      res.json({
        success: true,
        logs: formattedLogs,
        count: formattedLogs.length
      });

    } catch (error) {
      logger.error('Get edit logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve edit logs',
        error: error.message
      });
    }
  }
);

// Push sheet to specific roles (Admin only)
router.post('/:id/push-to-roles',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('targetRoles').isArray().notEmpty(),
    body('targetRoles.*').isIn(['L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER']),
    body('assignmentType').optional().isIn(['SHEET', 'ROW', 'COLUMN', 'CELL']),
    body('assignedRows').optional().isArray(),
    body('assignedColumns').optional().isArray(),
    body('assignedCells').optional().isArray(),
  ],
  auditLog('PUSH_SHEET_TO_ROLES', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const sheet = await Sheet.findByPk(req.params.id, {
        include: [
          {
            association: 'project',
            attributes: ['id', 'name'],
          },
        ],
      });

      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      const { targetRoles, assignmentType, assignedRows, assignedColumns, assignedCells } = req.body;
      const pushType = assignmentType || 'SHEET';

      // Update sheet permissions to include target roles
      const updatedPermissions = { ...sheet.permissions };
      targetRoles.forEach(role => {
        if (!updatedPermissions[role]) {
          updatedPermissions[role] = getDefaultPermissions()[role];
        }
      });

      await sheet.update({
        permissions: updatedPermissions,
        status: 'ACTIVE',
        lastModifiedById: req.user.id,
      });

      // Also create UserSheet records for all users in the target roles
      const { User, UserSheet, SheetAssignment } = require('../models');
      const users = await User.findAll({
        where: { role: targetRoles },
        attributes: ['id', 'firstName', 'lastName', 'email', 'role']
      });

      const userSheetRecords = await Promise.all(
        users.map(async (user) => {
          const existing = await UserSheet.findOne({
            where: { userId: user.id, sheetId: sheet.id }
          });
          if (existing) return existing;

          return UserSheet.create({
            userId: user.id,
            sheetId: sheet.id,
            assignedById: req.user.id,
            status: 'pending',
            cellChanges: {},
            progress: 0,
          });
        })
      );

      // Helper: safely parse JSONB arrays that may come back as strings
      const safeArr = (val) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
          try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
        }
        return [];
      };

      // Create SheetAssignment records for granular row/column/cell assignments
      const sheetAssignments = [];
      for (const role of targetRoles) {
        try {
          // Check for existing assignment with same type for this role
          const existing = await SheetAssignment.findOne({
            where: {
              sheetId: sheet.id,
              assignedRole: role,
              assignmentType: pushType,
            },
          });

          if (existing) {
            // Merge new rows/columns/cells with existing ones
            const mergedRows = [...new Set([
              ...safeArr(existing.assignedRows),
              ...safeArr(assignedRows),
            ])];
            const mergedCols = [...new Set([
              ...safeArr(existing.assignedColumns),
              ...safeArr(assignedColumns),
            ])];
            const mergedCells = [...new Set([
              ...safeArr(existing.assignedCells),
              ...safeArr(assignedCells),
            ])];

            await existing.update({
              assignedRows: mergedRows,
              assignedColumns: mergedCols,
              assignedCells: mergedCells,
              status: 'PENDING',
            });
            sheetAssignments.push(existing);
          } else {
            const sa = await SheetAssignment.create({
              sheetId: sheet.id,
              assignedRole: role,
              assignedById: req.user.id,
              assignmentType: pushType,
              assignedRows: safeArr(assignedRows),
              assignedColumns: safeArr(assignedColumns),
              assignedCells: safeArr(assignedCells),
              status: 'PENDING',
            });
            sheetAssignments.push(sa);
          }
        } catch (saErr) {
          logger.warn(`Failed to create SheetAssignment for role ${role}:`, saErr.message);
        }
      }

      // Emit Socket.io event to notify target roles
      if (req.io) {
        req.io.emit('sheet_pushed', {
          sheetId: sheet.id,
          sheetName: sheet.name,
          projectId: sheet.projectId,
          targetRoles,
          assignmentType: pushType,
          assignedRows: assignedRows || [],
          assignedColumns: assignedColumns || [],
          assignedCells: assignedCells || [],
          assignedUsers: users.map(u => u.id),
          pushedBy: req.user.id,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(`Sheet ${sheet.id} pushed to roles: ${targetRoles.join(', ')} (${users.length} users, type: ${pushType}) by user ${req.user.id}`);

      res.json({
        success: true,
        message: `Sheet pushed to ${targetRoles.join(', ')} (${users.length} users) successfully`,
        sheet,
        assignments: userSheetRecords.map(a => ({
          id: a.id,
          userId: a.userId,
          status: a.status,
        })),
        sheetAssignments: sheetAssignments.map(sa => ({
          id: sa.id,
          assignedRole: sa.assignedRole,
          assignmentType: sa.assignmentType,
          assignedRows: sa.assignedRows,
          assignedColumns: sa.assignedColumns,
          assignedCells: sa.assignedCells,
        })),
        users: users.map(u => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email,
          role: u.role,
        })),
      });

    } catch (error) {
      logger.error('Push sheet to roles error detail:', error);
      res.status(500).json({ success: false, message: 'Internal server error: ' + error.message, error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    }
  }
);

// Push sheet to specific users (Admin only)
router.post('/:id/push-to-users',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('userIds').optional().isArray(),
    body('roles').optional().isArray(),
  ],
  auditLog('PUSH_SHEET_TO_USERS', 'SHEET'),
  async (req, res) => {
    try {
      logger.info('Push to users request body:', JSON.stringify(req.body));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Push to users validation errors:', JSON.stringify(errors.array()));
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { userIds, roles } = req.body;

      if ((!userIds || userIds.length === 0) && (!roles || roles.length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide either userIds or roles'
        });
      }

      const sheet = await Sheet.findByPk(req.params.id, {
        include: [
          {
            association: 'project',
            attributes: ['id', 'name'],
          },
        ],
      });

      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      // Get users based on roles or specific user IDs
      const { User, UserSheet } = require('../models');
      const where = {};

      if (roles && roles.length > 0) {
        where.role = roles;
      }

      if (userIds && userIds.length > 0) {
        if (where.role) {
          // If both roles and userIds are provided, use OR condition
          where[require('sequelize').Op.or] = [
            { role: roles },
            { id: userIds }
          ];
          delete where.role;
        } else {
          where.id = userIds;
        }
      }

      const users = await User.findAll({
        where,
        attributes: ['id', 'firstName', 'lastName', 'email', 'role']
      });

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No users found matching the criteria'
        });
      }

      // Create UserSheet records for each user
      const assignments = await Promise.all(
        users.map(async (user) => {
          // Check if assignment already exists
          const existing = await UserSheet.findOne({
            where: { userId: user.id, sheetId: sheet.id }
          });

          if (existing) {
            return existing;
          }

          return UserSheet.create({
            userId: user.id,
            sheetId: sheet.id,
            assignedById: req.user.id,
            status: 'pending',
            cellChanges: {},
            progress: 0,
          });
        })
      );

      // Update sheet status to ACTIVE
      await sheet.update({
        status: 'ACTIVE',
        lastModifiedById: req.user.id,
      });

      // Emit Socket.io event to notify assigned users
      if (req.io) {
        req.io.emit('sheet_assigned', {
          sheetId: sheet.id,
          sheetName: sheet.name,
          projectId: sheet.projectId,
          assignedUsers: users.map(u => u.id),
          assignedBy: req.user.id,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(`Sheet ${sheet.id} pushed to ${users.length} user(s) by user ${req.user.id}`);

      res.json({
        success: true,
        message: `Sheet pushed to ${users.length} user(s) successfully`,
        sheet,
        assignments: assignments.map(a => ({
          id: a.id,
          userId: a.userId,
          status: a.status,
        })),
        users: users.map(u => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email,
          role: u.role,
        })),
      });

    } catch (error) {
      logger.error('Push sheet to users error detail:', error);
      res.status(500).json({ success: false, message: 'Internal server error: ' + error.message, error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    }
  }
);

// Sync sheet updates back to admin (L2/L3 Engineers)
router.post('/:id/sync-to-admin',
  authenticateToken,
  authorizeRoles('L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'GROUND_MANAGER'),
  auditLog('SYNC_SHEET_TO_ADMIN', 'SHEET'),
  async (req, res) => {
    try {
      const sheet = await Sheet.findByPk(req.params.id, {
        include: [
          {
            association: 'cellData',
            attributes: ['id', 'cellId', 'value', 'numericValue', 'dataType', 'status', 'updatedAt'],
          },
        ],
      });

      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      // Update last modified info
      await sheet.update({
        lastModifiedById: req.user.id,
        version: sheet.version + 1,
      });

      // Emit Socket.io event to notify admins
      if (req.io) {
        req.io.emit('sheet_synced', {
          sheetId: sheet.id,
          sheetName: sheet.name,
          projectId: sheet.projectId,
          syncedBy: req.user.id,
          syncedByRole: req.user.role,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(`Sheet ${sheet.id} synced to admin by user ${req.user.id} (${req.user.role})`);

      res.json({
        success: true,
        message: 'Sheet synced to admin successfully',
        sheet,
      });

    } catch (error) {
      logger.error('Sync sheet to admin error:', error);
      res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
  }
);

// Get sheets for current user based on role
router.get('/my-sheets',
  authenticateToken,
  async (req, res) => {
    try {
      const userRole = req.user.role;

      // Get all sheets where user has view permission
      const sheets = await Sheet.findAll({
        include: [
          {
            association: 'project',
            attributes: ['id', 'name', 'status'],
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

      // Get sheets assigned directly to the user
      const assignedSheets = await UserSheet.findAll({
        where: { userId: req.user.id },
        attributes: ['sheetId']
      });
      const assignedSheetIds = assignedSheets.map(as => as.sheetId);

      // Filter sheets based on user permissions or direct assignment
      const filteredSheets = sheets.filter(sheet => {
        // Check role permissions
        const permissions = sheet.permissions && sheet.permissions[userRole];
        const hasRoleAccess = permissions && permissions.canView;

        // Check direct assignment
        const isAssigned = assignedSheetIds.includes(sheet.id);

        return hasRoleAccess || isAssigned;
      });

      res.json({
        success: true,
        sheets: filteredSheets,
        count: filteredSheets.length,
      });

    } catch (error) {
      logger.error('Get my sheets error:', error);
      res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
  }
);

// Delete sheet (Admin only)
router.delete('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  auditLog('DELETE_SHEET', 'SHEET'),
  async (req, res) => {
    try {
      const sheet = await Sheet.findByPk(req.params.id);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      // Store sheet data for audit
      req.originalData = sheet.toJSON();

      await sheet.destroy();

      res.json({ message: 'Sheet deleted successfully' });

    } catch (error) {
      logger.error('Delete sheet error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ==========================================
// UNASSIGN sheet from users (Admin only)
// ==========================================
router.post('/:id/unassign',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('userIds').optional().isArray(),
    body('roles').optional().isArray(),
  ],
  auditLog('UNASSIGN_SHEET', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { userIds, roles } = req.body;
      const sheetId = req.params.id;

      if ((!userIds || userIds.length === 0) && (!roles || roles.length === 0)) {
        return res.status(400).json({ success: false, message: 'Provide userIds or roles to unassign' });
      }

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      const { User } = require('../models');
      const { Op } = require('sequelize');
      let removedCount = 0;

      // Remove UserSheet records for specific users
      if (userIds && userIds.length > 0) {
        removedCount += await UserSheet.destroy({
          where: { sheetId, userId: { [Op.in]: userIds } },
        });
      }

      // Remove UserSheet records for users with specific roles
      if (roles && roles.length > 0) {
        const usersInRoles = await User.findAll({
          where: { role: { [Op.in]: roles } },
          attributes: ['id'],
        });
        const roleUserIds = usersInRoles.map(u => u.id);
        if (roleUserIds.length > 0) {
          removedCount += await UserSheet.destroy({
            where: { sheetId, userId: { [Op.in]: roleUserIds } },
          });
        }

        // Also remove role permissions from sheet
        const updatedPermissions = { ...sheet.permissions };
        roles.forEach(role => {
          if (updatedPermissions[role]) {
            updatedPermissions[role].canView = false;
            updatedPermissions[role].canEdit = false;
          }
        });
        await sheet.update({ permissions: updatedPermissions, lastModifiedById: req.user.id });
      }

      // Also remove CellPermissions for those users
      if (userIds && userIds.length > 0) {
        const { CellPermission } = require('../models');
        const cellPerms = await CellPermission.findAll({ where: { sheetId } });
        for (const cp of cellPerms) {
          let changed = false;
          const editUsers = Array.isArray(cp.canEditUsers) ? cp.canEditUsers : JSON.parse(cp.canEditUsers || '[]');
          const viewUsers = Array.isArray(cp.canViewUsers) ? cp.canViewUsers : JSON.parse(cp.canViewUsers || '[]');
          const newEditUsers = editUsers.filter(u => !userIds.includes(u));
          const newViewUsers = viewUsers.filter(u => !userIds.includes(u));
          if (newEditUsers.length !== editUsers.length || newViewUsers.length !== viewUsers.length) {
            changed = true;
          }
          if (changed) {
            await cp.update({ canEditUsers: newEditUsers, canViewUsers: newViewUsers });
          }
        }
      }

      logger.info(`Sheet ${sheetId} unassigned from ${removedCount} user(s) by admin ${req.user.id}`);

      res.json({
        success: true,
        message: `Unassigned ${removedCount} user(s) from sheet`,
        removedCount,
      });

    } catch (error) {
      logger.error('Unassign sheet error:', error);
      res.status(500).json({ success: false, message: 'Failed to unassign', error: error.message });
    }
  }
);

// ==========================================
// Get assigned users for a sheet (Admin only)
// ==========================================
router.get('/:id/assigned-users',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  async (req, res) => {
    try {
      const sheetId = req.params.id;
      const { User } = require('../models');

      const userSheets = await UserSheet.findAll({
        where: { sheetId },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role'],
        }],
      });

      res.json({
        success: true,
        assignedUsers: userSheets.map(us => ({
          id: us.user.id,
          firstName: us.user.firstName,
          lastName: us.user.lastName,
          email: us.user.email,
          role: us.user.role,
          status: us.status,
          assignedAt: us.createdAt,
          userSheetId: us.id,
        })),
      });
    } catch (error) {
      logger.error('Get assigned users error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch assigned users' });
    }
  }
);

// ==========================================
// Lock/Unlock SPECIFIC CELLS (Admin only)
// ==========================================
router.post('/:id/lock-cells',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('cellIds').isArray().notEmpty(),
    body('locked').isBoolean(),
  ],
  auditLog('LOCK_CELLS', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const sheetId = req.params.id;
      const { cellIds, locked } = req.body;
      const { CellPermission } = require('../models');

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      // Update or create CellPermission for each cell
      for (const cellId of cellIds) {
        const existing = await CellPermission.findOne({ where: { sheetId, cellId } });
        if (existing) {
          await existing.update({ isLocked: locked });
        } else {
          await CellPermission.create({
            sheetId,
            cellId,
            isLocked: locked,
            canViewRoles: [],
            canViewUsers: [],
            canEditRoles: [],
            canEditUsers: [],
          });
        }
      }

      // Also store locked cells in structure for quick frontend access
      const structure = sheet.structure || {};
      if (!structure.lockedCells) structure.lockedCells = {};
      cellIds.forEach(cellId => {
        if (locked) {
          structure.lockedCells[cellId] = true;
        } else {
          delete structure.lockedCells[cellId];
        }
      });
      sheet.changed('structure', true);
      await sheet.update({ structure, lastModifiedById: req.user.id });

      logger.info(`Cells ${locked ? 'locked' : 'unlocked'}: ${cellIds.join(', ')} in sheet ${sheetId} by admin ${req.user.id}`);

      res.json({
        success: true,
        message: `${cellIds.length} cell(s) ${locked ? 'locked' : 'unlocked'} successfully`,
        lockedCells: structure.lockedCells,
      });

    } catch (error) {
      logger.error('Lock cells error:', error);
      res.status(500).json({ success: false, message: 'Failed to lock cells', error: error.message });
    }
  }
);

// Helper function to get default permissions
function getDefaultPermissions() {
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

// Set formula for a cell
router.post('/:sheetId/formulas',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  [
    body('cellId').notEmpty().trim(),
    body('formula').notEmpty().trim(),
  ],
  auditLog('SET_FORMULA', 'SHEET'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sheetId } = req.params;
      const { cellId, formula } = req.body;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      // Validate formula
      if (!FormulaEngine.validateFormula(formula)) {
        return res.status(400).json({ message: 'Invalid formula format. Use =FUNCTION(range) or =FUNCTION(cell1,cell2)' });
      }

      // Store formula
      if (!sheet.formulas) {
        sheet.formulas = {};
      }
      sheet.formulas[cellId] = formula;

      await sheet.save();

      res.json({
        message: 'Formula set successfully',
        cellId,
        formula,
        sheet: {
          id: sheet.id,
          formulas: sheet.formulas,
        },
      });

    } catch (error) {
      logger.error('Set formula error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get all formulas for a sheet
router.get('/:sheetId/formulas',
  authenticateToken,
  async (req, res) => {
    try {
      const { sheetId } = req.params;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      res.json({
        sheetId,
        formulas: sheet.formulas || {},
      });

    } catch (error) {
      logger.error('Get formulas error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Delete formula from a cell
router.delete('/:sheetId/formulas/:cellId',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  auditLog('DELETE_FORMULA', 'SHEET'),
  async (req, res) => {
    try {
      const { sheetId, cellId } = req.params;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      if (sheet.formulas && sheet.formulas[cellId]) {
        delete sheet.formulas[cellId];
        await sheet.save();
      }

      res.json({
        message: 'Formula deleted successfully',
        cellId,
      });

    } catch (error) {
      logger.error('Delete formula error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Calculate formula result
router.post('/:sheetId/calculate-formula',
  authenticateToken,
  [
    body('cellId').notEmpty().trim(),
    body('cellValues').isObject(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sheetId } = req.params;
      const { cellId, cellValues } = req.body;

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ message: 'Sheet not found' });
      }

      const formula = sheet.formulas?.[cellId];
      if (!formula) {
        return res.status(400).json({ message: 'No formula found for this cell' });
      }

      const result = FormulaEngine.calculate(formula, cellValues);

      res.json({
        cellId,
        formula,
        result,
      });

    } catch (error) {
      logger.error('Calculate formula error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ==========================================
// Get all SheetAssignments for a sheet (Admin only)
// Returns granular row/column/cell assignments per role
// ==========================================
router.get('/:id/assignments',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  async (req, res) => {
    try {
      const sheetId = req.params.id;
      const { SheetAssignment, User } = require('../models');

      const assignments = await SheetAssignment.findAll({
        where: { sheetId },
        include: [
          { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'role'], required: false },
          { model: User, as: 'assignedBy', attributes: ['id', 'firstName', 'lastName'], required: false },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Helper: parse JSONB that might be a string
      const safeArr = (val) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
          try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
        }
        return [];
      };

      res.json({
        success: true,
        assignments: assignments.map(a => ({
          id: a.id,
          sheetId: a.sheetId,
          userId: a.userId,
          assignedRole: a.assignedRole,
          assignmentType: a.assignmentType || 'SHEET',
          assignedRows: safeArr(a.assignedRows),
          assignedColumns: safeArr(a.assignedColumns),
          assignedCells: safeArr(a.assignedCells),
          status: a.status,
          question: a.question,
          dueDate: a.dueDate,
          assignedAt: a.assignedAt || a.createdAt,
          user: a.user || null,
          assignedBy: a.assignedBy || null,
        })),
      });
    } catch (error) {
      logger.error('Get sheet assignments error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
    }
  }
);

// ==========================================
// Update a specific assignment (modify rows/columns/cells)
// ==========================================
router.put('/:id/assignments/:assignmentId',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  auditLog('UPDATE_ASSIGNMENT', 'SHEET'),
  async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const { assignedRows, assignedColumns, assignedCells, assignmentType, status, question, dueDate } = req.body;
      const { SheetAssignment } = require('../models');

      const assignment = await SheetAssignment.findByPk(assignmentId);
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      const updates = {};
      if (assignedRows !== undefined) updates.assignedRows = assignedRows;
      if (assignedColumns !== undefined) updates.assignedColumns = assignedColumns;
      if (assignedCells !== undefined) updates.assignedCells = assignedCells;
      if (assignmentType) updates.assignmentType = assignmentType;
      if (status) updates.status = status;
      if (question !== undefined) updates.question = question;
      if (dueDate !== undefined) updates.dueDate = dueDate;

      await assignment.update(updates);

      res.json({ success: true, message: 'Assignment updated', assignment });
    } catch (error) {
      logger.error('Update assignment error:', error);
      res.status(500).json({ success: false, message: 'Failed to update assignment' });
    }
  }
);

// ==========================================
// Delete a specific assignment
// ==========================================
router.delete('/:id/assignments/:assignmentId',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  auditLog('DELETE_ASSIGNMENT', 'SHEET'),
  async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const { SheetAssignment } = require('../models');

      const assignment = await SheetAssignment.findByPk(assignmentId);
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      await assignment.destroy();
      res.json({ success: true, message: 'Assignment removed' });
    } catch (error) {
      logger.error('Delete assignment error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete assignment' });
    }
  }
);

// ==========================================
// Remove specific rows/columns from an assignment
// ==========================================
router.post('/:id/assignments/:assignmentId/remove-items',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  auditLog('REMOVE_ASSIGNMENT_ITEMS', 'SHEET'),
  async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const { removeRows, removeColumns, removeCells } = req.body;
      const { SheetAssignment } = require('../models');

      const assignment = await SheetAssignment.findByPk(assignmentId);
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      const safeArr = (val) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
          try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
        }
        return [];
      };

      const currentRows = safeArr(assignment.assignedRows);
      const currentCols = safeArr(assignment.assignedColumns);
      const currentCells = safeArr(assignment.assignedCells);

      const updates = {};
      if (removeRows && removeRows.length > 0) {
        updates.assignedRows = currentRows.filter(r => !removeRows.includes(r));
      }
      if (removeColumns && removeColumns.length > 0) {
        updates.assignedColumns = currentCols.filter(c => !removeColumns.includes(c));
      }
      if (removeCells && removeCells.length > 0) {
        updates.assignedCells = currentCells.filter(c => !removeCells.includes(c));
      }

      await assignment.update(updates);

      res.json({
        success: true,
        message: 'Items removed from assignment',
        assignment: {
          ...assignment.toJSON(),
          ...updates,
        },
      });
    } catch (error) {
      logger.error('Remove assignment items error:', error);
      res.status(500).json({ success: false, message: 'Failed to remove items' });
    }
  }
);

module.exports = router;