// ================================================================
// SHEET ASSIGNMENT MODEL (models/SheetAssignment.js) → 'sheet_assignments' table
// ================================================================
// PURPOSE: The TASK SYSTEM — tracks which users/roles are assigned to which sheets.
//
// WORKFLOW:
//   1. Admin creates a sheet with columns and rows
//   2. Admin assigns specific rows/columns/cells to users
//   3. Admin can include a QUESTION (instruction for the user)
//   4. User fills in their assigned cells and RESPONDS
//   5. Admin reviews and approves/rejects
//
// This is the "Q&A" feature:
//   - question: "What is the concrete quantity for Block A?"
//   - assignedRows: [1, 2, 3]  (user can only edit these rows)
//   - assignedColumns: ["A", "B"]  (user can only edit these columns)
//   - response: { values: {A1: "500kg"}, note: "Measured on site" }
//   - status: PENDING → IN_PROGRESS → SUBMITTED → APPROVED
//
// USED BY: routes/assignments.js (not present but referenced), routes/sheets.js (push to roles)
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SheetAssignment = sequelize.define('SheetAssignment', {
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
  userId: {
    type: DataTypes.UUID,
    allowNull: true, // null when assigning by role only
    references: {
      model: 'users',
      key: 'id',
    },
  },
  assignedRole: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Role-based assignment (L2_SENIOR_ENGINEER, L3_JUNIOR_ENGINEER, GROUND_MANAGER etc.)',
  },
  assignedById: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
    comment: 'The admin user who made this assignment'
  },
  assignmentType: {
    type: DataTypes.STRING,
    defaultValue: 'SHEET',
    comment: 'SHEET | ROW | COLUMN | CELL - granularity of assignment',
  },
  assignedRows: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of row numbers assigned, e.g. [1, 2, 5]',
  },
  assignedColumns: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of column letters assigned, e.g. ["A", "B", "D"]',
  },
  assignedCells: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of specific cell IDs assigned, e.g. ["A1", "B3"]',
  },
  question: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Question/instruction from admin for this assignment',
  },
  response: {
    type: DataTypes.JSONB,
    defaultValue: null,
    comment: 'Response data from the assigned user: { values: {cellId: value}, note: "", submittedAt: "" }',
  },
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {
      canEdit: true,
      canView: true,
      canComment: true,
      canShare: false,
      cellPermissions: {}
    },
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'PENDING',
    comment: 'PENDING | IN_PROGRESS | SUBMITTED | APPROVED | REJECTED | REVOKED',
  },
  priority: {
    type: DataTypes.STRING,
    defaultValue: 'MEDIUM',
    comment: 'LOW | MEDIUM | HIGH | URGENT',
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Optional deadline for this assignment',
  },
  assignedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  respondedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  lastAccessedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Admin notes about this assignment'
  },
}, {
  tableName: 'sheet_assignments',
  indexes: [
    {
      fields: ['sheet_id'],
    },
    {
      fields: ['user_id'],
    },
    {
      fields: ['assigned_role'],
    },
    {
      fields: ['assigned_by_id'],
    },
    {
      fields: ['status'],
    },
    {
      fields: ['assignment_type'],
    },
  ],
});

module.exports = SheetAssignment;