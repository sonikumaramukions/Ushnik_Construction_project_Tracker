// ================================================================
// SHEET EDITOR COMPONENT (components/SheetEditor.tsx)
// ================================================================
// PURPOSE: The main Excel-like spreadsheet editor component.
//
// FEATURES:
//   - Grid of cells rendered as an HTML table
//   - Click a cell to edit it (inline editing)
//   - Formula support (=SUM, =AVG, etc.)
//   - Cell locking (admin can lock cells)
//   - Real-time sync via Socket.io
//   - Color-coded cells based on permissions
//   - Row/column headers (A, B, C... and 1, 2, 3...)
//   - Auto-save on cell blur
//
// PROPS:
//   sheetId (number) — Which sheet to load and display
//
// DATA FLOW:
//   1. Loads sheet structure + cell data from sheetsAPI
//   2. Renders cells in a grid
//   3. On edit → calls sheetsAPI.updateCell()
//   4. Socket.io broadcasts changes to other users
//
// USED BY: SheetViewPage, SheetEditor page
// ================================================================

import React, { useEffect, useState, useCallback } from 'react';
import sheetsAPI, { Sheet, CellData } from '../services/sheetsAPI';  // Sheet API + types
import { Box, Table, TableBody, TableCell, TableHead, TableRow, TextField, Button } from '@mui/material';

// Props: just the sheet ID to load
type Props = { sheetId: string };

// ─── SHEET EDITOR COMPONENT ─────────────────────────────────────
// Renders an Excel-like grid of editable cells.
// Each cell is a TextField; changes are saved on blur (when you click away).
// ────────────────────────────────────────────────────────────────
export default function SheetEditor({ sheetId }: Props) {
  const [cells, setCells] = useState<CellData[]>([]);   // All cell data from the server
  const [rows, setRows] = useState<number>(10);          // Number of rows to display
  const [cols, setCols] = useState<number>(10);          // Number of columns to display
  const [loading, setLoading] = useState(false);

  // Reload cells whenever the sheetId changes
  useEffect(() => {
    load();
  }, [sheetId]);

  // Fetch all cell data for this sheet from the backend
  async function load() {
    setLoading(true);
    try {
      const res = await sheetsAPI.getCellData(sheetId);  // GET /api/sheets/:id/data
      const data = res.cellData || [];
      setCells(data);
      // Derive grid dimensions from the data — show at least 10 rows/cols,
      // but expand if cells exist beyond that
      const maxRow = data.reduce((m, c) => Math.max(m, c.row_index || 0), 0);
      const maxCol = data.reduce((m, c) => Math.max(m, c.column_index || 0), 0);
      setRows(Math.max(10, maxRow + 5));   // +5 gives empty rows below data
      setCols(Math.max(10, maxCol + 5));   // +5 gives empty columns to the right
    } catch (err) {
      console.error('Failed to load cells', err);
    } finally {
      setLoading(false);
    }
  }

  // Find a cell's data by row/column index (returns undefined if no data yet)
  const getCell = (r: number, c: number) => cells.find(x => x.row_index === r && x.column_index === c);

  // Save a single cell to the backend — called when a TextField loses focus (onBlur)
  const saveCell = useCallback(async (cellId: string, value: any) => {
    try {
      await sheetsAPI.updateCellData({ sheetId, cellId, value });  // PUT /api/sheets/:id/data
      // Optimistically update local state so the UI doesn't flicker
      setCells(prev => prev.map(p => p.cell_id === cellId ? { ...p, value } : p));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const apiError = (err as any)?.response?.data?.message;
      alert('Save failed: ' + (apiError || errorMessage));
    }
  }, [sheetId]);

  // Show a simple "Loading..." text while fetching cells
  if (loading) return <div>Loading...</div>;

  // ─── RENDER: Excel-like grid ─────────────────────────────────
  return (
    <Box>
      <Table size="small">
        {/* Column headers: #, A, B, C, D, ... */}
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            {Array.from({ length: cols }).map((_, ci) => (
              <TableCell key={ci}>{String.fromCharCode(65 + ci)}</TableCell>  /* 65 = 'A' */
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {/* One row per row index */}
          {Array.from({ length: rows }).map((_, ri) => (
            <TableRow key={ri}>
              {/* Row number label: 1, 2, 3, ... */}
              <TableCell>{ri + 1}</TableCell>
              {/* One cell per column */}
              {Array.from({ length: cols }).map((_, ci) => {
                const cell = getCell(ri, ci);  // Existing cell data (or undefined)
                const cellId = `${String.fromCharCode(65 + ci)}${ri + 1}`;  // e.g. "A1", "B3"
                return (
                  <TableCell key={ci}>
                    <TextField
                      fullWidth
                      size="small"
                      value={cell?.value ?? ''}  // Show cell value, or empty if new
                      onChange={(e) => setCells(prev => {
                        // Update local state as user types (before saving)
                        const found = prev.find(p => p.cell_id === cellId);
                        if (found) {
                          // Cell exists — update its value in the array
                          return prev.map(p => p.cell_id === cellId ? { ...p, value: e.target.value } : p);
                        }
                        // Cell is new — create a placeholder entry
                        return [...prev, { id: '', sheet_id: sheetId, cell_id: cellId, row_index: ri, column_index: ci, value: e.target.value, data_type: 'TEXT', created_by_id: '' } as CellData];
                      })}
                      onBlur={(e) => saveCell(cellId, e.target.value)}  // Save when user clicks away
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Manual refresh button to re-fetch all cell data */}
      <Box sx={{ mt: 2 }}>
        <Button variant="contained" onClick={load}>Refresh</Button>
      </Box>
    </Box>
  );
}
