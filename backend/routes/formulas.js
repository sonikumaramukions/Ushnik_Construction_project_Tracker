// ================================================================
// FORMULA ROUTES (routes/formulas.js)
// ================================================================
// PURPOSE: Manage Excel-like formulas (SUM, AVG, MIN, MAX, etc.)
//
// Formulas work like Excel:
//   =SUM(A1:A10)  — adds up cells A1 through A10
//   =AVG(B1:B5)   — average of cells B1-B5
//   =MAX(C1:C20)  — highest value in range
//
// ENDPOINTS:
//   GET  /api/formulas/available              — List all formula types
//   POST /api/formulas/validate               — Check if a formula is valid
//   POST /api/formulas/:sheetId/set           — Set formula for a cell
//   POST /api/formulas/:sheetId/calculate     — Calculate a formula result
//   GET  /api/formulas/:sheetId/cell/:cellId  — Get formula for a cell
//   POST /api/formulas/:sheetId/recalculate   — Recalculate all formulas
//
// USES: services/FormulaService.js, services/formulaEngine.js
// ================================================================

const express = require('express');
const router = express.Router();
const { CellData, Sheet } = require('../models');
const FormulaService = require('../services/FormulaService');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

/**
 * Formula Routes
 * Admin only for setting formulas
 */

/**
 * Get available formulas
 * GET /api/formulas/available
 */
router.get('/available',
    authenticateToken,
    (req, res) => {
        try {
            const formulas = FormulaService.getAvailableFormulas();
            res.status(200).json({
                success: true,
                data: formulas,
                count: formulas.length
            });
        } catch (error) {
            logger.error('Error fetching available formulas:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch available formulas',
                error: error.message
            });
        }
    }
);

/**
 * Validate formula
 * POST /api/formulas/validate
 */
router.post('/validate',
    authenticateToken,
    (req, res) => {
        try {
            const { formula } = req.body;

            if (!formula) {
                return res.status(400).json({
                    success: false,
                    message: 'Formula is required'
                });
            }

            const validation = FormulaService.validateFormula(formula);

            res.status(200).json({
                success: validation.valid,
                data: validation
            });
        } catch (error) {
            logger.error('Error validating formula:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to validate formula',
                error: error.message
            });
        }
    }
);

/**
 * Set formula in a cell
 * POST /api/formulas/set/:sheetId/:cellId
 */
router.post('/set/:sheetId/:cellId',
    authenticateToken,
    auditLog('SET_CELL_FORMULA', 'CELL'),
    async (req, res) => {
        try {
            const { sheetId, cellId } = req.params;
            const { formula } = req.body;

            // Validate formula
            const validation = FormulaService.validateFormula(formula);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid formula',
                    error: validation.error
                });
            }

            // Check sheet exists, create demo sheet if it doesn't
            let sheet = await Sheet.findByPk(sheetId);
            if (!sheet && sheetId === 'sheet-demo') {
                // Create demo sheet for testing
                const { Project } = require('../models');
                let demoProject = await Project.findOne({ where: { name: 'Demo Project' } });
                if (!demoProject) {
                    demoProject = await Project.create({
                        id: '00000000-0000-0000-0000-000000000001',
                        name: 'Demo Project',
                        description: 'Demo project for testing',
                        status: 'ACTIVE',
                        startDate: new Date(),
                        createdById: req.user.id
                    });
                }
                
                sheet = await Sheet.create({
                    id: 'sheet-demo',
                    name: 'Demo Sheet',
                    description: 'Demo sheet for testing',
                    projectId: demoProject.id,
                    createdById: req.user.id,
                    status: 'ACTIVE',
                    structure: { rows: 20, cols: 10 },
                    permissions: {}
                });
            }
            
            if (!sheet) {
                return res.status(404).json({
                    success: false,
                    message: 'Sheet not found'
                });
            }

            // Find or create cell
            let cell = await CellData.findOne({
                where: { sheetId, cellId }
            });

            if (!cell) {
                cell = await CellData.create({
                    sheetId,
                    cellId,
                    rowIndex: parseInt(cellId.match(/\d+/)[0]) || 0,
                    columnIndex: cellId.charCodeAt(0) - 65 || 0,
                    createdById: req.user.id
                });
            }

            // Extract dependencies
            const dependencies = FormulaService.extractDependencies(formula);

            // Calculate formula result first
            const result = await FormulaService.calculateFormula(formula, sheetId);

            // Update cell with formula and calculated value
            cell.value = formula;
            cell.dataType = 'FORMULA';
            cell.numericValue = typeof result === 'number' ? result : null;
            cell.lastModifiedById = req.user.id;
            cell.metadata = {
                ...cell.metadata,
                formula,
                dependencies,
                calculatedValue: result,
                formulaSetAt: new Date().toISOString(),
                formulaSetBy: req.user.id
            };

            await cell.save();

            // Also persist formula in sheet.formulas for recalculation engine
            const updatedFormulas = { ...(sheet.formulas || {}), [cellId]: formula };
            sheet.formulas = updatedFormulas;
            sheet.changed('formulas', true);
            await sheet.save();

            res.status(200).json({
                success: true,
                message: 'Formula set successfully',
                data: {
                    cellId,
                    formula,
                    calculatedValue: result,
                    dependencies
                }
            });

        } catch (error) {
            logger.error('Error setting formula:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to set formula',
                error: error.message
            });
        }
    }
);

/**
 * Calculate formula result
 * POST /api/formulas/calculate/:sheetId
 */
router.post('/calculate/:sheetId',
    authenticateToken,
    async (req, res) => {
        try {
            const { sheetId } = req.params;
            const { formula } = req.body;

            // Validate sheet exists
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                return res.status(404).json({
                    success: false,
                    message: 'Sheet not found'
                });
            }

            // Validate formula
            const validation = FormulaService.validateFormula(formula);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid formula',
                    error: validation.error
                });
            }

            // Calculate result
            const result = await FormulaService.calculateFormula(formula, sheetId);

            res.status(200).json({
                success: true,
                data: {
                    formula,
                    result,
                    type: typeof result,
                    isError: String(result).includes('#ERROR')
                }
            });

        } catch (error) {
            logger.error('Error calculating formula:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to calculate formula',
                error: error.message
            });
        }
    }
);

/**
 * Get cell formula
 * GET /api/formulas/:sheetId/:cellId
 */
router.get('/:sheetId/:cellId',
    authenticateToken,
    async (req, res) => {
        try {
            const { sheetId, cellId } = req.params;

            const cell = await CellData.findOne({
                where: { sheetId, cellId },
                attributes: ['cellId', 'value', 'dataType', 'metadata'],
                raw: true
            });

            if (!cell) {
                return res.status(404).json({
                    success: false,
                    message: 'Cell not found'
                });
            }

            if (cell.dataType !== 'FORMULA') {
                return res.status(400).json({
                    success: false,
                    message: 'This cell does not contain a formula'
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    cellId: cell.cellId,
                    formula: cell.value,
                    dependencies: cell.metadata?.dependencies || [],
                    formulaSetAt: cell.metadata?.formulaSetAt,
                    formulaSetBy: cell.metadata?.formulaSetBy
                }
            });

        } catch (error) {
            logger.error('Error fetching cell formula:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch cell formula',
                error: error.message
            });
        }
    }
);

/**
 * Recalculate all formulas in a sheet
 * POST /api/formulas/recalculate/:sheetId
 */
router.post('/recalculate/:sheetId',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'L2_SENIOR_ENGINEER']),
    auditLog('RECALCULATE_FORMULAS', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId } = req.params;

            // Check sheet exists
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                return res.status(404).json({
                    success: false,
                    message: 'Sheet not found'
                });
            }

            // Get all formula cells
            const formulaCells = await CellData.findAll({
                where: {
                    sheetId,
                    dataType: 'FORMULA'
                },
                raw: true
            });

            const results = [];

            // Recalculate each formula
            for (const cell of formulaCells) {
                const result = await FormulaService.calculateFormula(cell.value, sheetId);
                results.push({
                    cellId: cell.cellId,
                    formula: cell.value,
                    result
                });
            }

            res.status(200).json({
                success: true,
                message: `Recalculated ${results.length} formulas`,
                data: results
            });

        } catch (error) {
            logger.error('Error recalculating formulas:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to recalculate formulas',
                error: error.message
            });
        }
    }
);

module.exports = router;
