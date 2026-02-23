// ================================================================
// SHEET EDITOR PAGE (pages/SheetEditor.tsx)
// ================================================================
// PURPOSE: Full-page DPR-style editor for assigned sheets.
//
// Renders the COMPLETE spreadsheet with professional DPR formatting:
//   - All admin data visible with proper styling (colors, fonts, alignment)
//   - Section headers with colored backgrounds (salmon, yellow, etc.)
//   - Total rows with green highlighting
//   - Merged cells for section spans
//   - Assigned cells highlighted with GREEN border (user can edit)
//   - Locked cells highlighted with ORANGE border (read-only)
//   - Non-assigned cells shown with original styling (context)
//   - Click-to-edit on permitted cells
//   - Submit for review button
//
// ROUTE: /my-sheets/:sheetId
// DATA: GET /api/my-sheets/:sheetId → cellData + permissions
// USED BY: App.tsx route, MySheets page navigation
// ================================================================

import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Button, TextField,
    Chip, Dialog, DialogTitle, DialogContent, DialogActions,
    Alert, Container, LinearProgress, IconButton,
} from '@mui/material';
import {
    Lock as LockIcon,
    Edit as EditIcon,
    Save as SaveIcon,
    Send as SendIcon,
    ArrowBack as ArrowBackIcon,
    Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

// ─── TYPE: Permission settings for one cell ───
interface CellPermission {
    canView: boolean;
    canEdit: boolean;
    isLocked: boolean;
}

// ─── TYPE: Cell Style from admin ───
interface CellStyle {
    backgroundColor?: string;
    color?: string;
    fontWeight?: 'normal' | 'bold';
    textAlign?: 'left' | 'center' | 'right';
    fontSize?: string;
}

// ─── TYPE: A sheet assigned to the current user ───
interface UserSheet {
    id: string;
    sheetId: string;
    status: string;
    progress: number;
    cellChanges: any;
    sheet?: {
        id: string;
        name: string;
        description?: string;
        structure?: {
            columns?: any[];
            rows?: any[];
            cols?: number;
            mergedCells?: Array<{
                startRow: number; startCol: number; endRow: number; endCol: number;
            }>;
            cellStyles?: { [key: string]: CellStyle };
            lockedCells?: { [key: string]: boolean };
            columnWidths?: { [key: number]: number };
            rowHeights?: { [key: number]: number };
        };
    };
}

// ─── SHEET EDITOR PAGE ──────────────────────────────────────
const SheetEditor: React.FC = () => {
    const { sheetId } = useParams<{ sheetId: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [userSheet, setUserSheet] = useState<UserSheet | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_cellData, setCellData] = useState<any[]>([]);
    const [permissions, setPermissions] = useState<{ [key: string]: CellPermission }>({});
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [showSubmitDialog, setShowSubmitDialog] = useState(false);
    const [submitNotes, setSubmitNotes] = useState('');

    // Spreadsheet data: cellId → value
    const [spreadsheetData, setSpreadsheetData] = useState<{ [key: string]: string }>({});

    // Dynamic grid size
    const [rows, setRows] = useState(10);
    const [cols, setCols] = useState(10);

    // Merged cells and cell styles from admin's structure
    const [mergedCells, setMergedCells] = useState<Array<{
        startRow: number; startCol: number; endRow: number; endCol: number;
    }>>([]);
    const [cellStyles, setCellStyles] = useState<{ [key: string]: CellStyle }>({});

    // Admin-locked cells and column/row sizes from structure
    const [adminLockedCells, setAdminLockedCells] = useState<{ [key: string]: boolean }>({});
    const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({});
    const [rowHeights, setRowHeights] = useState<{ [key: number]: number }>({});

    // Assignment visibility: which rows/columns/cells the user is assigned to
    const [assignment, setAssignment] = useState<{
        hasGranularAssignment: boolean;
        assignedRows: number[];
        assignedColumns: string[];
        assignedCells: string[];
    }>({ hasGranularAssignment: false, assignedRows: [], assignedColumns: [], assignedCells: [] });

    // Load sheet data when sheetId is available
    useEffect(() => {
        if (sheetId) loadSheet();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sheetId]);

    // Fetch the sheet's data, permissions, and cell values
    const loadSheet = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/my-sheets/${sheetId}`);

            const us = response.data.userSheet;
            const cd = response.data.cellData || [];
            const pm = response.data.permissions || {};

            setUserSheet(us);
            setCellData(cd);
            setPermissions(pm);

            // Convert cell data to lookup map
            const data: { [key: string]: string } = {};
            let maxRow = 0;
            let maxCol = 0;

            cd.forEach((cell: any) => {
                data[cell.cellId] = cell.value || '';
                const match = cell.cellId.match(/^([A-Z]+)(\d+)$/);
                if (match) {
                    const colIdx = match[1].charCodeAt(0) - 65;
                    const rowIdx = parseInt(match[2]) - 1;
                    if (rowIdx > maxRow) maxRow = rowIdx;
                    if (colIdx > maxCol) maxCol = colIdx;
                }
            });

            // Also check permissions for assigned cells that may not have data
            Object.keys(pm).forEach(cellId => {
                const match = cellId.match(/^([A-Z]+)(\d+)$/);
                if (match) {
                    const colIdx = match[1].charCodeAt(0) - 65;
                    const rowIdx = parseInt(match[2]) - 1;
                    if (rowIdx > maxRow) maxRow = rowIdx;
                    if (colIdx > maxCol) maxCol = colIdx;
                }
            });

            // Load structure (grid size, merges, styles)
            const structure = us?.sheet?.structure;
            if (structure) {
                if (structure.columns && structure.columns.length > maxCol + 1) {
                    maxCol = structure.columns.length - 1;
                }
                if (structure.rows && typeof structure.rows === 'number') {
                    if (structure.rows > maxRow + 1) maxRow = structure.rows - 1;
                } else if (structure.rows && Array.isArray(structure.rows) && structure.rows.length > maxRow + 1) {
                    maxRow = structure.rows.length - 1;
                }
                if (structure.cols && structure.cols > maxCol + 1) {
                    maxCol = structure.cols - 1;
                }

                // Load merged cells
                if (structure.mergedCells && Array.isArray(structure.mergedCells)) {
                    setMergedCells(structure.mergedCells);
                } else {
                    setMergedCells([]);
                }

                // Load cell styles from admin
                if (structure.cellStyles && typeof structure.cellStyles === 'object') {
                    setCellStyles(structure.cellStyles);
                } else {
                    setCellStyles({});
                }

                // Load admin-locked cells from structure
                if (structure.lockedCells && typeof structure.lockedCells === 'object') {
                    setAdminLockedCells(structure.lockedCells);
                } else {
                    setAdminLockedCells({});
                }

                // Load column widths and row heights
                if (structure.columnWidths) setColumnWidths(structure.columnWidths);
                else setColumnWidths({});
                if (structure.rowHeights) setRowHeights(structure.rowHeights);
                else setRowHeights({});
            }

            setSpreadsheetData(data);
            setRows(Math.max(maxRow + 2, 10));
            setCols(Math.max(maxCol + 1, 8));

            // Load assignment visibility data (row/column/cell level)
            if (response.data.assignment) {
                setAssignment(response.data.assignment);
            } else {
                setAssignment({ hasGranularAssignment: false, assignedRows: [], assignedColumns: [], assignedCells: [] });
            }

            // Auto-update status from pending to in_progress
            if (us?.status === 'pending') {
                await api.put(`/my-sheets/${sheetId}/status`, { status: 'in_progress' }).catch(() => {});
            }

        } catch (error: any) {
            console.error('Failed to load sheet:', error);
            toast.error(error.response?.data?.message || 'Failed to load sheet');
            navigate('/my-sheets');
        } finally {
            setLoading(false);
        }
    };

    // Convert row/col indices to cell ID like "A1"
    const getCellId = (row: number, col: number): string => {
        const colLetter = String.fromCharCode(65 + col);
        return `${colLetter}${row + 1}`;
    };

    // ─── ASSIGNMENT VISIBILITY CHECK ───
    // Returns true if the cell is assigned to this user (or no granular assignment exists)
    const isCellAssigned = (row: number, col: number): boolean => {
        if (!assignment.hasGranularAssignment) return true; // SHEET-level = see everything

        const cellId = getCellId(row, col);
        const colLetter = String.fromCharCode(65 + col);
        const rowNum = row + 1; // 1-based

        // Check if specific cell is assigned
        if (assignment.assignedCells.includes(cellId)) return true;

        // Check if the row is assigned
        if (assignment.assignedRows.includes(rowNum)) return true;

        // Check if the column is assigned
        if (assignment.assignedColumns.includes(colLetter)) return true;

        // Check if BOTH row and column are assigned (intersection)
        // If user has both row and column assignments, a cell is visible if its row OR column is assigned
        // (already handled above)

        return false;
    };

    // Check permissions before allowing edit
    const handleCellClick = (cellId: string) => {
        // Block admin-locked cells
        if (adminLockedCells[cellId]) {
            toast('This cell is locked by admin', { icon: '🔒' });
            return;
        }
        const perm = permissions[cellId];
        if (!perm) return;
        if (!perm.canView) return;
        if (perm.isLocked || !perm.canEdit) {
            toast('This cell is locked or read-only', { icon: '🔒' });
            return;
        }
        setEditingCell(cellId);
        setEditValue(spreadsheetData[cellId] || '');
    };

    // Save cell value to backend
    const handleCellUpdate = async () => {
        if (!editingCell) return;
        try {
            await api.put(`/my-sheets/${sheetId}/cells/${editingCell}`, { value: editValue });
            setSpreadsheetData(prev => ({ ...prev, [editingCell]: editValue }));
            toast.success('Cell updated');
            setEditingCell(null);
            setEditValue('');
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to update cell');
        }
    };

    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleCellUpdate();
        }
    };

    // Submit all changes for admin review
    const handleSubmitChanges = async () => {
        try {
            await api.post(`/my-sheets/${sheetId}/submit`, { notes: submitNotes });
            toast.success('Changes submitted for review');
            setShowSubmitDialog(false);
            setSubmitNotes('');
            navigate('/my-sheets');
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to submit changes');
        }
    };

    // ─── CELL STYLING ───
    // Combines admin styling with permission indicators
    const getCellStyle = (cellId: string): React.CSSProperties => {
        const perm = permissions[cellId];
        const adminStyle = cellStyles[cellId] || {};
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _hasData = spreadsheetData[cellId] !== undefined && spreadsheetData[cellId] !== '';

        // Base style from admin's DPR formatting
        const base: React.CSSProperties = {
            backgroundColor: adminStyle.backgroundColor || '#ffffff',
            color: adminStyle.color || '#333',
            fontWeight: adminStyle.fontWeight || 'normal',
            textAlign: (adminStyle.textAlign as any) || 'left',
            fontSize: adminStyle.fontSize || '0.8rem',
        };

        if (!perm) {
            // No permissions = admin data / context cell → show with admin styling
            // But check if admin explicitly locked it
            if (adminLockedCells[cellId]) {
                return {
                    ...base,
                    cursor: 'not-allowed',
                };
            }
            return {
                ...base,
                cursor: 'default',
            };
        }

        if (!perm.canView) {
            return { backgroundColor: '#f5f5f5', cursor: 'not-allowed', color: '#ccc' };
        }

        if (perm.isLocked || !perm.canEdit) {
            return {
                ...base,
                cursor: 'not-allowed',
            };
        }

        // Editable cell: show admin styling but add a green indicator
        return {
            ...base,
            cursor: 'pointer',
        };
    };

    const isCellEditable = (cellId: string): boolean => {
        // Check admin-locked cells from structure AND permission-based locks
        if (adminLockedCells[cellId]) return false;
        const perm = permissions[cellId];
        return perm?.canEdit && !perm?.isLocked ? true : false;
    };

    // Progress tracking — only count assigned cells
    const editableCellCount = Object.entries(permissions)
        .filter(([cellId, p]) => {
            if (!p.canEdit || p.isLocked) return false;
            // If granular assignment, only count assigned cells
            if (assignment.hasGranularAssignment) {
                const match = cellId.match(/^([A-Z]+)(\d+)$/);
                if (!match) return false;
                const colLetter = match[1];
                const rowNum = parseInt(match[2]);
                const colIdx = colLetter.charCodeAt(0) - 65;
                const rowIdx = rowNum - 1;
                return isCellAssigned(rowIdx, colIdx);
            }
            return true;
        }).length;
    const filledEditableCells = Object.entries(permissions)
        .filter(([cellId, p]) => {
            if (!p.canEdit || p.isLocked) return false;
            if (assignment.hasGranularAssignment) {
                const match = cellId.match(/^([A-Z]+)(\d+)$/);
                if (!match) return false;
                const colLetter = match[1];
                const rowNum = parseInt(match[2]);
                const colIdx = colLetter.charCodeAt(0) - 65;
                const rowIdx = rowNum - 1;
                return isCellAssigned(rowIdx, colIdx);
            }
            return true;
        })
        .filter(([cellId]) => spreadsheetData[cellId] && spreadsheetData[cellId].trim() !== '')
        .length;
    const progressPercent = editableCellCount > 0 ? Math.round((filledEditableCells / editableCellCount) * 100) : 0;

    // ─── MERGE HELPERS ───
    const getMergeInfo = (row: number, col: number) => {
        for (const merge of mergedCells) {
            if (row >= merge.startRow && row <= merge.endRow &&
                col >= merge.startCol && col <= merge.endCol) {
                return {
                    isMerged: true,
                    isOrigin: row === merge.startRow && col === merge.startCol,
                    rowSpan: merge.endRow - merge.startRow + 1,
                    colSpan: merge.endCol - merge.startCol + 1,
                };
            }
        }
        return { isMerged: false, isOrigin: false, rowSpan: 1, colSpan: 1 };
    };

    if (loading) {
        return (
            <Container maxWidth="xl" sx={{ mt: 4 }}>
                <LinearProgress />
                <Typography sx={{ mt: 2 }}>Loading spreadsheet...</Typography>
            </Container>
        );
    }

    if (!userSheet) {
        return (
            <Container maxWidth="xl" sx={{ mt: 4 }}>
                <Alert severity="error">Sheet not found or you don't have access.</Alert>
            </Container>
        );
    }

    const sheetName = userSheet.sheet?.name || 'Untitled Sheet';
    const isSubmitted = userSheet.status === 'submitted' || userSheet.status === 'completed';

    return (
        <Container maxWidth="xl" sx={{ mt: 2, mb: 4, px: { xs: 1, sm: 2, md: 3 } }}>
            {/* ─── HEADER BAR ─── */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton onClick={() => navigate('/my-sheets')} size="small">
                            <ArrowBackIcon />
                        </IconButton>
                        <Box>
                            <Typography variant="h5" sx={{ fontWeight: 600 }}>
                                📊 {sheetName}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                                <Chip
                                    label={userSheet.status?.toUpperCase().replace('_', ' ')}
                                    color={userSheet.status === 'completed' ? 'success' : userSheet.status === 'submitted' ? 'info' : 'primary'}
                                    size="small"
                                />
                                <Typography variant="caption" color="text.secondary">
                                    Progress: {filledEditableCells}/{editableCellCount} cells ({progressPercent}%)
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={loadSheet}>
                            Refresh
                        </Button>
                        <Button variant="contained" color="primary" startIcon={<SendIcon />}
                            onClick={() => setShowSubmitDialog(true)} disabled={isSubmitted}>
                            Submit for Review
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* ─── LEGEND ─── */}
            <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ mr: 1 }}>Legend:</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 16, height: 16, border: '3px solid #4caf50', borderRadius: '2px', bgcolor: '#e8f5e9' }} />
                    <Typography variant="caption">Your cells (click to edit)</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 16, height: 16, border: '3px solid #ff9800', borderRadius: '2px', bgcolor: '#fff3e0' }} />
                    <Typography variant="caption">Locked / Read-only</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 16, height: 16, border: '1px solid #ccc', borderRadius: '2px', bgcolor: '#f5f5f5' }} />
                    <Typography variant="caption">Sheet data (view only)</Typography>
                </Box>
                {assignment.hasGranularAssignment && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: '2px', bgcolor: '#e0e0e0', opacity: 0.5 }} />
                        <Typography variant="caption">Not assigned to you</Typography>
                    </Box>
                )}
                {assignment.hasGranularAssignment && (
                    <Chip
                        label={`Assigned: ${assignment.assignedRows.length} rows, ${assignment.assignedColumns.length} cols, ${assignment.assignedCells.length} cells`}
                        size="small"
                        color="primary"
                        variant="outlined"
                    />
                )}
            </Paper>

            {/* ─── DPR SPREADSHEET GRID ─── */}
            <Paper sx={{ overflow: 'hidden', mb: 2 }}>
                <Box sx={{
                    overflowX: 'auto', overflowY: 'auto',
                    maxHeight: 'calc(100vh - 300px)',
                }}>
                    <table style={{ borderCollapse: 'collapse', width: 'auto', minWidth: '100%' }}>
                        {/* Column Headers (A, B, C, ...) */}
                        <thead>
                            <tr>
                                <th style={{
                                    fontWeight: 'bold', backgroundColor: '#404040', color: '#fff',
                                    padding: '6px 8px', textAlign: 'center', fontSize: '0.7rem',
                                    border: '1px solid #333', minWidth: 36,
                                    position: 'sticky', left: 0, top: 0, zIndex: 3,
                                }}>#</th>
                                {Array.from({ length: cols }, (_, i) => (
                                    <th key={i} style={{
                                        fontWeight: 'bold',
                                        backgroundColor: assignment.hasGranularAssignment && assignment.assignedColumns.includes(String.fromCharCode(65 + i))
                                            ? '#1976d2' : '#404040',
                                        color: '#fff',
                                        padding: '6px 8px', textAlign: 'center', fontSize: '0.7rem',
                                        border: '1px solid #333',
                                        minWidth: columnWidths[i] || (i === 1 ? 180 : 100),
                                        width: columnWidths[i] || (i === 1 ? 180 : 100),
                                        position: 'sticky', top: 0, zIndex: 2,
                                    }}>
                                        {String.fromCharCode(65 + i)}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        {/* Data Rows */}
                        <tbody>
                            {Array.from({ length: rows }, (_, rowIndex) => {
                                // Check if this entire row has any assigned cells
                                const rowHasAssignment = !assignment.hasGranularAssignment ||
                                    assignment.assignedRows.includes(rowIndex + 1) ||
                                    assignment.assignedColumns.length > 0 ||
                                    assignment.assignedCells.some(c => {
                                        const match = c.match(/^[A-Z]+(\d+)$/);
                                        return match && parseInt(match[1]) === rowIndex + 1;
                                    });

                                return (
                                <tr key={rowIndex} style={{
                                    opacity: rowHasAssignment ? 1 : 0.3,
                                }}>
                                    {/* Row number */}
                                    <td style={{
                                        fontWeight: 'bold',
                                        backgroundColor: assignment.hasGranularAssignment && assignment.assignedRows.includes(rowIndex + 1)
                                            ? '#1976d2' : '#404040',
                                        color: '#fff',
                                        padding: '4px 6px', textAlign: 'center', fontSize: '0.7rem',
                                        border: '1px solid #333', position: 'sticky', left: 0, zIndex: 1,
                                        height: rowHeights[rowIndex] || 28,
                                    }}>
                                        {rowIndex + 1}
                                    </td>

                                    {/* Data cells */}
                                    {Array.from({ length: cols }, (_, colIndex) => {
                                        const cellId = getCellId(rowIndex, colIndex);
                                        const perm = permissions[cellId];
                                        const value = spreadsheetData[cellId] || '';
                                        const cellAssigned = isCellAssigned(rowIndex, colIndex);
                                        const editable = cellAssigned && isCellEditable(cellId);
                                        const style = getCellStyle(cellId);
                                        const mergeInfo = getMergeInfo(rowIndex, colIndex);
                                        const isAdminLocked = adminLockedCells[cellId];

                                        // Skip cells in merge that are not the origin
                                        if (mergeInfo.isMerged && !mergeInfo.isOrigin) return null;

                                        // Determine border style based on permissions and assignment
                                        let borderStyle = '1px solid #c0c0c0';
                                        if (!cellAssigned && assignment.hasGranularAssignment) {
                                            borderStyle = '1px solid #e0e0e0';
                                        } else if (editable) {
                                            borderStyle = '3px solid #4caf50';
                                        } else if (isAdminLocked || (perm && (perm.isLocked || !perm.canEdit))) {
                                            borderStyle = '2px solid #ff9800';
                                        }

                                        // If not assigned and granular mode, dim the cell
                                        const dimmed = assignment.hasGranularAssignment && !cellAssigned;

                                        return (
                                            <td
                                                key={cellId}
                                                rowSpan={mergeInfo.rowSpan}
                                                colSpan={mergeInfo.colSpan}
                                                onClick={() => {
                                                    if (dimmed) {
                                                        toast('This cell is not assigned to you', { icon: '🚫' });
                                                        return;
                                                    }
                                                    handleCellClick(cellId);
                                                }}
                                                style={{
                                                    ...style,
                                                    padding: '4px 8px',
                                                    border: borderStyle,
                                                    position: 'relative',
                                                    minWidth: columnWidths[colIndex] || (colIndex === 1 ? 180 : 100),
                                                    width: columnWidths[colIndex] || (colIndex === 1 ? 180 : 100),
                                                    maxWidth: columnWidths[colIndex] || 250,
                                                    minHeight: rowHeights[rowIndex] || 28,
                                                    height: rowHeights[rowIndex] || 28,
                                                    verticalAlign: 'middle',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    transition: 'all 0.15s',
                                                    // Dim non-assigned cells
                                                    opacity: dimmed ? 0.25 : 1,
                                                    backgroundColor: dimmed ? '#f0f0f0' : (style.backgroundColor || '#ffffff'),
                                                    cursor: dimmed ? 'not-allowed' : (editable ? 'pointer' : 'default'),
                                                    filter: dimmed ? 'grayscale(80%)' : 'none',
                                                }}
                                                title={
                                                    dimmed ? 'Not assigned to you'
                                                    : editable ? 'Click to edit'
                                                    : isAdminLocked ? 'Locked by admin'
                                                    : perm?.isLocked ? 'Locked by admin' : ''
                                                }
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <span style={{
                                                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                                        color: dimmed ? '#ccc' : (perm && !perm.canView ? '#ccc' : (style.color || 'inherit')),
                                                    }}>
                                                        {dimmed ? '' : (perm && !perm.canView ? '•••' : value)}
                                                    </span>
                                                    {!dimmed && (isAdminLocked || perm?.isLocked) && (
                                                        <LockIcon sx={{ fontSize: 12, color: '#ff9800', ml: 0.5 }} />
                                                    )}
                                                    {!dimmed && editable && !value && (
                                                        <EditIcon sx={{ fontSize: 12, color: '#4caf50', ml: 0.5, opacity: 0.5 }} />
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Box>

                {/* Footer */}
                <Box sx={{ p: 1, borderTop: '1px solid #e0e0e0', bgcolor: '#f9f9f9', display: 'flex', gap: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                        💡 Click green-bordered cells to edit • Press Enter to save
                    </Typography>
                    {mergedCells.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                            📐 {mergedCells.length} merged range(s)
                        </Typography>
                    )}
                </Box>
            </Paper>

            {/* ─── EDIT CELL DIALOG ─── */}
            <Dialog open={editingCell !== null} onClose={() => setEditingCell(null)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EditIcon color="primary" />
                    Edit Cell {editingCell}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        Current value: {spreadsheetData[editingCell || ''] || '(empty)'}
                    </Typography>
                    <TextField
                        autoFocus fullWidth multiline rows={3}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        placeholder="Enter cell value..."
                        variant="outlined" sx={{ mt: 1 }}
                        helperText="Press Enter to save, Shift+Enter for new line"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingCell(null)}>Cancel</Button>
                    <Button onClick={handleCellUpdate} variant="contained" startIcon={<SaveIcon />}>Save</Button>
                </DialogActions>
            </Dialog>

            {/* ─── SUBMIT DIALOG ─── */}
            <Dialog open={showSubmitDialog} onClose={() => setShowSubmitDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>📤 Submit Changes for Review</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        You've filled {filledEditableCells} of {editableCellCount} assigned cells ({progressPercent}%).
                        Once submitted, you won't be able to edit until the admin reviews your work.
                    </Alert>
                    <TextField fullWidth multiline rows={3} label="Notes (optional)"
                        value={submitNotes} onChange={(e) => setSubmitNotes(e.target.value)}
                        placeholder="Any comments about your changes..." />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowSubmitDialog(false)}>Cancel</Button>
                    <Button onClick={handleSubmitChanges} variant="contained" color="primary" startIcon={<SendIcon />}>Submit</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default SheetEditor;
