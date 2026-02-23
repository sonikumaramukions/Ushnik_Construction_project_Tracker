// ================================================================
// SHEET TEMPLATE ROUTES (routes/templates.js)
// ================================================================
// PURPOSE: Admin can save current sheet as a template and load templates
//          to create new sheets quickly.
//
// ENDPOINTS:
//   GET  /api/templates           — List all saved templates
//   POST /api/templates           — Save current sheet as template
//   GET  /api/templates/:id       — Get a specific template
//   DELETE /api/templates/:id     — Delete a template
//   POST /api/templates/:id/apply — Apply template to a sheet
// ================================================================

const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { Sheet, CellData } = require('../models');
const logger = require('../utils/logger');
const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

// ─── Template Model (inline, simple) ───
const Template = sequelize.define('Template', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  category: {
    type: DataTypes.STRING,
    defaultValue: 'general',
    comment: 'Category: dpr, finance, progress, custom',
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  templateData: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Full template: { rows, cols, cellData, cellStyles, mergedCells, columnWidths, rowHeights, lockedCells }',
  },
}, {
  tableName: 'templates',
  timestamps: true,
});

// Sync the template table
Template.sync({ alter: true }).catch(err => {
  logger.warn('Template table sync warning:', err.message);
});

// ─── GET ALL TEMPLATES ───
router.get('/',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  async (req, res) => {
    try {
      const templates = await Template.findAll({
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'name', 'description', 'category', 'createdById', 'createdAt'],
      });
      res.json({ success: true, templates });
    } catch (error) {
      logger.error('Get templates error:', error);
      res.status(500).json({ success: false, message: 'Failed to load templates', error: error.message });
    }
  }
);

// ─── SAVE CURRENT SHEET AS TEMPLATE ───
router.post('/',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  async (req, res) => {
    try {
      const { name, description, category, sheetId } = req.body;

      if (!name) {
        return res.status(400).json({ success: false, message: 'Template name is required' });
      }
      if (!sheetId) {
        return res.status(400).json({ success: false, message: 'Sheet ID is required' });
      }

      // Fetch the sheet with all data
      const sheet = await Sheet.findByPk(sheetId, {
        include: [{ association: 'cellData' }],
      });

      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      // Build template data from the sheet
      const cellDataMap = {};
      if (sheet.cellData) {
        sheet.cellData.forEach(cell => {
          cellDataMap[cell.cellId] = {
            value: cell.value || '',
            dataType: cell.dataType || 'TEXT',
          };
        });
      }

      const structure = sheet.structure || {};
      const templateData = {
        rows: structure.rows || 20,
        cols: structure.cols || 14,
        cellData: cellDataMap,
        cellStyles: structure.cellStyles || {},
        mergedCells: structure.mergedCells || [],
        columnWidths: structure.columnWidths || {},
        rowHeights: structure.rowHeights || {},
        lockedCells: structure.lockedCells || {},
      };

      const template = await Template.create({
        name,
        description: description || `Template from: ${sheet.name}`,
        category: category || 'custom',
        createdById: req.user.id,
        templateData,
      });

      logger.info(`Template "${name}" created from sheet ${sheetId} by user ${req.user.id}`);

      res.status(201).json({
        success: true,
        message: `Template "${name}" saved successfully`,
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          createdAt: template.createdAt,
        },
      });
    } catch (error) {
      logger.error('Save template error:', error);
      res.status(500).json({ success: false, message: 'Failed to save template', error: error.message });
    }
  }
);

// ─── GET SPECIFIC TEMPLATE ───
router.get('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  async (req, res) => {
    try {
      const template = await Template.findByPk(req.params.id);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      res.json({ success: true, template });
    } catch (error) {
      logger.error('Get template error:', error);
      res.status(500).json({ success: false, message: 'Failed to load template', error: error.message });
    }
  }
);

// ─── DELETE A TEMPLATE ───
router.delete('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  async (req, res) => {
    try {
      const template = await Template.findByPk(req.params.id);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      await template.destroy();
      res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
      logger.error('Delete template error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete template', error: error.message });
    }
  }
);

// ─── APPLY TEMPLATE TO A SHEET ───
router.post('/:id/apply',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  async (req, res) => {
    try {
      const { sheetId } = req.body;
      if (!sheetId) {
        return res.status(400).json({ success: false, message: 'Sheet ID is required' });
      }

      const template = await Template.findByPk(req.params.id);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      const sheet = await Sheet.findByPk(sheetId);
      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      const td = template.templateData;

      // Update sheet structure
      await sheet.update({
        structure: {
          ...(sheet.structure || {}),
          rows: td.rows,
          cols: td.cols,
          cellStyles: td.cellStyles,
          mergedCells: td.mergedCells,
          columnWidths: td.columnWidths,
          rowHeights: td.rowHeights,
          lockedCells: td.lockedCells,
        },
        lastModifiedById: req.user.id,
      });

      // Apply cell data
      let cellCount = 0;
      for (const [cellId, cellInfo] of Object.entries(td.cellData || {})) {
        const ci = cellInfo;
        try {
          // Parse rowIndex and columnIndex from cellId (e.g., "B3" → col=1, row=2)
          const colLetter = cellId.replace(/[0-9]/g, '');
          const rowNum = parseInt(cellId.replace(/[^0-9]/g, ''), 10);
          const columnIndex = colLetter.length === 1
            ? colLetter.charCodeAt(0) - 65
            : (colLetter.charCodeAt(0) - 64) * 26 + (colLetter.charCodeAt(1) - 65);
          const rowIndex = (rowNum || 1) - 1;

          const [cell, created] = await CellData.findOrCreate({
            where: { sheetId, cellId },
            defaults: {
              value: ci.value,
              dataType: ci.dataType || 'TEXT',
              rowIndex,
              columnIndex,
              createdById: req.user.id,
              lastModifiedById: req.user.id,
            },
          });
          if (!created) {
            await cell.update({
              value: ci.value,
              dataType: ci.dataType || 'TEXT',
              lastModifiedById: req.user.id,
            });
          }
          cellCount++;
        } catch (cellErr) {
          logger.warn(`Failed to apply template cell ${cellId}:`, cellErr.message);
        }
      }

      logger.info(`Template "${template.name}" applied to sheet ${sheetId}: ${cellCount} cells`);

      res.json({
        success: true,
        message: `Template "${template.name}" applied (${cellCount} cells)`,
      });
    } catch (error) {
      logger.error('Apply template error:', error);
      res.status(500).json({ success: false, message: 'Failed to apply template', error: error.message });
    }
  }
);

module.exports = router;
