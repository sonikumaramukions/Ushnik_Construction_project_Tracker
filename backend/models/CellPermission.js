// ================================================================
// CELL PERMISSION MODEL (models/CellPermission.js) → 'cell_permissions' table
// ================================================================
// PURPOSE: Controls WHO can VIEW or EDIT specific individual cells.
//
// This is the FINEST level of access control:
//   Project → Sheet → Role Permission → Cell Permission
//
// Example: Cell A3 in a salary sheet might be visible only to Admin and CEO,
// but hidden from Engineers. This table makes that possible.
//
// Fields:
//   - canViewRoles / canViewUsers: who can SEE this cell
//   - canEditRoles / canEditUsers: who can CHANGE this cell
//   - isLocked: admin hard-lock (overrides everything)
//
// USED BY: middleware/cellPermission.js, services/CellPermissionService.js
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CellPermission = sequelize.define('CellPermission', {
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
    cellId: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: 'Cell identifier like A1, B2, etc.',
    },
    // View permissions
    canViewRoles: {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'Array of role names that can view this cell',
    },
    canViewUsers: {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'Array of user IDs that can view this cell',
    },
    // Edit permissions
    canEditRoles: {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'Array of role names that can edit this cell',
    },
    canEditUsers: {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'Array of user IDs that can edit this cell',
    },
    // Metadata
    isLocked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'If true, no one can edit (admin lock)',
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Optional notes about this cell permission',
    },
}, {
    tableName: 'cell_permissions',
    indexes: [
        {
            fields: ['sheet_id'],
        },
        {
            fields: ['sheet_id', 'cell_id'],
            unique: true,
        },
    ],
});

module.exports = CellPermission;
