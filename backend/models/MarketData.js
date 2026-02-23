// ================================================================
// MARKET DATA MODEL (models/MarketData.js) → 'market_data' table
// ================================================================
// PURPOSE: Stores construction industry market data for CEO analytics.
//
// Used by the CEO dashboard to show "Market Share" percentage.
// Tracks industry segments (residential, commercial, infrastructure)
// with market values, growth rates, and active project counts.
//
// No foreign keys — this is external market data, not project-specific.
//
// USED BY: services/AnalyticsService.js (getMarketShare)
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MarketData = sequelize.define('MarketData', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
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
  industrySegment: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'e.g., residential, commercial, infrastructure',
  },
  totalMarketValue: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
  },
  averageProjectValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
  },
  numberOfActiveProjects: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  growthRate: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Market growth rate percentage',
  },
  source: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Data source (e.g., government report, industry analyst)',
  },
  notes: {
    type: DataTypes.TEXT,
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
  tableName: 'market_data',
});

module.exports = MarketData;
