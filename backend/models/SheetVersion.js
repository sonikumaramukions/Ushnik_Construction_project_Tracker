// ================================================================
// SHEET VERSION MODEL (models/SheetVersion.js) → 'sheet_versions' table
// ================================================================
// PURPOSE: Stores a SNAPSHOT of a sheet every time it changes (version history).
//
// Like "undo" in Google Docs — you can see every previous version.
//
// Each version records:
//   - version: incrementing number (1, 2, 3...)
//   - structure: snapshot of columns/rows at that point
//   - cellDataSnapshot: all cell values at that point
//   - changeType: STRUCTURE_CHANGE, DATA_UPDATE, PERMISSION_CHANGE, STATUS_CHANGE
//   - changeDescription: human-readable "Added 3 rows" or "Updated cell B5"
//   - changedById: who made the change
//
// USED BY: services/SheetService.js (createVersionSnapshot), sheet view page
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SheetVersion = sequelize.define('SheetVersion', {
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
    version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Version number, increments with each change',
    },
    structure: {
        type: DataTypes.JSONB,
        allowNull: false,
        comment: 'Snapshot of sheet structure at this version',
    },
    cellDataSnapshot: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Snapshot of all cell values at this version',
    },
    permissions: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Snapshot of permissions at this version',
    },
    changedById: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
    },
    changeType: {
        type: DataTypes.ENUM('STRUCTURE_CHANGE', 'DATA_UPDATE', 'PERMISSION_CHANGE', 'STATUS_CHANGE'),
        allowNull: false,
    },
    changeDescription: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Human-readable description of what changed',
    },
    changeSummary: {
        type: DataTypes.JSONB,
        defaultValue: {},
        comment: 'Detailed summary of changes (added/removed/modified cells, etc.)',
    },
}, {
    tableName: 'sheet_versions',
    indexes: [
        {
            fields: ['sheet_id'],
        },
        {
            fields: ['sheet_id', 'version'],
            unique: true,
            name: 'unique_sheet_version',
        },
        {
            fields: ['changed_by_id'],
        },
        {
            fields: ['change_type'],
        },
        {
            fields: ['created_at'],
        },
    ],
});

module.exports = SheetVersion;
