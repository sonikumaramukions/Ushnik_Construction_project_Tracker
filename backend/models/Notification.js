// ================================================================
// NOTIFICATION MODEL (models/Notification.js) → 'notifications' table
// ================================================================
// PURPOSE: Persistent notifications that survive page refresh.
//
// When something important happens (task assigned, cell approved, etc.),
// a notification is created here AND sent via Socket.io for real-time.
// Even if the user is offline, they'll see it when they log back in.
//
// Types:
//   SHEET_ASSIGNED, TASK_ASSIGNED, TASK_RESPONSE, TASK_SENT,
//   SHEET_UPDATED, REPORT_GENERATED, CELL_APPROVED, CELL_REJECTED,
//   SHEET_LOCKED, SHEET_UNLOCKED, GENERAL
//
// USED BY: services/NotificationService.js, routes/dashboards.js (notification bell)
// ================================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('Notification', {
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
        onDelete: 'CASCADE',
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'SHEET_ASSIGNED, TASK_ASSIGNED, TASK_RESPONSE, SHEET_UPDATED, REPORT_GENERATED, CELL_APPROVED, CELL_REJECTED, SHEET_LOCKED, SHEET_UNLOCKED, GENERAL',
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    data: {
        type: DataTypes.JSONB,
        defaultValue: {},
        comment: 'Additional data like sheetId, reportId, etc.',
    },
    isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    readAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    priority: {
        type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT'),
        defaultValue: 'MEDIUM',
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Optional expiration date for temporary notifications',
    },
}, {
    tableName: 'notifications',
    indexes: [
        {
            fields: ['user_id'],
        },
        {
            fields: ['user_id', 'is_read'],
            name: 'idx_notifications_user_read',
        },
        {
            fields: ['type'],
        },
        {
            fields: ['created_at'],
        },
        {
            fields: ['priority'],
        },
    ],
});

module.exports = Notification;
