// ================================================================
// USER MODEL (models/User.js) → 'users' table
// ================================================================
// PURPOSE: Stores all user accounts in the system.
//
// EVERY person who logs in has a row in this table:
//   - Head Officer (L1_ADMIN) — full system control
//   - Senior Engineer (L2_SENIOR_ENGINEER) — manages sheets and teams
//   - Junior Engineer (L3_JUNIOR_ENGINEER) — fills in assigned data
//   - Project Manager (PROJECT_MANAGER) — oversees projects
//   - Ground Manager (GROUND_MANAGER) — site supervisor, mobile-first
//   - CEO — view-only executive dashboard
//
// USED BY: Login (routes/auth.js), user management, permissions, everywhere
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM(
      'L1_ADMIN',
      'L2_SENIOR_ENGINEER', 
      'L3_JUNIOR_ENGINEER',
      'PROJECT_MANAGER',
      'GROUND_MANAGER',
      'CEO'
    ),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatar: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  mustChangePassword: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  preferences: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'users',
  indexes: [
    {
      unique: true,
      fields: ['email'],
    },
    {
      fields: ['role'],
    },
    {
      fields: ['is_active'],
    },
  ],
});

module.exports = User;