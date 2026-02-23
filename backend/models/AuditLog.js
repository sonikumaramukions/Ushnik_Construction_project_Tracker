// ================================================================
// AUDIT LOG MODEL (models/AuditLog.js) → 'audit_logs' table
// ================================================================
// PURPOSE: Records every important action in the system for security & tracking.
//
// Like a security camera for your app:
//   - WHO did it (userId)
//   - WHAT they did (action: CREATE, UPDATE, DELETE, LOGIN)
//   - WHAT was affected (resource: 'sheet', 'user', 'cell')
//   - WHEN (timestamp)
//   - FROM WHERE (ipAddress, userAgent)
//   - WHAT CHANGED (oldValues → newValues)
//
// USED BY: middleware/audit.js (automatic), admin dashboard (viewing logs)
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  resource: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  resourceId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  oldValues: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  newValues: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  ipAddress: {
    type: DataTypes.INET,
    allowNull: true,
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'audit_logs',
  indexes: [
    {
      fields: ['user_id'],
    },
    {
      fields: ['action'],
    },
    {
      fields: ['resource'],
    },
    {
      fields: ['resource_id'],
    },
    {
      fields: ['created_at'],
    },
  ],
});

module.exports = AuditLog;