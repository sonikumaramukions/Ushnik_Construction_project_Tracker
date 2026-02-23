// ================================================================
// PROJECT MODEL (models/Project.js) → 'projects' table
// ================================================================
// PURPOSE: Represents a construction project (e.g., "Highway Bridge Phase 2").
//
// Projects are the TOP-LEVEL container:
//   Project → has many Sheets → each Sheet has many Cells
//
// Fields include:
//   - name, description, location
//   - status: PLANNING → IN_PROGRESS → COMPLETED
//   - priority: LOW / MEDIUM / HIGH / CRITICAL
//   - budget & actualCost (for CEO financial tracking)
//   - progressPercentage (0-100%)
//
// USED BY: routes/projects.js, CEO dashboard, admin dashboard
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Project = sequelize.define('Project', {
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
  location: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'),
    defaultValue: 'PLANNING',
  },
  priority: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
    defaultValue: 'MEDIUM',
  },
  budget: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
  },
  estimatedBudget: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: 'Estimated total budget — triggers warnings when actualCost approaches this',
  },
  actualCost: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  progressPercentage: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100,
    },
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
}, {
  tableName: 'projects',
  indexes: [
    {
      fields: ['status'],
    },
    {
      fields: ['priority'],
    },
    {
      fields: ['created_by_id'],
    },
    {
      fields: ['start_date'],
    },
  ],
});

module.exports = Project;