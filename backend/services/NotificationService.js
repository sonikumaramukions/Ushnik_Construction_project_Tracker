// ================================================================
// NOTIFICATION SERVICE (services/NotificationService.js)
// ================================================================
// PURPOSE: Manages real-time (Socket.io) AND persistent (DB) notifications.
//
// TWO NOTIFICATION CHANNELS:
//   1. Real-time: Socket.io push (instant, but lost on page refresh)
//   2. Persistent: Saved to notifications DB table (survives refresh)
//   notify() sends BOTH at once.
//
// METHODS:
//   sendRealTime()        — Socket.io only (instant push)
//   createPersistent()    — DB only (survives refresh)
//   notify()              — Both real-time + persistent
//   getUnread()           — Get unread notifications for a user
//   getAll()              — Get all notifications with limit
//   markAsRead()          — Mark one notification as read
//   markAllAsRead()       — Mark all as read for a user
//   notifyCEO()           — Notify all CEO users about a report
//   notifyAssignment()    — Notify user about sheet assignment
//   notifyCellApproval()  — Notify about cell approval/rejection
//   cleanupOld()          — Delete old read notifications
//
// USED BY: routes/dashboards.js (bell icon), services/ReportService.js, etc.
// ================================================================

const { Notification, User, sequelize } = require('../models');
const logger = require('../utils/logger');

class NotificationService {
    /**
     * Send real-time notification via Socket.io
     */
    sendRealTimeNotification(io, userId, message, data = {}) {
        try {
            if (!io) {
                logger.warn('Socket.io instance not available for real-time notification');
                return;
            }

            io.to(`user_${userId}`).emit('notification', {
                message,
                data,
                timestamp: new Date().toISOString(),
            });

            logger.info(`Real-time notification sent to user ${userId}`);
        } catch (error) {
            logger.error('Send real-time notification error:', error);
        }
    }

    /**
     * Create a persistent notification in database
     */
    async createNotification(userId, type, title, message, data = {}, priority = 'MEDIUM') {
        try {
            const notification = await Notification.create({
                userId,
                type,
                title,
                message,
                data,
                priority,
                isRead: false,
            });

            logger.info(`Notification created: ${notification.id} for user ${userId}`);
            return notification;
        } catch (error) {
            logger.error('Create notification error:', error);
            throw error;
        }
    }

    /**
     * Send both real-time and persistent notification
     */
    async sendNotification(io, userId, type, title, message, data = {}, priority = 'MEDIUM') {
        try {
            // Send real-time notification
            this.sendRealTimeNotification(io, userId, message, data);

            // Create persistent notification
            const notification = await this.createNotification(userId, type, title, message, data, priority);

            return notification;
        } catch (error) {
            logger.error('Send notification error:', error);
            throw error;
        }
    }

    /**
     * Get unread notifications for a user
     */
    async getUnreadNotifications(userId) {
        try {
            const notifications = await Notification.findAll({
                where: { userId, isRead: false },
                order: [['createdAt', 'DESC']],
            });

            return notifications;
        } catch (error) {
            logger.error('Get unread notifications error:', error);
            throw error;
        }
    }

    /**
     * Get all notifications for a user
     */
    async getAllNotifications(userId, limit = 50) {
        try {
            const notifications = await Notification.findAll({
                where: { userId },
                order: [['createdAt', 'DESC']],
                limit,
            });

            return notifications;
        } catch (error) {
            logger.error('Get all notifications error:', error);
            throw error;
        }
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId) {
        try {
            const notification = await Notification.findByPk(notificationId);
            if (!notification) {
                throw new Error('Notification not found');
            }

            if (!notification.isRead) {
                await notification.update({
                    isRead: true,
                    readAt: new Date(),
                });
            }

            return notification;
        } catch (error) {
            logger.error('Mark as read error:', error);
            throw error;
        }
    }

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId) {
        try {
            const result = await Notification.update(
                { isRead: true, readAt: new Date() },
                { where: { userId, isRead: false } }
            );

            logger.info(`Marked ${result[0]} notifications as read for user ${userId}`);
            return result[0];
        } catch (error) {
            logger.error('Mark all as read error:', error);
            throw error;
        }
    }

    /**
     * Delete a notification
     */
    async deleteNotification(notificationId) {
        try {
            const result = await Notification.destroy({
                where: { id: notificationId },
            });

            return result > 0;
        } catch (error) {
            logger.error('Delete notification error:', error);
            throw error;
        }
    }

    /**
     * Notify CEO about new report
     */
    async notifyCEOAboutReport(reportId, transaction = null) {
        try {
            // Get all CEO users
            const ceoUsers = await User.findAll({
                where: { role: 'CEO', isActive: true },
                transaction,
            });

            if (ceoUsers.length === 0) {
                logger.warn('No active CEO users found to notify');
                return [];
            }

            const notifications = await Promise.all(
                ceoUsers.map(async (ceo) => {
                    return Notification.create({
                        userId: ceo.id,
                        type: 'REPORT_GENERATED',
                        title: 'New Report Available',
                        message: 'A new project report has been generated and is ready for review.',
                        data: { reportId },
                        priority: 'HIGH',
                        isRead: false,
                    }, { transaction });
                })
            );

            logger.info(`Notified ${ceoUsers.length} CEO user(s) about report ${reportId}`);
            return notifications;
        } catch (error) {
            logger.error('Notify CEO about report error:', error);
            throw error;
        }
    }

    /**
     * Notify users about sheet assignment
     */
    async notifySheetAssignment(io, userIds, sheetId, sheetName, assignedBy) {
        try {
            const notifications = await Promise.all(
                userIds.map(async (userId) => {
                    // Send real-time notification
                    this.sendRealTimeNotification(io, userId, `You have been assigned to sheet: ${sheetName}`, {
                        sheetId,
                        sheetName,
                        assignedBy,
                    });

                    // Create persistent notification
                    return this.createNotification(
                        userId,
                        'SHEET_ASSIGNED',
                        'New Sheet Assignment',
                        `You have been assigned to work on: ${sheetName}`,
                        { sheetId, sheetName, assignedBy },
                        'MEDIUM'
                    );
                })
            );

            logger.info(`Notified ${userIds.length} user(s) about sheet assignment ${sheetId}`);
            return notifications;
        } catch (error) {
            logger.error('Notify sheet assignment error:', error);
            throw error;
        }
    }

    /**
     * Notify about cell approval/rejection
     */
    async notifyCellApproval(io, userId, cellId, action, comments = '') {
        try {
            const title = action === 'approve' ? 'Cell Data Approved' : 'Cell Data Rejected';
            const message = action === 'approve'
                ? `Your cell data for ${cellId} has been approved.`
                : `Your cell data for ${cellId} has been rejected. ${comments}`;

            // Send real-time notification
            this.sendRealTimeNotification(io, userId, message, { cellId, action, comments });

            // Create persistent notification
            const notification = await this.createNotification(
                userId,
                action === 'approve' ? 'CELL_APPROVED' : 'CELL_REJECTED',
                title,
                message,
                { cellId, action, comments },
                action === 'approve' ? 'MEDIUM' : 'HIGH'
            );

            return notification;
        } catch (error) {
            logger.error('Notify cell approval error:', error);
            throw error;
        }
    }

    /**
     * Clean up old read notifications
     */
    async cleanupOldNotifications(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await Notification.destroy({
                where: {
                    isRead: true,
                    readAt: { [sequelize.Op.lt]: cutoffDate },
                },
            });

            logger.info(`Cleaned up ${result} old notifications`);
            return result;
        } catch (error) {
            logger.error('Cleanup old notifications error:', error);
            throw error;
        }
    }
}

module.exports = new NotificationService();
