// ================================================================
// DASHBOARD ROUTES (routes/dashboards.js)
// ================================================================
// PURPOSE: Provides role-specific dashboard data for each user type.
//
// Each role sees a DIFFERENT dashboard:
//   GET /api/dashboards/admin    — L1_ADMIN: sheets, projects, stats, activity
//   GET /api/dashboards/engineer — L2/L3/GROUND_MANAGER: assigned tasks
//   GET /api/dashboards/ceo      — CEO: reports, budget, project summary
//
// NOTIFICATION ENDPOINTS (the bell icon in the top bar):
//   GET   /api/dashboards/notifications        — Get user's notifications
//   PATCH /api/dashboards/notifications/:id/read — Mark one as read
//   PATCH /api/dashboards/notifications/read-all — Mark all as read
//
// ACCESS: Each endpoint checks role before returning data
// ================================================================

const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const SheetService = require('../services/SheetService');
const ReportService = require('../services/ReportService');
const NotificationService = require('../services/NotificationService');
const { Sheet, Project, User, sequelize } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Admin Dashboard
 * GET /api/dashboards/admin
 */
router.get('/admin',
    authenticateToken,
    authorizeRoles('L1_ADMIN'),
    async (req, res) => {
        try {
            // Get all sheets created by admin
            const sheets = await Sheet.findAll({
                include: [
                    {
                        association: 'project',
                        attributes: ['id', 'name', 'status', 'location'],
                    },
                    {
                        association: 'lastModifier',
                        attributes: ['id', 'firstName', 'lastName', 'role'],
                    },
                ],
                order: [['updatedAt', 'DESC']],
                limit: 50,
            });

            // Get sheet statistics
            const sheetStats = await Sheet.findAll({
                attributes: [
                    'status',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                ],
                group: ['status'],
            });

            // Get all projects
            const projects = await Project.findAll({
                attributes: ['id', 'name', 'status', 'location', 'progressPercentage'],
                order: [['updatedAt', 'DESC']],
                limit: 20,
            });

            // Get recent activity (last 20 modifications)
            const recentActivity = sheets.slice(0, 20).map(sheet => ({
                sheetId: sheet.id,
                sheetName: sheet.name,
                projectName: sheet.project?.name,
                lastModifiedBy: sheet.lastModifier ?
                    `${sheet.lastModifier.firstName} ${sheet.lastModifier.lastName}` :
                    'Unknown',
                lastModifiedRole: sheet.lastModifier?.role,
                updatedAt: sheet.updatedAt,
                status: sheet.status,
            }));

            // Get unread notifications
            const notifications = await NotificationService.getUnreadNotifications(req.user.id);

            res.json({
                success: true,
                dashboard: {
                    sheets: sheets.map(s => ({
                        id: s.id,
                        name: s.name,
                        projectName: s.project?.name,
                        status: s.status,
                        assignedRoles: s.assignedRoles || [],
                        assignedUsers: s.assignedUsers || [],
                        lastUpdated: s.updatedAt,
                        version: s.version,
                    })),
                    statistics: {
                        totalSheets: sheets.length,
                        byStatus: sheetStats.reduce((acc, stat) => {
                            acc[stat.status] = parseInt(stat.get('count'));
                            return acc;
                        }, {}),
                        totalProjects: projects.length,
                    },
                    projects: projects.map(p => ({
                        id: p.id,
                        name: p.name,
                        status: p.status,
                        location: p.location,
                        progress: p.progressPercentage,
                    })),
                    recentActivity,
                    notifications: notifications.slice(0, 10),
                },
            });
        } catch (error) {
            logger.error('Admin dashboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to load admin dashboard',
                error: error.message,
            });
        }
    }
);

/**
 * Engineer Dashboard (L2/L3/Ground Manager)
 * GET /api/dashboards/engineer
 */
router.get('/engineer',
    authenticateToken,
    authorizeRoles('L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'GROUND_MANAGER'),
    async (req, res) => {
        try {
            const userId = req.user.id;
            const role = req.user.role;

            // Get assigned sheets
            const assignedSheets = await SheetService.getAssignedSheets(userId, role);

            // Get sheet statistics
            const sheetsByStatus = assignedSheets.reduce((acc, sheet) => {
                acc[sheet.status] = (acc[sheet.status] || 0) + 1;
                return acc;
            }, {});

            // Get recent updates (sheets modified in last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const recentUpdates = assignedSheets
                .filter(sheet => new Date(sheet.updatedAt) > sevenDaysAgo)
                .map(sheet => ({
                    sheetId: sheet.id,
                    sheetName: sheet.name,
                    projectName: sheet.project?.name,
                    lastModifiedBy: sheet.lastModifier ?
                        `${sheet.lastModifier.firstName} ${sheet.lastModifier.lastName}` :
                        'Unknown',
                    updatedAt: sheet.updatedAt,
                    status: sheet.status,
                }));

            // Get unread notifications
            const notifications = await NotificationService.getUnreadNotifications(userId);

            res.json({
                success: true,
                dashboard: {
                    assignedSheets: assignedSheets.map(s => ({
                        id: s.id,
                        name: s.name,
                        description: s.description,
                        projectId: s.projectId,
                        projectName: s.project?.name,
                        projectLocation: s.project?.location,
                        status: s.status,
                        lastUpdated: s.updatedAt,
                        version: s.version,
                        createdBy: s.creator ? `${s.creator.firstName} ${s.creator.lastName}` : 'Unknown',
                    })),
                    statistics: {
                        totalAssigned: assignedSheets.length,
                        byStatus: sheetsByStatus,
                        recentUpdates: recentUpdates.length,
                    },
                    recentUpdates,
                    notifications: notifications.slice(0, 10),
                },
            });
        } catch (error) {
            logger.error('Engineer dashboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to load engineer dashboard',
                error: error.message,
            });
        }
    }
);

/**
 * CEO Dashboard
 * GET /api/dashboards/ceo
 */
router.get('/ceo',
    authenticateToken,
    authorizeRoles('CEO'),
    async (req, res) => {
        try {
            // Get all published reports
            const reports = await ReportService.getReportsForCEO();

            // Get report statistics
            const reportsByProject = reports.reduce((acc, report) => {
                const projectName = report.project?.name || 'Unknown';
                if (!acc[projectName]) {
                    acc[projectName] = {
                        projectId: report.projectId,
                        projectName,
                        count: 0,
                        latestReport: null,
                    };
                }
                acc[projectName].count++;
                if (!acc[projectName].latestReport ||
                    new Date(report.generatedAt) > new Date(acc[projectName].latestReport.generatedAt)) {
                    acc[projectName].latestReport = {
                        id: report.id,
                        title: report.title,
                        generatedAt: report.generatedAt,
                    };
                }
                return acc;
            }, {});

            // Get recent reports (last 10)
            const recentReports = reports.slice(0, 10).map(r => ({
                id: r.id,
                title: r.title,
                projectName: r.project?.name,
                projectLocation: r.project?.location,
                sheetName: r.sheet?.name,
                generatedAt: r.generatedAt,
                generatedBy: r.generatedBy ? `${r.generatedBy.firstName} ${r.generatedBy.lastName}` : 'Unknown',
                downloadCount: r.downloadCount,
            }));

            // Get all projects summary
            const projects = await Project.findAll({
                attributes: ['id', 'name', 'status', 'location', 'progressPercentage', 'budget', 'actualCost'],
                order: [['updatedAt', 'DESC']],
            });

            // Get unread notifications
            const notifications = await NotificationService.getUnreadNotifications(req.user.id);

            res.json({
                success: true,
                dashboard: {
                    reports: recentReports,
                    statistics: {
                        totalReports: reports.length,
                        totalProjects: projects.length,
                        reportsByProject: Object.values(reportsByProject),
                        unreadNotifications: notifications.length,
                    },
                    projects: projects.map(p => ({
                        id: p.id,
                        name: p.name,
                        status: p.status,
                        location: p.location,
                        progress: p.progressPercentage,
                        budget: p.budget,
                        actualCost: p.actualCost,
                        budgetUtilization: p.budget > 0 ? ((p.actualCost / p.budget) * 100).toFixed(2) : 0,
                    })),
                    notifications: notifications.slice(0, 10),
                },
            });
        } catch (error) {
            logger.error('CEO dashboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to load CEO dashboard',
                error: error.message,
            });
        }
    }
);

/**
 * Get dashboard notifications
 * GET /api/dashboards/notifications
 */
router.get('/notifications',
    authenticateToken,
    async (req, res) => {
        try {
            const { limit = 50, unreadOnly = false } = req.query;

            let notifications;
            if (unreadOnly === 'true') {
                notifications = await NotificationService.getUnreadNotifications(req.user.id);
            } else {
                notifications = await NotificationService.getAllNotifications(req.user.id, parseInt(limit));
            }

            res.json({
                success: true,
                notifications,
                count: notifications.length,
            });
        } catch (error) {
            logger.error('Get notifications error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve notifications',
                error: error.message,
            });
        }
    }
);

/**
 * Mark notification as read
 * PATCH /api/dashboards/notifications/:id/read
 */
router.patch('/notifications/:id/read',
    authenticateToken,
    async (req, res) => {
        try {
            const notification = await NotificationService.markAsRead(req.params.id);

            res.json({
                success: true,
                message: 'Notification marked as read',
                notification,
            });
        } catch (error) {
            logger.error('Mark notification as read error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark notification as read',
                error: error.message,
            });
        }
    }
);

/**
 * Mark all notifications as read
 * PATCH /api/dashboards/notifications/read-all
 */
router.patch('/notifications/read-all',
    authenticateToken,
    async (req, res) => {
        try {
            const count = await NotificationService.markAllAsRead(req.user.id);

            res.json({
                success: true,
                message: `${count} notification(s) marked as read`,
                count,
            });
        } catch (error) {
            logger.error('Mark all notifications as read error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark notifications as read',
                error: error.message,
            });
        }
    }
);

module.exports = router;
