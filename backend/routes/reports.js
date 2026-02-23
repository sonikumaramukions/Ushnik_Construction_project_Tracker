// ================================================================
// REPORTS ROUTES (routes/reports.js)
// ================================================================
// PURPOSE: Generate reports from sheets and export to Excel.
//
// WORKFLOW:
//   1. Admin generates a report from sheet data → POST /generate
//   2. CEO views published reports → GET /
//   3. CEO downloads as Excel file → GET /:id/download
//   4. Excel export for any sheet → GET /export/sheet/:sheetId
//
// ENDPOINTS:
//   POST /api/reports/generate              — Generate report from sheet
//   GET  /api/reports/                      — List published reports (CEO)
//   GET  /api/reports/:id                   — Get specific report
//   GET  /api/reports/:id/download          — Download as Excel
//   DELETE /api/reports/:id                 — Delete report (L1_ADMIN)
//   GET  /api/reports/export/report/:id     — Export report to Excel
//   GET  /api/reports/export/sheet/:sheetId — Export sheet to Excel
//
// USES: services/ReportService.js, services/ExcelExportService.js
// ================================================================

const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { validate } = require('../middleware/validation');
const ReportService = require('../services/ReportService');
const ExcelExportService = require('../services/excelExportService');
const { Sheet, CellData } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Generate a report from a sheet (Admin only)
 * POST /api/reports/generate
 */
router.post('/generate',
    authenticateToken,
    authorizeRoles('L1_ADMIN'),
    validate('generateReport'),
    auditLog('GENERATE_REPORT', 'REPORT'),
    async (req, res) => {
        try {
            const { sheetId, title, description } = req.body;
            const userId = req.user.id;

            const report = await ReportService.generateReport(sheetId, userId, {
                title,
                description,
            });

            // Emit real-time notification to CEO users
            if (req.io) {
                req.io.to('role_CEO').emit('report_generated', {
                    reportId: report.id,
                    title: report.title,
                    projectName: report.metadata.projectName,
                    timestamp: new Date().toISOString(),
                });
            }

            res.status(201).json({
                success: true,
                message: 'Report generated successfully',
                report: {
                    id: report.id,
                    title: report.title,
                    projectId: report.projectId,
                    sheetId: report.sheetId,
                    status: report.status,
                    generatedAt: report.generatedAt,
                },
            });
        } catch (error) {
            logger.error('Generate report error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate report',
                error: error.message,
            });
        }
    }
);

/**
 * Get all reports (CEO and Admin)
 * GET /api/reports
 */
router.get('/',
    authenticateToken,
    authorizeRoles('CEO', 'L1_ADMIN'),
    async (req, res) => {
        try {
            const { projectId } = req.query;
            const filters = projectId ? { projectId } : {};

            const reports = await ReportService.getReportsForCEO(filters);

            res.json({
                success: true,
                reports: reports.map(r => ({
                    id: r.id,
                    title: r.title,
                    description: r.description,
                    projectName: r.project?.name,
                    projectLocation: r.project?.location,
                    sheetName: r.sheet?.name,
                    status: r.status,
                    generatedAt: r.generatedAt,
                    generatedBy: r.generatedBy ? `${r.generatedBy.firstName} ${r.generatedBy.lastName}` : 'Unknown',
                    downloadCount: r.downloadCount,
                })),
                count: reports.length,
            });
        } catch (error) {
            logger.error('Get reports error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve reports',
                error: error.message,
            });
        }
    }
);

/**
 * Get a specific report (CEO and Admin)
 * GET /api/reports/:id
 */
router.get('/:id',
    authenticateToken,
    authorizeRoles('CEO', 'L1_ADMIN'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const report = await ReportService.getReportById(id);

            res.json({
                success: true,
                report: {
                    id: report.id,
                    title: report.title,
                    description: report.description,
                    reportData: report.reportData,
                    metadata: report.metadata,
                    status: report.status,
                    generatedAt: report.generatedAt,
                    publishedAt: report.publishedAt,
                    downloadCount: report.downloadCount,
                    lastDownloadedAt: report.lastDownloadedAt,
                    project: {
                        id: report.project.id,
                        name: report.project.name,
                        location: report.project.location,
                        status: report.project.status,
                    },
                    sheet: {
                        id: report.sheet.id,
                        name: report.sheet.name,
                        description: report.sheet.description,
                    },
                    generatedBy: report.generatedBy ? {
                        id: report.generatedBy.id,
                        name: `${report.generatedBy.firstName} ${report.generatedBy.lastName}`,
                        email: report.generatedBy.email,
                    } : null,
                },
            });
        } catch (error) {
            logger.error('Get report error:', error);

            if (error.message === 'Report not found') {
                return res.status(404).json({
                    success: false,
                    message: 'Report not found',
                });
            }

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve report',
                error: error.message,
            });
        }
    }
);

/**
 * Download report as Excel file (CEO and Admin)
 * GET /api/reports/:id/download
 */
router.get('/:id/download',
    authenticateToken,
    authorizeRoles('CEO', 'L1_ADMIN'),
    auditLog('DOWNLOAD_REPORT', 'REPORT'),
    async (req, res) => {
        try {
            const { id } = req.params;

            // Get report
            const report = await ReportService.getReportById(id);

            // Track download
            await ReportService.trackDownload(id);

            // Generate Excel file
            const { buffer, filename } = await ExcelExportService.createExcelFromReport(report);

            // Set headers for file download
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', buffer.length);

            // Send file
            res.send(buffer);

            logger.info(`Report ${id} downloaded by user ${req.user.id}, filename: ${filename}`);
        } catch (error) {
            logger.error('Download report error:', error);

            if (error.message === 'Report not found') {
                return res.status(404).json({
                    success: false,
                    message: 'Report not found',
                });
            }

            res.status(500).json({
                success: false,
                message: 'Failed to download report',
                error: error.message,
            });
        }
    }
);

/**
 * Delete a report (Admin only)
 * DELETE /api/reports/:id
 */
router.delete('/:id',
    authenticateToken,
    authorizeRoles('L1_ADMIN'),
    auditLog('DELETE_REPORT', 'REPORT'),
    async (req, res) => {
        try {
            const { id } = req.params;
            await ReportService.deleteReport(id, req.user.id);

            res.json({
                success: true,
                message: 'Report deleted successfully',
            });
        } catch (error) {
            logger.error('Delete report error:', error);

            if (error.message === 'Report not found') {
                return res.status(404).json({
                    success: false,
                    message: 'Report not found',
                });
            }

            res.status(500).json({
                success: false,
                message: 'Failed to delete report',
                error: error.message,
            });
        }
    }
);

/**
 * Export report to Excel
 * GET /api/reports/:reportId/export-excel
 */
router.get('/:reportId/export-excel',
    authenticateToken,
    auditLog('EXPORT_REPORT_EXCEL', 'REPORT'),
    async (req, res) => {
        try {
            const { reportId } = req.params;

            const report = await ReportService.getReportById(reportId);
            if (!report) {
                return res.status(404).json({
                    success: false,
                    message: 'Report not found',
                });
            }

            // Check user has access to report
            if (req.user.role !== 'L1_ADMIN' && req.user.role !== 'CEO') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied',
                });
            }

            // Get associated sheet
            const sheet = await Sheet.findByPk(report.sheetId);

            // Generate Excel file
            const excelBuffer = await ExcelExportService.exportReportToExcel(report, sheet);

            // Set response headers
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Report_${report.title}_${Date.now()}.xlsx"`);

            res.send(excelBuffer);

        } catch (error) {
            logger.error('Export report to Excel error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export report',
                error: error.message,
            });
        }
    }
);

/**
 * Export sheet data to Excel
 * GET /api/reports/sheet/:sheetId/export-excel
 */
router.get('/sheet/:sheetId/export-excel',
    authenticateToken,
    auditLog('EXPORT_SHEET_EXCEL', 'SHEET'),
    async (req, res) => {
        try {
            const { sheetId } = req.params;

            const sheet = await Sheet.findByPk(sheetId);
            if (!sheet) {
                return res.status(404).json({
                    success: false,
                    message: 'Sheet not found',
                });
            }

            // Check permissions
            const permissions = sheet.permissions?.[req.user.role];
            if (!permissions?.canView && !sheet.assignedRoles?.includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this sheet',
                });
            }

            // Get cell data for sheet
            const cellDataList = await CellData.findAll({
                where: { sheetId },
                attributes: ['cellId', 'value'],
            });

            // Generate Excel file
            const excelBuffer = await ExcelExportService.exportSheetToExcel(sheet, cellDataList);

            // Set response headers
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Sheet_${sheet.name}_${Date.now()}.xlsx"`);

            res.send(excelBuffer);

        } catch (error) {
            logger.error('Export sheet to Excel error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export sheet',
                error: error.message,
            });
        }
    }
);

module.exports = router;
