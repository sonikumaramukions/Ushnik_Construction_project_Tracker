// ================================================================
// EXCEL EXPORT SERVICE — Static (services/excelExportService.js)
// ================================================================
// PURPOSE: Exports sheets and reports to formatted Excel (.xlsx) files.
//
// This is the STATIC version (class methods, not instantiated).
// Uses ExcelJS library to create professional spreadsheets.
//
// METHODS:
//   exportSheetToExcel()      — Export a single sheet with formatting
//   exportReportToExcel()     — Export report data with title/description
//   exportMultipleSheets()    — Export multiple sheets into one workbook
//
// USED BY: routes/reports.js (Excel download endpoints)
// ================================================================

const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
class ExcelExportService {
  /**
   * Export sheet data to Excel format
   * @param {object} sheet - Sheet object from database
   * @param {array} cellDataList - Array of cell data objects
   * @returns {Buffer} - Excel file buffer
   */
  static async exportSheetToExcel(sheet, cellDataList = []) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(sheet.name.substring(0, 31)); // Excel sheet name limit

      // Add title
      worksheet.mergeCells('A1:H1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = sheet.name;
      titleCell.font = { bold: true, size: 14, color: { argb: 'FF1F4E78' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'center' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      worksheet.getRow(1).height = 25;

      // Add metadata
      worksheet.mergeCells('A2:H2');
      const metaCell = worksheet.getCell('A2');
      const createdDate = new Date(sheet.createdAt).toLocaleDateString();
      metaCell.value = `Created on ${createdDate} | Status: ${sheet.status}`;
      metaCell.font = { italic: true, size: 10, color: { argb: 'FF595959' } };
      worksheet.getRow(2).height = 16;

      // Add structure if available
      if (sheet.structure && sheet.structure.columns && sheet.structure.rows) {
        const { columns, rows } = sheet.structure;

        // Add column headers
        columns.forEach((col, index) => {
          const cell = worksheet.getCell(4, index + 1);
          cell.value = col.name;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
          cell.alignment = { horizontal: 'center', vertical: 'center' };
        });
        worksheet.getRow(4).height = 20;

        // Add row data
        let rowIndex = 5;
        rows.forEach((row) => {
          const rowCells = worksheet.getRow(rowIndex);
          
          columns.forEach((col, colIndex) => {
            const cellKey = `${row.id}-${col.id}`;
            const cellData = cellDataList.find(cd => cd.cellId === cellKey);
            const cell = worksheet.getCell(rowIndex, colIndex + 1);
            
            // Set cell value
            if (cellData) {
              cell.value = cellData.value;
            } else {
              cell.value = '';
            }

            // Apply formatting based on column type
            if (col.type === 'NUMBER') {
              cell.numFmt = '0.00';
              cell.alignment = { horizontal: 'right' };
            } else if (col.type === 'DATE') {
              cell.numFmt = 'yyyy-mm-dd';
              cell.alignment = { horizontal: 'center' };
            } else {
              cell.alignment = { horizontal: 'left', wrapText: true };
            }

            // Add borders
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
              left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
              bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
              right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            };
          });

          rowIndex++;
        });

        // Auto-fit columns
        columns.forEach((col, index) => {
          worksheet.getColumn(index + 1).width = Math.min(col.name.length + 2, 50);
        });
      }

      // Add summary sheet with metadata
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.mergeCells('A1:B1');
      const summaryTitle = summarySheet.getCell('A1');
      summaryTitle.value = 'Sheet Information';
      summaryTitle.font = { bold: true, size: 12 };

      const infoRows = [
        ['Sheet Name', sheet.name],
        ['Description', sheet.description || 'N/A'],
        ['Status', sheet.status],
        ['Created Date', new Date(sheet.createdAt).toLocaleString()],
        ['Last Modified', new Date(sheet.updatedAt).toLocaleString()],
        ['Version', sheet.version || 1],
      ];

      infoRows.forEach((row, index) => {
        summarySheet.getCell(`A${index + 3}`).value = row[0];
        summarySheet.getCell(`A${index + 3}`).font = { bold: true };
        summarySheet.getCell(`B${index + 3}`).value = row[1];
      });

      summarySheet.getColumn('A').width = 20;
      summarySheet.getColumn('B').width = 40;

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;

    } catch (error) {
      logger.error('Export sheet to Excel error:', error);
      throw error;
    }
  }

  /**
   * Export report data to Excel
   * @param {object} report - Report object
   * @param {object} sheet - Associated sheet object
   * @returns {Buffer} - Excel file buffer
   */
  static async exportReportToExcel(report, sheet) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Report');

      // Add title
      worksheet.mergeCells('A1:H1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = report.title;
      titleCell.font = { bold: true, size: 14, color: { argb: 'FF1F4E78' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'center' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      worksheet.getRow(1).height = 25;

      // Add description
      if (report.description) {
        worksheet.mergeCells('A2:H2');
        const descCell = worksheet.getCell('A2');
        descCell.value = report.description;
        descCell.font = { italic: true };
      }

      // Add report data
      const reportData = report.reportData || {};
      let rowIndex = 4;

      Object.entries(reportData).forEach(([key, value]) => {
        const keyCell = worksheet.getCell(`A${rowIndex}`);
        const valueCell = worksheet.getCell(`B${rowIndex}`);

        keyCell.value = key;
        keyCell.font = { bold: true };
        valueCell.value = value;

        rowIndex++;
      });

      // Add associated sheet reference
      worksheet.mergeCells(`A${rowIndex + 1}:B${rowIndex + 1}`);
      const sheetRefCell = worksheet.getCell(`A${rowIndex + 1}`);
      sheetRefCell.value = `Source Sheet: ${sheet?.name || 'Unknown'}`;
      sheetRefCell.font = { italic: true, color: { argb: 'FF595959' } };

      worksheet.getColumn('A').width = 30;
      worksheet.getColumn('B').width = 40;

      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;

    } catch (error) {
      logger.error('Export report to Excel error:', error);
      throw error;
    }
  }

  /**
   * Export multiple sheets to single Excel file with multiple sheets
   * @param {array} sheets - Array of sheet objects
   * @returns {Buffer} - Excel file buffer
   */
  static async exportMultipleSheetsToExcel(sheets) {
    try {
      const workbook = new ExcelJS.Workbook();

      for (const sheet of sheets) {
        const worksheet = workbook.addWorksheet(sheet.name.substring(0, 31));

        // Add headers
        if (sheet.structure && sheet.structure.columns) {
          sheet.structure.columns.forEach((col, index) => {
            const cell = worksheet.getCell(1, index + 1);
            cell.value = col.name;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
          });

          // Add data rows
          if (sheet.structure.rows) {
            sheet.structure.rows.forEach((row, rowIndex) => {
              sheet.structure.columns.forEach((col, colIndex) => {
                const cell = worksheet.getCell(rowIndex + 2, colIndex + 1);
                cell.value = row.data ? row.data[col.id] : '';
              });
            });
          }
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;

    } catch (error) {
      logger.error('Export multiple sheets to Excel error:', error);
      throw error;
    }
  }
}

module.exports = ExcelExportService;
