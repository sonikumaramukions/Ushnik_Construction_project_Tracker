// ================================================================
// CELL DATA MODEL (models/CellData.js) → 'cell_data' table
// ================================================================
// PURPOSE: Stores the VALUE of every cell in every sheet.
//
// Think of it like this:
//   Sheet = the entire spreadsheet
//   CellData = one cell within that spreadsheet (e.g., cell B3)
//
// Each cell stores:
//   - cellId: e.g., 'B3' (column B, row 3)
//   - value: the text/number the user typed
//   - numericValue: parsed number (for formula calculations)
//   - dataType: TEXT, NUMBER, DATE, BOOLEAN, FILE, FORMULA
//   - status: DRAFT → SUBMITTED → APPROVED / REJECTED
//   - isLocked: admin can lock cells to prevent editing
//   - createdById / lastModifiedById: who touched this cell
//
// USED BY: routes/data.js (cell CRUD), formula engine, sheet view
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CellData = sequelize.define('CellData', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  sheetId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'sheets',
      key: 'id',
    },
  },
  cellId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  rowIndex: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  columnIndex: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  numericValue: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: true,
  },
  dataType: {
    type: DataTypes.ENUM('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'FILE', 'FORMULA'),
    defaultValue: 'TEXT',
  },
  status: {
    type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'),
    defaultValue: 'DRAFT',
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  lastModifiedById: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  approvedById: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Cell locking — admin can lock cells so no one can edit them
  isLocked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  lockedById: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  lockedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'cell_data',
  indexes: [
    {
      unique: true,
      fields: ['sheet_id', 'cell_id'],
    },
    {
      fields: ['sheet_id', 'row_index', 'column_index'],
    },
    {
      fields: ['status'],
    },
    {
      fields: ['created_by_id'],
    },
  ],
});

module.exports = CellData;