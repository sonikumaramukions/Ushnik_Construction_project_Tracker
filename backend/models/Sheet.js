// ================================================================
// SHEET MODEL (models/Sheet.js) → 'sheets' table
// ================================================================
// PURPOSE: The CORE of the application — represents an Excel-like spreadsheet.
//
// Each sheet belongs to a project and contains:
//   - structure: column/row definitions (like Excel headers)
//   - formulas: cell formulas (SUM, AVG, etc.)
//   - permissions: which roles can view/edit
//   - status: DRAFT → ACTIVE → LOCKED → ARCHIVED
//
// WORKFLOW:
//   1. Admin creates a sheet (DRAFT)
//   2. Admin pushes it to roles/users (ACTIVE)
//   3. Assigned users fill in their cells
//   4. Admin can lock the sheet when done (LOCKED)
//
// USED BY: routes/sheets.js, routes/data.js, services/SheetService.js
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Sheet = sequelize.define('Sheet', {
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
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'projects',
      key: 'id',
    },
  },
  structure: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      columns: [],
      rows: [],
      cells: {},
    },
  },
  permissions: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  validationRules: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  formulas: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Cell formulas stored as {cellId: formula} - supports SUM, AVG, MIN, MAX, etc.'
  },
  status: {
    type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'LOCKED', 'ARCHIVED'),
    defaultValue: 'DRAFT',
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  isTemplate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  templateId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'sheets',
      key: 'id',
    },
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
  lockedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  lockedById: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  assignedUsers: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of user IDs who are assigned to this sheet'
  },
  assignedRoles: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of roles who have access to this sheet'
  },
  collaborationSettings: {
    type: DataTypes.JSONB,
    defaultValue: {
      allowSimultaneousEditing: true,
      lockCells: false,
      requireApproval: false
    },
    comment: 'Settings for collaborative editing'
  },
  lastSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last time this sheet was synced back to admin'
  },
}, {
  tableName: 'sheets',
  indexes: [
    {
      fields: ['project_id'],
    },
    {
      fields: ['status'],
    },
    {
      fields: ['is_template'],
    },
    {
      fields: ['created_by_id'],
    },
  ],
});

module.exports = Sheet;