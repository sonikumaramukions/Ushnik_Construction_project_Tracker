// ================================================================
// FORMULA ENGINE (services/formulaEngine.js)
// ================================================================
// PURPOSE: The CORE math engine that evaluates Excel-like formulas.
//
// Supports:
//   =SUM(A1:A10)    — Add up cells A1 through A10
//   =AVG(B1:B5)     — Average of cells B1 through B5
//   =MIN(C1:C20)    — Smallest value in range
//   =MAX(C1:C20)    — Largest value in range
//   =COUNT(A1:A10)  — Count of non-empty cells
//   =PRODUCT(A1:A5) — Multiply all values together
//   =CONCATENATE(A1,B1) — Join text values
//
// KEY METHODS:
//   validateFormula()    — Check if formula syntax is valid
//   extractCellRefs()    — Find all cell references (A1, B3, etc.)
//   expandRange()        — Convert A1:A10 to [A1, A2, ..., A10]
//   calculateFormula()   — Evaluate formula with cell values
//   recalculateSheet()   — Recalculate ALL formulas (handles dependencies)
//
// USED BY: routes/data.js, routes/sheets.js, services/FormulaService.js
// ================================================================

/**
 * Formula Engine for Sheet Cell Calculations
 * Supports: SUM, AVG, MIN, MAX, COUNT, PRODUCT
 */

class FormulaEngine {
  /**
   * Parse and validate formula syntax
   * @param {string} formula - Formula string like =SUM(A1:A10) or =AVG(B1,B2,B3)
   * @returns {boolean} - Valid formula
   */
  static validateFormula(formula) {
    if (!formula.startsWith('=')) return false;
    
    const supportedFunctions = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'PRODUCT', 'CONCATENATE'];
    const functionMatch = formula.match(/^=([A-Z]+)\(/);
    
    if (!functionMatch) return false;
    
    const functionName = functionMatch[1];
    return supportedFunctions.includes(functionName);
  }

  /**
   * Extract cell references from formula
   * @param {string} formula - Formula string
   * @returns {array} - Array of cell references like ['A1', 'A2', 'B1']
   */
  static extractCellReferences(formula) {
    const cells = [];
    const cellPattern = /([A-Z]+\d+)/g;
    let match;
    
    while ((match = cellPattern.exec(formula)) !== null) {
      cells.push(match[1]);
    }
    
    return [...new Set(cells)]; // Remove duplicates
  }

  /**
   * Convert cell reference to grid position
   * @param {string} cellRef - Cell reference like A1, B5
   * @returns {object} - {row: number, col: number}
   */
  static cellRefToPosition(cellRef) {
    const col = cellRef.charCodeAt(0) - 65; // A=0, B=1, etc.
    const row = parseInt(cellRef.substring(1)) - 1;
    return { row, col };
  }

  /**
   * Convert grid position to cell reference
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @returns {string} - Cell reference
   */
  static positionToCellRef(row, col) {
    const colLetter = String.fromCharCode(65 + col);
    return `${colLetter}${row + 1}`;
  }

  /**
   * Parse range reference like A1:A10
   * @param {string} range - Range string
   * @returns {array} - Array of cell references
   */
  static parseRange(range) {
    const [start, end] = range.split(':');
    if (!start || !end) return [start];
    
    const startPos = this.cellRefToPosition(start);
    const endPos = this.cellRefToPosition(end);
    
    const cells = [];
    for (let row = startPos.row; row <= endPos.row; row++) {
      for (let col = startPos.col; col <= endPos.col; col++) {
        cells.push(this.positionToCellRef(row, col));
      }
    }
    
    return cells;
  }

  /**
   * Calculate formula result
   * @param {string} formula - Formula string
   * @param {object} cellValues - Map of cell references to values {A1: 10, A2: 20}
   * @returns {number|string} - Calculated result
   */
  static calculate(formula, cellValues) {
    try {
      if (!formula.startsWith('=')) {
        return formula;
      }

      let processedFormula = formula.substring(1); // Remove =

      // Extract function name and arguments
      const functionMatch = processedFormula.match(/^([A-Z]+)\((.*)\)$/);
      if (!functionMatch) {
        throw new Error('Invalid formula format');
      }

      const [, functionName, argsStr] = functionMatch;

      // Parse arguments (handle ranges and single cells)
      const args = argsStr.split(',').map(arg => {
        arg = arg.trim();
        if (arg.includes(':')) {
          // It's a range
          return this.parseRange(arg);
        } else {
          return [arg];
        }
      }).flat();

      // Resolve cell references to values
      const values = args
        .map(cellRef => cellValues[cellRef.trim()])
        .filter(val => val !== undefined && val !== null && val !== '')
        .map(val => parseFloat(val))
        .filter(val => !isNaN(val));

      if (values.length === 0) {
        return 0;
      }

      // Execute formula function
      switch (functionName) {
        case 'SUM':
          return values.reduce((a, b) => a + b, 0);
        
        case 'AVG':
          return values.reduce((a, b) => a + b, 0) / values.length;
        
        case 'MIN':
          return Math.min(...values);
        
        case 'MAX':
          return Math.max(...values);
        
        case 'COUNT':
          return values.length;
        
        case 'PRODUCT':
          return values.reduce((a, b) => a * b, 1);
        
        case 'CONCATENATE':
          return args.map(cellRef => cellValues[cellRef.trim()] || '').join('');
        
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
    } catch (error) {
      console.error('Formula calculation error:', error);
      return 0;
    }
  }

  /**
   * Recalculate all formulas in a sheet
   * @param {object} formulas - Map of cell IDs to formulas
   * @param {object} cellData - Map of cell IDs to cell data objects
   * @returns {object} - Updated cell data with calculated values
   */
  static recalculateSheet(formulas, cellData) {
    // Build dependency graph: node -> referenced nodes
    const graph = {};
    const allCells = new Set(Object.keys(cellData || {}));
    Object.entries(formulas || {}).forEach(([cellId, formula]) => {
      if (!formula || !formula.startsWith('=')) return;
      const refs = this.extractCellReferences(formula);
      // Exclude self-references — a cell referencing itself gets 0 for that ref
      graph[cellId] = refs.filter(r => !!r && r !== cellId);
      refs.forEach(r => allCells.add(r));
    });

    // Topological sort with per-node cycle detection
    // Only marks actual cycle participants as #CYCLE, not all formulas
    const visited = {};
    const temp = {};
    const order = [];
    const cycleNodes = new Set();

    function visit(node) {
      if (temp[node]) {
        cycleNodes.add(node);
        return;
      }
      if (visited[node]) return;
      temp[node] = true;
      const edges = graph[node] || [];
      for (const e of edges) {
        if (graph[e]) visit(e);
        if (cycleNodes.has(e)) cycleNodes.add(node); // propagate cycle to dependents
      }
      visited[node] = true;
      temp[node] = false;
      order.push(node);
    }

    Object.keys(graph).forEach(node => { if (!visited[node]) visit(node); });

    const results = { ...cellData };

    // Mark only cycle-participating nodes as #CYCLE
    cycleNodes.forEach(k => {
      results[k] = results[k] || {};
      results[k].value = '#CYCLE';
      results[k].isCalculated = true;
    });

    // Evaluate non-cycle formulas in topological order
    order.reverse(); // ensure dependencies evaluated first
    for (const cellId of order) {
      if (cycleNodes.has(cellId)) continue; // skip cycle nodes
      const formula = formulas[cellId];
      try {
        const currentMap = Object.entries(results).reduce((acc, [id, c]) => ({ ...acc, [id]: c?.value }), {});
        const newValue = this.calculate(formula, currentMap);
        results[cellId] = results[cellId] || {};
        results[cellId].value = newValue;
        results[cellId].isCalculated = true;
      } catch (err) {
        results[cellId] = results[cellId] || {};
        results[cellId].value = '#ERR';
        results[cellId].isCalculated = true;
      }
    }

    return results;
  }
}

module.exports = FormulaEngine;
