// ================================================================
// FINANCIAL RECORD MODEL (models/FinancialRecord.js) → 'financial_records' table
// ================================================================
// PURPOSE: Stores financial data at company, project, or sheet level.
//
// Used by:
//   - CEO dashboard for overall financial trends
//   - Admin dashboard for per-project / per-sheet expense tracking
//   - Budget exceed warnings when project costs approach estimates
//
// Optional foreign keys: projectId and sheetId allow records to be
// linked to specific projects/sheets. Company-level records have both as null.
//
// USED BY: services/AnalyticsService.js, routes/finance.js
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FinancialRecord = sequelize.define('FinancialRecord', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'projects',
      key: 'id',
    },
    comment: 'Optional — links record to a project',
  },
  sheetId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'sheets',
      key: 'id',
    },
    comment: 'Optional — links record to a sheet within a project',
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'GENERAL',
    comment: 'MATERIAL, LABOR, EQUIPMENT, SUBCONTRACTOR, OVERHEAD, GENERAL',
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  quarter: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 4,
    },
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  revenue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
  },
  profit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
  },
  margin: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Profit margin percentage',
  },
  operationalCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
  },
  expenses: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
  },
  recordDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: true,
  tableName: 'financial_records',
  indexes: [
    { fields: ['project_id'] },
    { fields: ['sheet_id'] },
    { fields: ['quarter', 'year'] },
  ],
});

module.exports = FinancialRecord;
