// ================================================================
// CEO REPORT SERVICE (services/CEOReportService.js)
// ================================================================
// PURPOSE: Generates comprehensive reports for CEO viewing & Excel download.
//
// WORKFLOW:
//   1. generateReport() — Creates report with processed data + formulas
//   2. exportToExcel()   — Creates multi-sheet Excel file:
//      - Summary sheet (project info, totals)
//      - Data sheet (all cell values)
//      - Formulas sheet (formula details)
//      - Metadata sheet (dates, users, versions)
//   3. shareWithCEO()    — Marks report as shared
//   4. trackAccess()     — Logs CEO view/download events
//
// USED BY: routes/ceoReports.js
// ================================================================

const ExcelJS = require('exceljs');
const { Report, Sheet, CellData, Project, User } = require('../models');
const FormulaService = require('./FormulaService');
const logger = require('../utils/logger');

/**
 * CEO Report Service
 * Generates and exports reports specifically for CEO viewing
 */
class CEOReportService {
    /**
     * Generate CEO report from sheet data
     * Includes all cells with formulas, formatting, and calculations
     * @param {string} reportId - Report ID
     * @returns {Promise<Object>} Report data with full details
     */
    async generateCEOReport(reportId) {
        try {
            const report = await Report.findByPk(reportId, {
                include: [
                    { model: Sheet, as: 'sheet' },
                    { model: Project, as: 'project' },
                    { model: User, as: 'generatedBy', attributes: ['id', 'firstName', 'lastName', 'email'] }
                ]
            });

            if (!report) {
                throw new Error('Report not found');
            }

            // Get all cell data for the sheet
            const cellDataList = await CellData.findAll({
                where: { sheetId: report.sheetId },
                order: [['rowIndex', 'ASC'], ['columnIndex', 'ASC']]
            });

            // Process cells and calculate formulas
            const processedCells = await this.processCellsWithFormulas(cellDataList, report.sheetId);

            return {
                reportId,
                title: report.title,
                description: report.description,
                sheet: {
                    id: report.sheet.id,
                    name: report.sheet.name,
                    status: report.sheet.status
                },
                project: {
                    id: report.project.id,
                    name: report.project.name,
                    location: report.project.location
                },
                generatedBy: {
                    name: `${report.generatedBy.firstName} ${report.generatedBy.lastName}`,
                    email: report.generatedBy.email
                },
                generatedAt: report.createdAt,
                data: processedCells,
                metadata: report.metadata,
                cellCount: cellDataList.length,
                formulaCells: cellDataList.filter(c => c.dataType === 'FORMULA').length
            };
        } catch (error) {
            logger.error('Error generating CEO report:', error);
            throw error;
        }
    }

    /**
     * Process cells and calculate all formulas
     * @param {Array} cellDataList - Array of cell data
     * @param {string} sheetId - Sheet ID
     * @returns {Promise<Array>} Processed cells with calculated values
     */
    async processCellsWithFormulas(cellDataList, sheetId) {
        const processedCells = [];

        for (const cell of cellDataList) {
            let displayValue = cell.value;

            // If cell contains a formula, calculate it
            if (cell.dataType === 'FORMULA') {
                displayValue = await FormulaService.calculateFormula(cell.value, sheetId);
            }

            processedCells.push({
                cellId: cell.cellId,
                rowIndex: cell.rowIndex,
                columnIndex: cell.columnIndex,
                value: cell.value,
                displayValue,
                dataType: cell.dataType,
                status: cell.status,
                isFormula: cell.dataType === 'FORMULA',
                metadata: cell.metadata,
                createdAt: cell.createdAt
            });
        }

        return processedCells;
    }

    /**
     * Export CEO report to Excel with all formatting and formulas
     * @param {string} reportId - Report ID
     * @returns {Promise<Buffer>} Excel file buffer
     */
    async exportCEOReportToExcel(reportId) {
        try {
            const reportData = await this.generateCEOReport(reportId);

            const workbook = new ExcelJS.Workbook();

            // Add report summary sheet
            this.addReportSummary(workbook, reportData);

            // Add data sheet with all cells
            this.addDataSheet(workbook, reportData);

            // Add formula details sheet
            this.addFormulaSheet(workbook, reportData);

            // Add metadata sheet
            this.addMetadataSheet(workbook, reportData);

            // Generate Excel file
            const buffer = await workbook.xlsx.writeBuffer();
            return buffer;

        } catch (error) {
            logger.error('Error exporting CEO report to Excel:', error);
            throw error;
        }
    }

    /**
     * Add report summary sheet
     */
    addReportSummary(workbook, reportData) {
        const sheet = workbook.addWorksheet('Summary', {
            properties: { tabColor: { argb: 'FF0070C0' } }
        });

        // Title
        sheet.addRow(['CEO Report Summary']);
        sheet.getRow(1).font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
        sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.mergeCells('A1:D1');

        // Report information
        sheet.addRow([]);
        const startRow = 3;
        
        sheet.addRow(['Report Title:', reportData.title]);
        sheet.addRow(['Description:', reportData.description]);
        sheet.addRow(['Project:', reportData.project.name]);
        sheet.addRow(['Location:', reportData.project.location]);
        sheet.addRow(['Generated By:', reportData.generatedBy.name]);
        sheet.addRow(['Generated At:', reportData.generatedAt]);
        sheet.addRow(['Total Cells:', reportData.cellCount]);
        sheet.addRow(['Formula Cells:', reportData.formulaCells]);
        sheet.addRow(['Sheet Name:', reportData.sheet.name]);
        sheet.addRow(['Sheet Status:', reportData.sheet.status]);

        // Format info section
        for (let i = startRow; i < startRow + 10; i++) {
            const row = sheet.getRow(i);
            row.getCell(1).font = { bold: true };
            row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
        }

        sheet.columns = [{ width: 20 }, { width: 40 }, { width: 20 }, { width: 20 }];
    }

    /**
     * Add data sheet with all cells
     */
    addDataSheet(workbook, reportData) {
        const sheet = workbook.addWorksheet('Data', {
            properties: { tabColor: { argb: 'FF70AD47' } }
        });

        // Headers
        sheet.addRow(['Cell ID', 'Value', 'Display Value', 'Type', 'Status']);
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };

        // Add cell data
        for (const cell of reportData.data) {
            sheet.addRow([
                cell.cellId,
                cell.value,
                String(cell.displayValue),
                cell.dataType,
                cell.status
            ]);
        }

        // Format columns
        sheet.columns = [
            { width: 12 },
            { width: 25 },
            { width: 25 },
            { width: 12 },
            { width: 12 }
        ];

        // Alternate row colors
        for (let i = 2; i <= reportData.data.length + 1; i++) {
            if (i % 2 === 0) {
                sheet.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
            }
        }
    }

    /**
     * Add formula details sheet
     */
    addFormulaSheet(workbook, reportData) {
        const formulaCells = reportData.data.filter(c => c.isFormula);

        if (formulaCells.length === 0) {
            return; // Skip if no formulas
        }

        const sheet = workbook.addWorksheet('Formulas', {
            properties: { tabColor: { argb: 'FFFFC000' } }
        });

        // Headers
        sheet.addRow(['Cell ID', 'Formula', 'Calculated Value', 'Dependencies']);
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };

        // Add formula data
        for (const cell of formulaCells) {
            const dependencies = cell.metadata?.dependencies?.join(', ') || 'None';
            sheet.addRow([
                cell.cellId,
                cell.value,
                String(cell.displayValue),
                dependencies
            ]);
        }

        // Format columns
        sheet.columns = [
            { width: 12 },
            { width: 30 },
            { width: 20 },
            { width: 30 }
        ];

        // Wrap text for formula column
        for (let i = 2; i <= formulaCells.length + 1; i++) {
            sheet.getRow(i).getCell(2).alignment = { wrapText: true };
        }
    }

    /**
     * Add metadata sheet
     */
    addMetadataSheet(workbook, reportData) {
        const sheet = workbook.addWorksheet('Metadata', {
            properties: { tabColor: { argb: 'FF4472C4' } }
        });

        // Title
        sheet.addRow(['Report Metadata']);
        sheet.getRow(1).font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        sheet.mergeCells('A1:B1');

        sheet.addRow([]);

        // Report metadata
        if (reportData.metadata) {
            let row = 3;
            for (const [key, value] of Object.entries(reportData.metadata)) {
                sheet.addRow([key, JSON.stringify(value)]);
                row++;
            }
        }

        sheet.columns = [{ width: 25 }, { width: 50 }];
    }

    /**
     * Share report with CEO
     * Creates notification and tracks access
     * @param {string} reportId - Report ID
     * @param {string} ceoUserId - CEO user ID
     * @returns {Promise<Object>} Share result
     */
    async shareReportWithCEO(reportId, ceoUserId) {
        try {
            const report = await Report.findByPk(reportId);
            if (!report) {
                throw new Error('Report not found');
            }

            // Mark report as shared with CEO
            report.metadata = report.metadata || {};
            report.metadata.sharedWithCEO = true;
            report.metadata.ceoAccessAt = new Date();
            report.metadata.ceoUserId = ceoUserId;

            await report.save();

            return {
                success: true,
                reportId,
                sharedWithCEO: true,
                message: 'Report shared with CEO'
            };
        } catch (error) {
            logger.error('Error sharing report with CEO:', error);
            throw error;
        }
    }

    /**
     * Track CEO access to report
     * @param {string} reportId - Report ID
     * @param {string} ceoUserId - CEO user ID
     * @param {string} action - Action performed (view, download)
     * @returns {Promise<void>}
     */
    async trackCEOAccess(reportId, ceoUserId, action) {
        try {
            const report = await Report.findByPk(reportId);
            if (!report) {
                throw new Error('Report not found');
            }

            report.metadata = report.metadata || {};
            report.metadata.ceoAccessLog = report.metadata.ceoAccessLog || [];
            report.metadata.ceoAccessLog.push({
                action,
                timestamp: new Date(),
                userId: ceoUserId
            });

            await report.save();
            logger.info(`CEO access tracked for report ${reportId}: ${action}`);

        } catch (error) {
            logger.error('Error tracking CEO access:', error);
        }
    }
}

module.exports = new CEOReportService();
