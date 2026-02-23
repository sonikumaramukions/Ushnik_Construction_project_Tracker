// ================================================================
// FEEDBACK MODEL (models/Feedback.js) → 'feedbacks' table
// ================================================================
// PURPOSE: Stores client satisfaction ratings for projects.
//
// Used by the CEO dashboard to show "Client Satisfaction Score".
// Each feedback has a rating (1-5 stars) and optional comment.
//
// Categories: quality, timeliness, communication, budget_adherence, overall
//
// USED BY: services/AnalyticsService.js (CEO executive metrics)
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Feedback = sequelize.define('Feedback', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  clientName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  rating: {
    type: DataTypes.FLOAT,
    allowNull: false,
    validate: {
      min: 1,
      max: 5,
    },
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  category: {
    type: DataTypes.ENUM('quality', 'timeliness', 'communication', 'budget_adherence', 'overall'),
    allowNull: true,
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
  tableName: 'feedbacks',
});

module.exports = Feedback;
