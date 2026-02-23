// ================================================================
// REPORT SERVICE (services/ReportService.js)
// ================================================================
// PURPOSE: Report lifecycle management — generate, view, download, delete.
//
// WORKFLOW:
//   1. generateReport() — Create report from sheet data with statistics
//   2. getReportsForCEO() — List published reports for CEO dashboard
//   3. getReport() — Get specific report with all data
//   4. trackDownload() — Increment download counter
//   5. deleteReport() — Remove a report
//
// ALSO:
//   calculateStats() — Compute sum, average, min, max from cell data
//   archiveOld()     — Archive reports older than N days
//
// USED BY: routes/reports.js, routes/ceoReports.js
// ================================================================

const { Report, Sheet, Project, CellData, sequelize } = require('../models');
const logger = require('../utils/logger');
const NotificationService = require('./NotificationService');

class ReportService {
    /**
     * Generate a report from a sheet
     */
    async generateReport(sheetId, userId, options = {}) {
        const transaction = await sequelize.transaction();

        try {
            const sheet = await Sheet.findByPk(sheetId, {
                include: [
                    {
                        association: 'project',
                        attributes: ['id', 'name', 'location', 'status', 'startDate', 'endDate', 'budget'],
                    },
                    {
                        association: 'cellData',
                        attributes: ['cellId', 'value', 'numericValue', 'dataType', 'rowIndex', 'columnIndex'],
                    },
                ],
                transaction,
            });

            if (!sheet) {
                throw new Error('Sheet not found');
            }

            // Build report data structure
            const reportData = {
                sheetName: sheet.name,
                sheetDescription: sheet.description,
                structure: sheet.structure,
                cellData: {},
                statistics: {},
                summary: {},
            };

            // Organize cell data
            if (sheet.cellData) {
                sheet.cellData.forEach(cell => {
                    reportData.cellData[cell.cellId] = {
                        value: cell.value,
                        numericValue: cell.numericValue,
                        dataType: cell.dataType,
                        rowIndex: cell.rowIndex,
                        columnIndex: cell.columnIndex,
                    };
                });
            }

            // Calculate statistics
            reportData.statistics = this.calculateStatistics(sheet.cellData);

            // Generate summary
            reportData.summary = {
                totalCells: Object.keys(reportData.cellData).length,
                lastUpdated: sheet.updatedAt,
                version: sheet.version,
                status: sheet.status,
            };

            // Create report metadata
            const metadata = {
                projectName: sheet.project.name,
                location: sheet.project.location || 'Not specified',
                generatedDate: new Date().toISOString().split('T')[0],
                projectStatus: sheet.project.status,
                projectStartDate: sheet.project.startDate,
                projectEndDate: sheet.project.endDate,
                budget: sheet.project.budget,
            };

            // Create report
            const report = await Report.create({
                sheetId: sheet.id,
                projectId: sheet.projectId,
                title: options.title || `${sheet.project.name} - ${sheet.name} Report`,
                description: options.description || `Generated report for ${sheet.name}`,
                reportData,
                metadata,
                status: 'PUBLISHED',
                generatedById: userId,
                generatedAt: new Date(),
                publishedAt: new Date(),
            }, { transaction });

            // Notify CEO users
            await NotificationService.notifyCEOAboutReport(report.id, transaction);

            await transaction.commit();

            logger.info(`Report generated: ${report.id} for sheet ${sheetId} by user ${userId}`);
            return report;
        } catch (error) {
            await transaction.rollback();
            logger.error('Generate report error:', error);
            throw error;
        }
    }

    /**
     * Get all reports for CEO
     */
    async getReportsForCEO(filters = {}) {
        try {
            const where = { status: 'PUBLISHED' };

            if (filters.projectId) {
                where.projectId = filters.projectId;
            }

            const reports = await Report.findAll({
                where,
                include: [
                    {
                        association: 'project',
                        attributes: ['id', 'name', 'location', 'status'],
                    },
                    {
                        association: 'sheet',
                        attributes: ['id', 'name', 'description'],
                    },
                    {
                        association: 'generatedBy',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    },
                ],
                order: [['generatedAt', 'DESC']],
            });

            return reports;
        } catch (error) {
            logger.error('Get reports for CEO error:', error);
            throw error;
        }
    }

    /**
     * Get a specific report by ID
     */
    async getReportById(reportId) {
        try {
            const report = await Report.findByPk(reportId, {
                include: [
                    {
                        association: 'project',
                        attributes: ['id', 'name', 'location', 'status', 'startDate', 'endDate', 'budget'],
                    },
                    {
                        association: 'sheet',
                        attributes: ['id', 'name', 'description', 'status'],
                    },
                    {
                        association: 'generatedBy',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    },
                ],
            });

            if (!report) {
                throw new Error('Report not found');
            }

            return report;
        } catch (error) {
            logger.error('Get report by ID error:', error);
            throw error;
        }
    }

    /**
     * Track report download
     */
    async trackDownload(reportId) {
        try {
            const report = await Report.findByPk(reportId);
            if (!report) {
                throw new Error('Report not found');
            }

            await report.update({
                downloadCount: report.downloadCount + 1,
                lastDownloadedAt: new Date(),
            });

            logger.info(`Report ${reportId} downloaded, count: ${report.downloadCount + 1}`);
            return report;
        } catch (error) {
            logger.error('Track download error:', error);
            throw error;
        }
    }

    /**
     * Delete a report
     */
    async deleteReport(reportId, userId) {
        try {
            const report = await Report.findByPk(reportId);
            if (!report) {
                throw new Error('Report not found');
            }

            await report.destroy();

            logger.info(`Report ${reportId} deleted by user ${userId}`);
            return true;
        } catch (error) {
            logger.error('Delete report error:', error);
            throw error;
        }
    }

    /**
     * Calculate statistics from cell data
     */
    calculateStatistics(cellData) {
        const stats = {
            totalCells: 0,
            numericCells: 0,
            textCells: 0,
            emptyCells: 0,
            sum: 0,
            average: 0,
            min: null,
            max: null,
        };

        if (!cellData || cellData.length === 0) {
            return stats;
        }

        const numericValues = [];

        cellData.forEach(cell => {
            stats.totalCells++;

            if (!cell.value || cell.value.trim() === '') {
                stats.emptyCells++;
                return;
            }

            if (cell.dataType === 'NUMBER' && cell.numericValue !== null) {
                stats.numericCells++;
                numericValues.push(parseFloat(cell.numericValue));
            } else {
                stats.textCells++;
            }
        });

        if (numericValues.length > 0) {
            stats.sum = numericValues.reduce((a, b) => a + b, 0);
            stats.average = stats.sum / numericValues.length;
            stats.min = Math.min(...numericValues);
            stats.max = Math.max(...numericValues);
        }

        return stats;
    }

    /**
     * Archive old reports
     */
    async archiveOldReports(daysOld = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await Report.update(
                { status: 'ARCHIVED' },
                {
                    where: {
                        generatedAt: { [sequelize.Op.lt]: cutoffDate },
                        status: 'PUBLISHED',
                    },
                }
            );

            logger.info(`Archived ${result[0]} reports older than ${daysOld} days`);
            return result[0];
        } catch (error) {
            logger.error('Archive old reports error:', error);
            throw error;
        }
    }
}

module.exports = new ReportService();
