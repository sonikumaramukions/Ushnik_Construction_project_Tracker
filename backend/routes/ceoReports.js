// ================================================================
// CEO REPORTS ROUTES (routes/ceoReports.js)
// ================================================================
// PURPOSE: Generate and manage reports specifically for CEO viewing.
//
// WORKFLOW:
//   1. Admin generates a report from a sheet → POST /generate
//   2. Report is saved with all data and formulas
//   3. CEO views the report → GET /:id
//   4. CEO downloads as Excel → GET /:id/download
//   5. Admin can share with CEO → POST /:id/share
//
// ENDPOINTS:
//   POST /api/ceo-reports/generate     — Generate report from sheet
//   GET  /api/ceo-reports/:id          — View a report
//   GET  /api/ceo-reports/:id/download — Download as Excel
//   GET  /api/ceo-reports/             — List all CEO reports
//   POST /api/ceo-reports/:id/share    — Share report with CEO
//   GET  /api/ceo-reports/:id/access-log — View who accessed it
//
// ACCESS: CEO (view/download), L1_ADMIN & L2 (generate/share)
// USES: services/CEOReportService.js, services/ExcelExportService.js
// ================================================================

const express = require('express');
const router = express.Router();
const { Report, Sheet } = require('../models');
const CEOReportService = require('../services/CEOReportService');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

/**
 * CEO Report Routes
 * Admin generates reports for CEO, CEO views and downloads
 */

/**
 * Generate report for CEO
 * POST /api/ceo-reports/generate
 */
router.post('/generate',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'L2_SENIOR_ENGINEER']),
    auditLog('GENERATE_CEO_REPORT', 'REPORT'),
    async (req, res) => {
        try {
            const { sheetId, title, description, ceoUserId } = req.body;

            if (!sheetId) {
                return res.status(400).json({
                    success: false,
                    message: 'sheetId is required'
                });
            }

            // Verify sheet exists
            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                return res.status(404).json({
                    success: false,
                    message: 'Sheet not found'
                });
            }

            // Create report
            const report = await Report.create({
                sheetId,
                projectId: sheet.projectId,
                title: title || `Report: ${sheet.name}`,
                description: description || '',
                reportData: {},
                metadata: {
                    generatedFor: 'CEO',
                    generatedAt: new Date().toISOString(),
                    ceoUserId: ceoUserId || null
                },
                generatedById: req.user.id
            });

            // Share with CEO if ceoUserId provided
            if (ceoUserId) {
                await CEOReportService.shareReportWithCEO(report.id, ceoUserId);
            }

            res.status(201).json({
                success: true,
                message: 'CEO report generated successfully',
                data: {
                    reportId: report.id,
                    title: report.title,
                    sheetId,
                    createdAt: report.createdAt,
                    sharedWithCEO: !!ceoUserId
                }
            });

        } catch (error) {
            logger.error('Error generating CEO report:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate CEO report',
                error: error.message
            });
        }
    }
);

/**
 * Get CEO report details
 * GET /api/ceo-reports/:reportId
 */
router.get('/:reportId',
    authenticateToken,
    authorizeRole(['CEO', 'L1_ADMIN', 'L2_SENIOR_ENGINEER']),
    auditLog('VIEW_CEO_REPORT', 'REPORT'),
    async (req, res) => {
        try {
            const { reportId } = req.params;

            // Only CEO and admins can view CEO reports
            if (req.user.role !== 'CEO' && req.user.role !== 'L1_ADMIN' && req.user.role !== 'L2_SENIOR_ENGINEER') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            const reportData = await CEOReportService.generateCEOReport(reportId);

            // Track CEO access
            if (req.user.role === 'CEO') {
                await CEOReportService.trackCEOAccess(reportId, req.user.id, 'view');
            }

            res.status(200).json({
                success: true,
                data: reportData
            });

        } catch (error) {
            logger.error('Error fetching CEO report:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch CEO report',
                error: error.message
            });
        }
    }
);

/**
 * Download CEO report as Excel
 * GET /api/ceo-reports/:reportId/download
 */
router.get('/:reportId/download',
    authenticateToken,
    authorizeRole(['CEO', 'L1_ADMIN', 'L2_SENIOR_ENGINEER']),
    auditLog('DOWNLOAD_CEO_REPORT', 'REPORT'),
    async (req, res) => {
        try {
            const { reportId } = req.params;

            // Verify CEO or admin access
            if (req.user.role !== 'CEO' && req.user.role !== 'L1_ADMIN' && req.user.role !== 'L2_SENIOR_ENGINEER') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            // Generate Excel file
            const excelBuffer = await CEOReportService.exportCEOReportToExcel(reportId);

            // Track CEO download
            if (req.user.role === 'CEO') {
                await CEOReportService.trackCEOAccess(reportId, req.user.id, 'download');
            }

            // Set response headers
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="CEO_Report_${reportId}_${Date.now()}.xlsx"`);

            res.send(excelBuffer);

        } catch (error) {
            logger.error('Error downloading CEO report:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to download CEO report',
                error: error.message
            });
        }
    }
);

/**
 * List all CEO reports
 * GET /api/ceo-reports
 */
router.get('/',
    authenticateToken,
    authorizeRole(['CEO', 'L1_ADMIN', 'L2_SENIOR_ENGINEER']),
    async (req, res) => {
        try {
            let query = {
                attributes: ['id', 'title', 'description', 'sheetId', 'projectId', 'createdAt', 'metadata'],
                order: [['createdAt', 'DESC']]
            };

            // For CEO: show all reports that have metadata.generatedFor = 'CEO'
            // For Admin: show all CEO reports they generated
            const reports = await Report.findAll(query);

            // Filter client-side for CEO user (SQLite JSON query limitations)
            let filteredReports = reports;
            if (req.user.role === 'CEO') {
                filteredReports = reports.filter(r => {
                    const meta = r.metadata || {};
                    return meta.generatedFor === 'CEO';
                });
            }

            res.status(200).json({
                success: true,
                data: filteredReports,
                count: filteredReports.length
            });

        } catch (error) {
            logger.error('Error listing CEO reports:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to list CEO reports',
                error: error.message
            });
        }
    }
);

/**
 * Share report with CEO
 * POST /api/ceo-reports/:reportId/share
 */
router.post('/:reportId/share',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'L2_SENIOR_ENGINEER']),
    auditLog('SHARE_CEO_REPORT', 'REPORT'),
    async (req, res) => {
        try {
            const { reportId } = req.params;
            const { ceoUserId } = req.body;

            if (!ceoUserId) {
                return res.status(400).json({
                    success: false,
                    message: 'ceoUserId is required'
                });
            }

            const result = await CEOReportService.shareReportWithCEO(reportId, ceoUserId);

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Error sharing report:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to share report',
                error: error.message
            });
        }
    }
);

/**
 * Get report access log (for admins)
 * GET /api/ceo-reports/:reportId/access-log
 */
router.get('/:reportId/access-log',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'L2_SENIOR_ENGINEER']),
    auditLog('VIEW_REPORT_ACCESS_LOG', 'REPORT'),
    async (req, res) => {
        try {
            const { reportId } = req.params;

            const report = await Report.findByPk(reportId, {
                attributes: ['id', 'title', 'metadata']
            });

            if (!report) {
                return res.status(404).json({
                    success: false,
                    message: 'Report not found'
                });
            }

            const accessLog = report.metadata?.ceoAccessLog || [];

            res.status(200).json({
                success: true,
                data: {
                    reportId,
                    title: report.title,
                    accessLog,
                    totalAccess: accessLog.length
                }
            });

        } catch (error) {
            logger.error('Error fetching access log:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch access log',
                error: error.message
            });
        }
    }
);

module.exports = router;
