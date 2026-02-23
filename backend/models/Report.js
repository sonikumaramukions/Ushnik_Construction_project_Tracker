// ================================================================
// REPORT MODEL (models/Report.js) → 'reports' table
// ================================================================
// PURPOSE: Stores generated reports for CEO viewing.
//
// WORKFLOW:
//   1. Admin generates a report from a sheet's data
//   2. Report is saved with all cell data, calculations, and metadata
//   3. CEO can view the report on their dashboard
//   4. CEO can download it as an Excel file
//
// Fields:
//   - reportData: full snapshot of the sheet data and calculations
//   - metadata: project name, location, date context
//   - status: DRAFT → PUBLISHED → ARCHIVED
//   - downloadCount: tracks how many times CEO downloaded it
//
// USED BY: routes/reports.js, routes/ceoReports.js, services/ReportService.js
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Report = sequelize.define('Report', {
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
        onDelete: 'CASCADE',
    },
    projectId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'projects',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    reportData: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Structured report content including sheet data, calculations, and summaries',
    },
    metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
        comment: 'Project name, location, date, and other contextual information',
    },
    status: {
        type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED'),
        defaultValue: 'DRAFT',
    },
    generatedById: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
    },
    generatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    downloadCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Track how many times this report has been downloaded',
    },
    lastDownloadedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'reports',
    indexes: [
        {
            fields: ['sheet_id'],
        },
        {
            fields: ['project_id'],
        },
        {
            fields: ['generated_by_id'],
        },
        {
            fields: ['status'],
        },
        {
            fields: ['generated_at'],
        },
        {
            fields: ['project_id', 'status'],
            name: 'idx_reports_project_status',
        },
    ],
});

module.exports = Report;
