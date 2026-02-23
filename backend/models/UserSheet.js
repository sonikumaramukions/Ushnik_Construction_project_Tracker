// ================================================================
// USER SHEET MODEL (models/UserSheet.js) → 'user_sheets' table
// ================================================================
// PURPOSE: Junction table that tracks which users have access to which sheets.
//
// When an admin "pushes" a sheet to a user, a UserSheet record is created.
// This is how the system knows which sheets to show on each user's dashboard.
//
// Tracks:
//   - status: pending → in_progress → completed → submitted
//   - cellChanges: which cells the user modified
//   - notes: user's comments about their work
//   - submittedAt: when they clicked "Submit for Review"
//
// USED BY: routes/userSheets.js (user's assigned sheets), services/SheetService.js
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserSheet = sequelize.define('UserSheet', {
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
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    status: {
        type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'submitted'),
        defaultValue: 'pending',
        comment: 'Status of user work on this sheet',
    },
    lastModified: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When user last modified this sheet',
    },
    submittedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When user submitted their changes',
    },
    cellChanges: {
        type: DataTypes.JSONB,
        defaultValue: {},
        comment: 'Track which cells were changed by this user',
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'User notes or comments about their work',
    },
}, {
    tableName: 'user_sheets',
    indexes: [
        {
            fields: ['user_id'],
        },
        {
            fields: ['sheet_id'],
        },
        {
            fields: ['user_id', 'sheet_id'],
            unique: true,
        },
        {
            fields: ['status'],
        },
    ],
});

module.exports = UserSheet;
