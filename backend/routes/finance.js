// ================================================================
// FINANCE ROUTES (routes/finance.js)
// ================================================================
// PURPOSE: Financial tracking — company, project, and per-sheet level.
//
// ENDPOINTS:
//   GET    /api/finance                           — Get all financial records (filter by project/sheet/year/quarter)
//   GET    /api/finance/summary/overview           — Company-wide financial summary
//   GET    /api/finance/project/:projectId         — Project-level finance with budget warnings
//   GET    /api/finance/project/:projectId/quarterly — Quarterly breakdown for a project
//   GET    /api/finance/sheet/:sheetId             — Per-sheet finance records
//   GET    /api/finance/:id                        — Get single record
//   POST   /api/finance                            — Create financial record
//   PUT    /api/finance/:id                        — Update financial record
//   DELETE /api/finance/:id                        — Delete financial record
//   PUT    /api/finance/project/:projectId/budget  — Update project estimated budget
//
// ACCESS: L1_ADMIN, PROJECT_MANAGER (project-level), CEO (view only)
// ================================================================

const express = require('express');
const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');
const { FinancialRecord, Project, Sheet, User } = require('../models');

const router = express.Router();

// ─── COMPANY-WIDE SUMMARY ───
router.get('/summary/overview',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'CEO', 'PROJECT_MANAGER'),
  async (req, res) => {
    try {
      const records = await FinancialRecord.findAll({
        order: [['year', 'DESC'], ['quarter', 'DESC']],
      });

      const totalRevenue = records.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0);
      const totalExpenses = records.reduce((sum, r) => sum + parseFloat(r.expenses || 0), 0);
      const totalProfit = records.reduce((sum, r) => sum + parseFloat(r.profit || 0), 0);
      const totalOperationalCost = records.reduce((sum, r) => sum + parseFloat(r.operationalCost || 0), 0);
      const avgMargin = records.length > 0
        ? records.reduce((sum, r) => sum + parseFloat(r.margin || 0), 0) / records.length
        : 0;

      const currentYear = new Date().getFullYear();
      const currentYearRecords = records.filter(r => r.year === currentYear);
      const ytdRevenue = currentYearRecords.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0);
      const ytdExpenses = currentYearRecords.reduce((sum, r) => sum + parseFloat(r.expenses || 0), 0);
      const ytdProfit = currentYearRecords.reduce((sum, r) => sum + parseFloat(r.profit || 0), 0);

      // Budget warnings: projects approaching their estimated budget
      const projects = await Project.findAll({
        where: {
          estimatedBudget: { [Op.ne]: null },
          status: { [Op.in]: ['PLANNING', 'IN_PROGRESS'] },
        },
        include: [{ model: FinancialRecord, as: 'financialRecords' }],
      });

      const budgetWarnings = [];
      for (const project of projects) {
        const projectExpenses = project.financialRecords.reduce(
          (sum, r) => sum + parseFloat(r.expenses || 0) + parseFloat(r.operationalCost || 0), 0
        );
        const budget = parseFloat(project.estimatedBudget || 0);
        const percentUsed = budget > 0 ? (projectExpenses / budget) * 100 : 0;

        if (percentUsed >= 80) {
          budgetWarnings.push({
            projectId: project.id,
            projectName: project.name,
            estimatedBudget: budget,
            totalSpent: projectExpenses,
            percentUsed: Math.round(percentUsed * 10) / 10,
            status: percentUsed >= 100 ? 'EXCEEDED' : percentUsed >= 90 ? 'CRITICAL' : 'WARNING',
          });
        }
      }

      res.json({
        success: true,
        summary: {
          totalRevenue,
          totalExpenses,
          totalProfit,
          totalOperationalCost,
          averageMargin: Math.round(avgMargin * 100) / 100,
          recordCount: records.length,
          ytd: { revenue: ytdRevenue, expenses: ytdExpenses, profit: ytdProfit },
        },
        budgetWarnings,
        records,
      });
    } catch (error) {
      logger.error('Finance summary error:', error);
      res.status(500).json({ success: false, message: 'Failed to load financial summary' });
    }
  }
);

// ─── PROJECT-LEVEL FINANCE WITH BUDGET WARNINGS ───
router.get('/project/:projectId',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER', 'CEO'),
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const project = await Project.findByPk(projectId);
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      const records = await FinancialRecord.findAll({
        where: { projectId },
        include: [
          { model: Sheet, as: 'sheet', attributes: ['id', 'name'] },
          { model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
        ],
        order: [['year', 'DESC'], ['quarter', 'DESC'], ['createdAt', 'DESC']],
      });

      const totalExpenses = records.reduce((sum, r) => sum + parseFloat(r.expenses || 0) + parseFloat(r.operationalCost || 0), 0);
      const totalRevenue = records.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0);
      const totalProfit = records.reduce((sum, r) => sum + parseFloat(r.profit || 0), 0);

      const estimatedBudget = parseFloat(project.estimatedBudget || 0);
      const budget = parseFloat(project.budget || 0);
      const effectiveBudget = estimatedBudget || budget;
      const percentUsed = effectiveBudget > 0 ? (totalExpenses / effectiveBudget) * 100 : 0;

      let budgetStatus = 'OK';
      if (percentUsed >= 100) budgetStatus = 'EXCEEDED';
      else if (percentUsed >= 90) budgetStatus = 'CRITICAL';
      else if (percentUsed >= 80) budgetStatus = 'WARNING';

      // Per-sheet breakdown
      const sheetBreakdown = {};
      for (const record of records) {
        const sid = record.sheetId || 'unassigned';
        if (!sheetBreakdown[sid]) {
          sheetBreakdown[sid] = {
            sheetId: record.sheetId,
            sheetName: record.sheet ? record.sheet.name : 'General / Unassigned',
            totalExpenses: 0, totalRevenue: 0, recordCount: 0,
          };
        }
        sheetBreakdown[sid].totalExpenses += parseFloat(record.expenses || 0) + parseFloat(record.operationalCost || 0);
        sheetBreakdown[sid].totalRevenue += parseFloat(record.revenue || 0);
        sheetBreakdown[sid].recordCount++;
      }

      res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          estimatedBudget: effectiveBudget,
          startDate: project.startDate,
          endDate: project.endDate,
        },
        summary: {
          totalExpenses,
          totalRevenue,
          totalProfit,
          percentUsed: Math.round(percentUsed * 10) / 10,
          budgetStatus,
          remaining: effectiveBudget - totalExpenses,
        },
        sheetBreakdown: Object.values(sheetBreakdown),
        records,
      });
    } catch (error) {
      logger.error('Project finance error:', error);
      res.status(500).json({ success: false, message: 'Failed to load project finance' });
    }
  }
);

// ─── QUARTERLY BREAKDOWN FOR A PROJECT ───
router.get('/project/:projectId/quarterly',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER', 'CEO'),
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const project = await Project.findByPk(projectId);
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      const records = await FinancialRecord.findAll({
        where: { projectId },
        order: [['year', 'ASC'], ['quarter', 'ASC']],
      });

      // Group by quarter
      const quarterMap = {};
      for (const record of records) {
        const key = `${record.year}-Q${record.quarter}`;
        if (!quarterMap[key]) {
          quarterMap[key] = {
            year: record.year,
            quarter: record.quarter,
            label: key,
            totalRevenue: 0,
            totalExpenses: 0,
            totalOperationalCost: 0,
            totalProfit: 0,
            recordCount: 0,
          };
        }
        quarterMap[key].totalRevenue += parseFloat(record.revenue || 0);
        quarterMap[key].totalExpenses += parseFloat(record.expenses || 0);
        quarterMap[key].totalOperationalCost += parseFloat(record.operationalCost || 0);
        quarterMap[key].totalProfit += parseFloat(record.profit || 0);
        quarterMap[key].recordCount++;
      }

      // Determine which quarters the project spans
      const startDate = project.startDate ? new Date(project.startDate) : null;
      const endDate = project.endDate ? new Date(project.endDate) : null;
      const projectQuarters = [];

      if (startDate && endDate) {
        let current = new Date(startDate);
        while (current <= endDate) {
          const q = Math.ceil((current.getMonth() + 1) / 3);
          const y = current.getFullYear();
          const key = `${y}-Q${q}`;
          if (!projectQuarters.find(pq => pq.label === key)) {
            projectQuarters.push({
              year: y,
              quarter: q,
              label: key,
              ...(quarterMap[key] || {
                totalRevenue: 0, totalExpenses: 0, totalOperationalCost: 0,
                totalProfit: 0, recordCount: 0,
              }),
            });
          }
          current.setMonth(current.getMonth() + 3);
        }
      }

      // Budget per quarter (estimated budget / number of project quarters)
      const estimatedBudget = parseFloat(project.estimatedBudget || project.budget || 0);
      const numQuarters = projectQuarters.length || 1;
      const budgetPerQuarter = estimatedBudget / numQuarters;

      const quarterlyData = (projectQuarters.length > 0 ? projectQuarters : Object.values(quarterMap)).map(q => {
        const spent = q.totalExpenses + q.totalOperationalCost;
        return {
          ...q,
          budgetPerQuarter: Math.round(budgetPerQuarter * 100) / 100,
          totalSpent: spent,
          overBudget: spent > budgetPerQuarter,
          percentOfQuarterBudget: budgetPerQuarter > 0 ? Math.round((spent / budgetPerQuarter) * 1000) / 10 : 0,
        };
      });

      res.json({
        success: true,
        project: {
          id: project.id, name: project.name,
          estimatedBudget, startDate: project.startDate, endDate: project.endDate,
        },
        budgetPerQuarter: Math.round(budgetPerQuarter * 100) / 100,
        quarterlyData,
      });
    } catch (error) {
      logger.error('Quarterly finance error:', error);
      res.status(500).json({ success: false, message: 'Failed to load quarterly data' });
    }
  }
);

// ─── PER-SHEET FINANCE ───
router.get('/sheet/:sheetId',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER', 'CEO'),
  async (req, res) => {
    try {
      const { sheetId } = req.params;
      const sheet = await Sheet.findByPk(sheetId, {
        include: [{ model: Project, as: 'project', attributes: ['id', 'name', 'estimatedBudget', 'budget'] }],
      });
      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      const records = await FinancialRecord.findAll({
        where: { sheetId },
        include: [
          { model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
        ],
        order: [['year', 'DESC'], ['quarter', 'DESC'], ['createdAt', 'DESC']],
      });

      const totalExpenses = records.reduce((sum, r) => sum + parseFloat(r.expenses || 0) + parseFloat(r.operationalCost || 0), 0);
      const totalRevenue = records.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0);

      res.json({
        success: true,
        sheet: { id: sheet.id, name: sheet.name },
        project: sheet.project ? { id: sheet.project.id, name: sheet.project.name } : null,
        summary: { totalExpenses, totalRevenue, recordCount: records.length },
        records,
      });
    } catch (error) {
      logger.error('Sheet finance error:', error);
      res.status(500).json({ success: false, message: 'Failed to load sheet finance' });
    }
  }
);

// ─── GET ALL FINANCIAL RECORDS (with filters) ───
router.get('/',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'CEO', 'PROJECT_MANAGER'),
  async (req, res) => {
    try {
      const { year, quarter, projectId, sheetId } = req.query;
      const where = {};
      if (year) where.year = parseInt(year);
      if (quarter) where.quarter = parseInt(quarter);
      if (projectId) where.projectId = projectId;
      if (sheetId) where.sheetId = sheetId;

      const records = await FinancialRecord.findAll({
        where,
        include: [
          { model: Project, as: 'project', attributes: ['id', 'name'], required: false },
          { model: Sheet, as: 'sheet', attributes: ['id', 'name'], required: false },
          { model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'], required: false },
        ],
        order: [['year', 'DESC'], ['quarter', 'DESC']],
      });

      res.json({
        success: true,
        records,
        count: records.length,
      });
    } catch (error) {
      logger.error('Get finance records error:', error);
      res.status(500).json({ success: false, message: 'Failed to load financial records' });
    }
  }
);

// ─── GET SINGLE RECORD ───
router.get('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'CEO', 'PROJECT_MANAGER'),
  async (req, res) => {
    try {
      const record = await FinancialRecord.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }
      res.json({ success: true, record });
    } catch (error) {
      logger.error('Get finance record error:', error);
      res.status(500).json({ success: false, message: 'Failed to load record' });
    }
  }
);

// ─── CREATE FINANCIAL RECORD ───
router.post('/',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER'),
  [
    body('quarter').isInt({ min: 1, max: 4 }),
    body('year').isInt({ min: 2020, max: 2100 }),
    body('revenue').isFloat({ min: 0 }),
    body('expenses').optional().isFloat({ min: 0 }),
    body('profit').optional().isFloat(),
    body('operationalCost').optional().isFloat({ min: 0 }),
    body('margin').optional().isFloat(),
    body('notes').optional().isString(),
    body('projectId').optional().isUUID(),
    body('sheetId').optional().isUUID(),
    body('category').optional().isString(),
    body('description').optional().isString(),
  ],
  auditLog('CREATE_FINANCIAL_RECORD', 'FINANCE'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const {
        quarter, year, revenue, expenses, profit, operationalCost,
        margin, notes, recordDate, projectId, sheetId, category, description,
      } = req.body;

      const calcProfit = profit !== undefined ? profit : (revenue - (expenses || 0));
      const calcMargin = margin !== undefined ? margin : (revenue > 0 ? (calcProfit / revenue) * 100 : 0);

      const record = await FinancialRecord.create({
        quarter,
        year,
        revenue,
        expenses: expenses || 0,
        profit: calcProfit,
        operationalCost: operationalCost || 0,
        margin: calcMargin,
        notes: notes || '',
        recordDate: recordDate || new Date(),
        projectId: projectId || null,
        sheetId: sheetId || null,
        category: category || 'GENERAL',
        description: description || null,
        createdById: req.user.id,
      });

      // If linked to a project, update actualCost and check budget warnings
      if (projectId) {
        try {
          const project = await Project.findByPk(projectId);
          if (project) {
            const allProjectRecords = await FinancialRecord.findAll({ where: { projectId } });
            const totalSpent = allProjectRecords.reduce(
              (sum, r) => sum + parseFloat(r.expenses || 0) + parseFloat(r.operationalCost || 0), 0
            );
            await project.update({ actualCost: totalSpent });

            const estBudget = parseFloat(project.estimatedBudget || project.budget || 0);
            if (estBudget > 0) {
              const pctUsed = (totalSpent / estBudget) * 100;
              if (pctUsed >= 90) {
                logger.warn(`⚠️ BUDGET WARNING: Project "${project.name}" at ${pctUsed.toFixed(1)}% of budget (₹${totalSpent} / ₹${estBudget})`);
              }
            }
          }
        } catch (budgetErr) {
          logger.warn('Budget update after finance create failed:', budgetErr.message);
        }
      }

      logger.info(`Financial record created: Q${quarter} ${year}, project=${projectId || 'none'}, sheet=${sheetId || 'none'} by user ${req.user.id}`);

      res.status(201).json({
        success: true,
        message: 'Financial record created',
        record,
      });
    } catch (error) {
      logger.error('Create finance record error:', error);
      res.status(500).json({ success: false, message: 'Failed to create record', error: error.message });
    }
  }
);

// ─── UPDATE FINANCIAL RECORD ───
router.put('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER'),
  [
    body('quarter').optional().isInt({ min: 1, max: 4 }),
    body('year').optional().isInt({ min: 2020, max: 2100 }),
    body('revenue').optional().isFloat({ min: 0 }),
    body('expenses').optional().isFloat({ min: 0 }),
    body('profit').optional().isFloat(),
    body('operationalCost').optional().isFloat({ min: 0 }),
    body('margin').optional().isFloat(),
    body('notes').optional().isString(),
    body('projectId').optional(),
    body('sheetId').optional(),
    body('category').optional().isString(),
    body('description').optional().isString(),
  ],
  auditLog('UPDATE_FINANCIAL_RECORD', 'FINANCE'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const record = await FinancialRecord.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      const updateData = {};
      const fields = [
        'quarter', 'year', 'revenue', 'expenses', 'profit', 'operationalCost',
        'margin', 'notes', 'recordDate', 'projectId', 'sheetId', 'category', 'description',
      ];
      fields.forEach(f => {
        if (req.body[f] !== undefined) updateData[f] = req.body[f];
      });

      if (updateData.revenue !== undefined || updateData.expenses !== undefined) {
        const rev = updateData.revenue !== undefined ? updateData.revenue : parseFloat(record.revenue);
        const exp = updateData.expenses !== undefined ? updateData.expenses : parseFloat(record.expenses);
        if (updateData.profit === undefined) updateData.profit = rev - exp;
        if (updateData.margin === undefined) updateData.margin = rev > 0 ? ((rev - exp) / rev) * 100 : 0;
      }

      await record.update(updateData);

      const pid = record.projectId;
      if (pid) {
        try {
          const project = await Project.findByPk(pid);
          if (project) {
            const allProjectRecords = await FinancialRecord.findAll({ where: { projectId: pid } });
            const totalSpent = allProjectRecords.reduce(
              (sum, r) => sum + parseFloat(r.expenses || 0) + parseFloat(r.operationalCost || 0), 0
            );
            await project.update({ actualCost: totalSpent });
          }
        } catch (err) {
          logger.warn('Budget recalc on update failed:', err.message);
        }
      }

      logger.info(`Financial record ${req.params.id} updated by user ${req.user.id}`);

      res.json({
        success: true,
        message: 'Financial record updated',
        record,
      });
    } catch (error) {
      logger.error('Update finance record error:', error);
      res.status(500).json({ success: false, message: 'Failed to update record', error: error.message });
    }
  }
);

// ─── DELETE FINANCIAL RECORD ───
router.delete('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER'),
  auditLog('DELETE_FINANCIAL_RECORD', 'FINANCE'),
  async (req, res) => {
    try {
      const record = await FinancialRecord.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      const pid = record.projectId;
      await record.destroy();

      if (pid) {
        try {
          const project = await Project.findByPk(pid);
          if (project) {
            const remaining = await FinancialRecord.findAll({ where: { projectId: pid } });
            const totalSpent = remaining.reduce(
              (sum, r) => sum + parseFloat(r.expenses || 0) + parseFloat(r.operationalCost || 0), 0
            );
            await project.update({ actualCost: totalSpent });
          }
        } catch (err) {
          logger.warn('Budget recalc on delete failed:', err.message);
        }
      }

      logger.info(`Financial record ${req.params.id} deleted by user ${req.user.id}`);

      res.json({ success: true, message: 'Financial record deleted' });
    } catch (error) {
      logger.error('Delete finance record error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete record', error: error.message });
    }
  }
);

// ─── UPDATE PROJECT ESTIMATED BUDGET ───
router.put('/project/:projectId/budget',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER'),
  [
    body('estimatedBudget').isFloat({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const project = await Project.findByPk(req.params.projectId);
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      await project.update({ estimatedBudget: req.body.estimatedBudget });

      logger.info(`Project ${project.id} estimated budget updated to ₹${req.body.estimatedBudget}`);

      res.json({
        success: true,
        message: 'Estimated budget updated',
        estimatedBudget: req.body.estimatedBudget,
      });
    } catch (error) {
      logger.error('Update project budget error:', error);
      res.status(500).json({ success: false, message: 'Failed to update budget' });
    }
  }
);

module.exports = router;
