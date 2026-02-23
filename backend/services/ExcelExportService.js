// ================================================================
// EXCEL EXPORT SERVICE — Instance (services/ExcelExportService.js)
// ================================================================
// PURPOSE: Creates formatted Excel workbooks with data, statistics, and summaries.
//
// This is the INSTANCE version (singleton with rich formatting).
// Creates multi-sheet workbooks with headers, borders, and styling.
//
// METHODS:
//   createWorkbook()       — Full workbook with data + statistics + summary
//   addHeaderSection()     — Formatted header with title/date/user
//   addDataSection()       — Column headers and row data
//   addStatistics()        — Summary stats (sum, avg, min, max)
//   addSummary()           — Report summary worksheet
//   exportToBuffer()       — Returns Excel as buffer (for HTTP download)
//   exportToFile()         — Saves Excel to disk
//   createExcelFromReport() — Create Excel from a Report model
//
// USED BY: routes/reports.js, routes/ceoReports.js
// ================================================================

const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
class ExcelExportService {
    /**
     * Create a workbook from report data
     */
    async createWorkbook(reportData, projectName, location) {
        try {
            const workbook = new ExcelJS.Workbook();

            // Set workbook properties
            workbook.creator = 'Construction Tracker System';
            workbook.created = new Date();
            workbook.modified = new Date();
            workbook.lastPrinted = new Date();

            // Create main data sheet
            const worksheet = workbook.addWorksheet('Project Data', {
                properties: { tabColor: { argb: 'FF0070C0' } },
                views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
            });

            // Add header information
            this.addHeaderSection(worksheet, reportData, projectName, location);

            // Add sheet structure and data
            this.addDataSection(worksheet, reportData);

            // Add statistics sheet
            this.addStatisticsSheet(workbook, reportData);

            // Add summary sheet
            this.addSummarySheet(workbook, reportData);

            return workbook;
        } catch (error) {
            logger.error('Create workbook error:', error);
            throw error;
        }
    }

    /**
     * Add header section to worksheet
     */
    addHeaderSection(worksheet, reportData, projectName, location) {
        // Title row
        worksheet.addRow(['Project Report']);
        worksheet.getRow(1).font = { size: 16, bold: true, color: { argb: 'FF0070C0' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Project information
        worksheet.addRow(['Project Name:', projectName]);
        worksheet.addRow(['Location:', location]);
        worksheet.addRow(['Generated Date:', new Date().toLocaleDateString()]);
        worksheet.addRow(['Sheet Name:', reportData.sheetName]);
        worksheet.addRow(['Status:', reportData.summary.status]);
        worksheet.addRow(['Last Updated:', new Date(reportData.summary.lastUpdated).toLocaleString()]);

        // Add empty row for spacing
        worksheet.addRow([]);

        // Style header rows
        for (let i = 2; i <= 7; i++) {
            worksheet.getRow(i).getCell(1).font = { bold: true };
            worksheet.getRow(i).getCell(2).font = { color: { argb: 'FF333333' } };
        }
    }

    /**
     * Add data section to worksheet
     */
    addDataSection(worksheet, reportData) {
        const structure = reportData.structure;
        const cellData = reportData.cellData;

        if (!structure || !structure.columns || !structure.rows) {
            worksheet.addRow(['No data available']);
            return;
        }

        // Add column headers
        const headerRow = ['Row'];
        structure.columns.forEach(col => {
            headerRow.push(col.label || col.id);
        });

        const headerRowObj = worksheet.addRow(headerRow);
        headerRowObj.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRowObj.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0070C0' },
        };
        headerRowObj.alignment = { vertical: 'middle', horizontal: 'center' };

        // Add data rows
        structure.rows.forEach((row, rowIndex) => {
            const dataRow = [row.label || `Row ${rowIndex + 1}`];

            structure.columns.forEach((col, colIndex) => {
                const cellId = this.getCellId(rowIndex, colIndex);
                const cell = cellData[cellId];

                if (cell) {
                    dataRow.push(cell.value || '');
                } else {
                    dataRow.push('');
                }
            });

            worksheet.addRow(dataRow);
        });

        // Auto-fit columns
        worksheet.columns.forEach((column, index) => {
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, cell => {
                const cellLength = cell.value ? cell.value.toString().length : 10;
                if (cellLength > maxLength) {
                    maxLength = cellLength;
                }
            });
            column.width = Math.min(maxLength + 2, 50);
        });

        // Add borders to data table
        const dataStartRow = 9; // After header section
        const dataEndRow = dataStartRow + structure.rows.length;
        const dataEndCol = structure.columns.length + 1;

        for (let row = dataStartRow; row <= dataEndRow; row++) {
            for (let col = 1; col <= dataEndCol; col++) {
                const cell = worksheet.getRow(row).getCell(col);
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' },
                };
            }
        }
    }

    /**
     * Add statistics sheet
     */
    addStatisticsSheet(workbook, reportData) {
        const statsSheet = workbook.addWorksheet('Statistics', {
            properties: { tabColor: { argb: 'FF00B050' } },
        });

        const stats = reportData.statistics || {};

        // Title
        statsSheet.addRow(['Data Statistics']);
        statsSheet.getRow(1).font = { size: 14, bold: true, color: { argb: 'FF00B050' } };
        statsSheet.addRow([]);

        // Statistics data
        const statsData = [
            ['Total Cells', stats.totalCells || 0],
            ['Numeric Cells', stats.numericCells || 0],
            ['Text Cells', stats.textCells || 0],
            ['Empty Cells', stats.emptyCells || 0],
            ['Sum', stats.sum || 0],
            ['Average', stats.average ? stats.average.toFixed(2) : 0],
            ['Minimum', stats.min || 'N/A'],
            ['Maximum', stats.max || 'N/A'],
        ];

        statsData.forEach(([label, value]) => {
            const row = statsSheet.addRow([label, value]);
            row.getCell(1).font = { bold: true };
            row.getCell(2).alignment = { horizontal: 'right' };
        });

        // Auto-fit columns
        statsSheet.columns = [
            { width: 20 },
            { width: 15 },
        ];
    }

    /**
     * Add summary sheet
     */
    addSummarySheet(workbook, reportData) {
        const summarySheet = workbook.addWorksheet('Summary', {
            properties: { tabColor: { argb: 'FFFFC000' } },
        });

        // Title
        summarySheet.addRow(['Report Summary']);
        summarySheet.getRow(1).font = { size: 14, bold: true, color: { argb: 'FFFFC000' } };
        summarySheet.addRow([]);

        // Summary data
        const summary = reportData.summary || {};
        const summaryData = [
            ['Sheet Name', reportData.sheetName],
            ['Description', reportData.sheetDescription || 'N/A'],
            ['Total Cells', summary.totalCells || 0],
            ['Version', summary.version || 1],
            ['Status', summary.status || 'N/A'],
            ['Last Updated', summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleString() : 'N/A'],
        ];

        summaryData.forEach(([label, value]) => {
            const row = summarySheet.addRow([label, value]);
            row.getCell(1).font = { bold: true };
        });

        // Auto-fit columns
        summarySheet.columns = [
            { width: 20 },
            { width: 40 },
        ];
    }

    /**
     * Generate filename for Excel export
     */
    generateFileName(projectName, location, date = new Date()) {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        const safeName = projectName.replace(/[^a-zA-Z0-9]/g, '');
        const safeLocation = location.replace(/[^a-zA-Z0-9]/g, '');

        return `${safeName}-${dateStr}-${safeLocation}.xlsx`;
    }

    /**
     * Export workbook to buffer
     */
    async exportToBuffer(workbook) {
        try {
            const buffer = await workbook.xlsx.writeBuffer();
            logger.info('Workbook exported to buffer successfully');
            return buffer;
        } catch (error) {
            logger.error('Export to buffer error:', error);
            throw error;
        }
    }

    /**
     * Export workbook to file
     */
    async exportToFile(workbook, filePath) {
        try {
            await workbook.xlsx.writeFile(filePath);
            logger.info(`Workbook exported to file: ${filePath}`);
            return filePath;
        } catch (error) {
            logger.error('Export to file error:', error);
            throw error;
        }
    }

    /**
     * Helper to get cell ID from row and column index
     */
    getCellId(rowIndex, colIndex) {
        const colLetter = String.fromCharCode(65 + colIndex); // A, B, C, ...
        return `${colLetter}${rowIndex + 1}`;
    }

    /**
     * Create Excel file from report
     */
    async createExcelFromReport(report) {
        try {
            const { reportData, metadata } = report;
            const projectName = metadata.projectName || 'Project';
            const location = metadata.location || 'Unknown';

            const workbook = await this.createWorkbook(reportData, projectName, location);
            const buffer = await this.exportToBuffer(workbook);
            const filename = this.generateFileName(projectName, location);

            return { buffer, filename };
        } catch (error) {
            logger.error('Create Excel from report error:', error);
            throw error;
        }
    }
}

module.exports = new ExcelExportService();
