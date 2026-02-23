// ================================================================
// FORMULA SERVICE (services/FormulaService.js)
// ================================================================
// PURPOSE: Higher-level formula management with DB integration.
//
// While formulaEngine.js does the MATH, this service handles:
//   - Parsing formula strings into structured objects
//   - Fetching cell values from the database
//   - Validating formulas before saving
//   - Managing formula dependencies
//
// Supports 12 formula types:
//   SUM, AVG, COUNT, COUNTA, MIN, MAX, CONCATENATE,
//   INT, ROUND, UPPER, LOWER, LENGTH
//
// METHODS:
//   parseFormula()       — Parse "=SUM(A1:A10)" into structured object
//   validateFormula()    — Validate before saving
//   calculateFormula()   — Calculate result using DB values
//   getCellDependencies() — Find all cells a formula depends on
//   getAvailableFormulas() — List all formulas with descriptions
//
// USED BY: routes/formulas.js, routes/data.js, routes/sheets.js
// ================================================================

const { CellData, Sheet } = require('../models');
const logger = require('../utils/logger');

/**
 * Formula Service
 * Handles Excel-like formula calculations for cells
 * Supports: SUM, AVG, COUNT, MIN, MAX, IF, CONCATENATE, etc.
 */
class FormulaService {
    /**
     * Supported formula types and their implementations
     */
    static FORMULAS = {
        SUM: (values) => values.reduce((a, b) => parseFloat(a) + parseFloat(b), 0),
        AVG: (values) => values.length > 0 ? values.reduce((a, b) => parseFloat(a) + parseFloat(b), 0) / values.length : 0,
        COUNT: (values) => values.length,
        COUNTA: (values) => values.filter(v => v !== null && v !== undefined && v !== '').length,
        MIN: (values) => Math.min(...values.map(v => parseFloat(v))),
        MAX: (values) => Math.max(...values.map(v => parseFloat(v))),
        CONCATENATE: (values) => values.join(''),
        INT: (values) => Math.floor(parseFloat(values[0])),
        ROUND: (values) => Math.round(parseFloat(values[0]) * Math.pow(10, parseInt(values[1] || 0))) / Math.pow(10, parseInt(values[1] || 0)),
        UPPER: (values) => String(values[0]).toUpperCase(),
        LOWER: (values) => String(values[0]).toLowerCase(),
        LENGTH: (values) => String(values[0]).length,
    };

    /**
     * Parse a formula string
     * Examples: "=SUM(A1:A10)", "=AVG(B1:B5)", "=IF(A1>100,A1,0)"
     * @param {string} formula - The formula string
     * @returns {Object} Parsed formula object
     */
    static parseFormula(formula) {
        if (!formula || typeof formula !== 'string' || !formula.startsWith('=')) {
            return null;
        }

        const formulaContent = formula.substring(1).trim();
        
        // Extract function name and arguments
        const functionMatch = formulaContent.match(/^([A-Z]+)\s*\((.*)\)$/i);
        if (!functionMatch) {
            return null;
        }

        const [, functionName, argsString] = functionMatch;
        const args = this.parseFormulaArguments(argsString);

        return {
            type: 'formula',
            function: functionName.toUpperCase(),
            arguments: args,
            raw: formula,
            isValid: this.isValidFormula(functionName, args)
        };
    }

    /**
     * Parse formula arguments handling ranges and cell references
     * @param {string} argsString - Comma-separated arguments
     * @returns {Array} Parsed arguments
     */
    static parseFormulaArguments(argsString) {
        const args = [];
        let current = '';
        let depth = 0;

        for (let i = 0; i < argsString.length; i++) {
            const char = argsString[i];
            
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            } else if (char === ',' && depth === 0) {
                args.push(current.trim());
                current = '';
                continue;
            }
            
            current += char;
        }

        if (current.trim()) {
            args.push(current.trim());
        }

        return args;
    }

    /**
     * Validate if formula is properly formed
     * @param {string} functionName - Function name
     * @param {Array} args - Arguments array
     * @returns {boolean} Whether formula is valid
     */
    static isValidFormula(functionName, args) {
        const fname = functionName.toUpperCase();
        
        if (!this.FORMULAS.hasOwnProperty(fname)) {
            return false;
        }

        // Validate argument count for specific functions
        const argCountRules = {
            'ROUND': { min: 2, max: 2 },
            'INT': { min: 1, max: 1 },
            'UPPER': { min: 1, max: 1 },
            'LOWER': { min: 1, max: 1 },
            'LENGTH': { min: 1, max: 1 },
        };

        const rules = argCountRules[fname];
        if (rules && (args.length < rules.min || args.length > rules.max)) {
            return false;
        }

        return true;
    }

    /**
     * Extract cell references from a formula
     * Handles single cells (A1) and ranges (A1:A10)
     * @param {string} cellRef - Cell reference string
     * @returns {Array} Array of cell references
     */
    static extractCellReferences(cellRef) {
        const cells = [];
        
        // Handle range (e.g., A1:A10)
        if (cellRef.includes(':')) {
            const [start, end] = cellRef.split(':');
            cells.push(...this.expandRange(start, end));
        } else {
            // Single cell reference
            cells.push(cellRef.toUpperCase());
        }

        return cells;
    }

    /**
     * Expand a range into individual cell references
     * @param {string} start - Start cell (e.g., A1)
     * @param {string} end - End cell (e.g., A10)
     * @returns {Array} Array of cell references
     */
    static expandRange(start, end) {
        const cells = [];
        const startMatch = start.match(/([A-Z]+)(\d+)/);
        const endMatch = end.match(/([A-Z]+)(\d+)/);

        if (!startMatch || !endMatch) {
            return [start];
        }

        const [, startCol, startRow] = startMatch;
        const [, endCol, endRow] = endMatch;
        const startRowNum = parseInt(startRow);
        const endRowNum = parseInt(endRow);

        // Simple implementation for same column ranges
        if (startCol === endCol) {
            for (let i = startRowNum; i <= endRowNum; i++) {
                cells.push(`${startCol}${i}`);
            }
        } else {
            // For multi-column ranges, just return start and end for now
            cells.push(start);
            cells.push(end);
        }

        return cells;
    }

    /**
     * Get cell values for formula calculation
     * @param {Array} cellReferences - Array of cell references
     * @param {string} sheetId - Sheet ID
     * @returns {Promise<Array>} Array of cell values
     */
    static async getCellValues(cellReferences, sheetId) {
        try {
            const cells = await CellData.findAll({
                where: {
                    sheetId,
                    cellId: cellReferences
                },
                attributes: ['cellId', 'value'],
                raw: true
            });

            // Map cell IDs to values
            const valueMap = {};
            cells.forEach(cell => {
                valueMap[cell.cellId] = cell.value;
            });

            // Return values in the order requested
            return cellReferences.map(ref => valueMap[ref] || 0);
        } catch (error) {
            logger.error('Error getting cell values for formula:', error);
            return [];
        }
    }

    /**
     * Calculate formula result
     * @param {string} formula - Formula string
     * @param {string} sheetId - Sheet ID
     * @returns {Promise<number|string>} Calculated result
     */
    static async calculateFormula(formula, sheetId) {
        try {
            const parsed = this.parseFormula(formula);
            
            if (!parsed || !parsed.isValid) {
                return `#ERROR - Invalid formula: ${formula}`;
            }

            const { function: funcName, arguments: args } = parsed;
            const fn = this.FORMULAS[funcName];

            // Extract cell references from arguments
            const allCellRefs = [];
            args.forEach(arg => {
                if (this.isCellReference(arg)) {
                    allCellRefs.push(...this.extractCellReferences(arg));
                }
            });

            // Get values for cell references
            let values = [];
            if (allCellRefs.length > 0) {
                values = await this.getCellValues(allCellRefs, sheetId);
            } else {
                // Use argument values directly
                values = args.map(arg => {
                    // Try to parse as number, otherwise keep as string
                    const num = parseFloat(arg);
                    return isNaN(num) ? arg : num;
                });
            }

            // Call formula function
            const result = fn(values);
            return isNaN(result) ? result : parseFloat(result.toFixed(2));

        } catch (error) {
            logger.error('Error calculating formula:', error);
            return `#ERROR - ${error.message}`;
        }
    }

    /**
     * Check if a string is a cell reference
     * @param {string} str - String to check
     * @returns {boolean} Whether it's a cell reference
     */
    static isCellReference(str) {
        return /^[A-Z]+\d+(?::[A-Z]+\d+)?$/i.test(str);
    }

    /**
     * Track formula dependencies
     * @param {string} formula - Formula string
     * @returns {Array} Array of dependent cell references
     */
    static extractDependencies(formula) {
        const parsed = this.parseFormula(formula);
        if (!parsed) return [];

        const dependencies = [];
        parsed.arguments.forEach(arg => {
            if (this.isCellReference(arg)) {
                dependencies.push(...this.extractCellReferences(arg));
            }
        });

        return dependencies;
    }

    /**
     * Validate formula before saving
     * @param {string} formula - Formula to validate
     * @returns {Object} Validation result
     */
    static validateFormula(formula) {
        const result = {
            valid: false,
            error: null,
            message: null
        };

        if (!formula || typeof formula !== 'string') {
            result.error = 'Formula must be a non-empty string';
            return result;
        }

        if (!formula.startsWith('=')) {
            result.error = 'Formula must start with "="';
            return result;
        }

        const parsed = this.parseFormula(formula);
        if (!parsed) {
            result.error = 'Invalid formula syntax';
            return result;
        }

        if (!parsed.isValid) {
            result.error = `Unknown function or invalid arguments: ${parsed.function}`;
            return result;
        }

        result.valid = true;
        result.message = `Formula "${parsed.function}" is valid`;
        return result;
    }

    /**
     * Get list of available formulas with descriptions
     * @returns {Array} Array of available formulas
     */
    static getAvailableFormulas() {
        return [
            {
                name: 'SUM',
                description: 'Sum of values',
                example: '=SUM(A1:A10)',
                syntax: '=SUM(range)'
            },
            {
                name: 'AVG',
                description: 'Average of values',
                example: '=AVG(A1:A10)',
                syntax: '=AVG(range)'
            },
            {
                name: 'COUNT',
                description: 'Count of numeric values',
                example: '=COUNT(A1:A10)',
                syntax: '=COUNT(range)'
            },
            {
                name: 'COUNTA',
                description: 'Count of non-empty cells',
                example: '=COUNTA(A1:A10)',
                syntax: '=COUNTA(range)'
            },
            {
                name: 'MIN',
                description: 'Minimum value',
                example: '=MIN(A1:A10)',
                syntax: '=MIN(range)'
            },
            {
                name: 'MAX',
                description: 'Maximum value',
                example: '=MAX(A1:A10)',
                syntax: '=MAX(range)'
            },
            {
                name: 'CONCATENATE',
                description: 'Concatenate strings',
                example: '=CONCATENATE(A1,B1)',
                syntax: '=CONCATENATE(value1,value2,...)'
            },
            {
                name: 'ROUND',
                description: 'Round to decimal places',
                example: '=ROUND(A1,2)',
                syntax: '=ROUND(value,decimals)'
            },
            {
                name: 'INT',
                description: 'Integer part of number',
                example: '=INT(A1)',
                syntax: '=INT(value)'
            },
            {
                name: 'UPPER',
                description: 'Convert to uppercase',
                example: '=UPPER(A1)',
                syntax: '=UPPER(text)'
            },
            {
                name: 'LOWER',
                description: 'Convert to lowercase',
                example: '=LOWER(A1)',
                syntax: '=LOWER(text)'
            },
            {
                name: 'LENGTH',
                description: 'Length of text',
                example: '=LENGTH(A1)',
                syntax: '=LENGTH(text)'
            }
        ];
    }
}

module.exports = FormulaService;
