// ================================================================
// SHEET VIEW PAGE (pages/shared/SheetViewPage.tsx)
// ================================================================
// PURPOSE: The main page for viewing and editing a sheet.
//
// THIS IS THE CORE PAGE where users interact with spreadsheet data.
//
// FEATURES:
//   - Loads sheet by ID from URL params
//   - Renders the SheetEditor component
//   - Real-time sync via Socket.io
//   - Cell-level permissions (read-only vs editable)
//   - Privacy mode: users only see assigned rows/columns
//   - Formula evaluation in cells
//   - Version history sidebar
//
// ROUTE: /sheets/:sheetId
// DATA: Calls GET /api/data/sheet/:sheetId
// ROLE ACCESS: Any user assigned to this sheet
// ================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
  IconButton,
  Tooltip,
  Alert,
  Snackbar,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Badge,
  Divider,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
  CloudUpload as CloudUploadIcon,
  AddCircleOutline as AddRowIcon,
  ViewColumn as AddColIcon,
  RemoveCircleOutline as RemoveIcon,
  AssignmentInd as AssignIcon,
  History as HistoryIcon,
  Functions as FormulaIcon,
  CheckCircle as ApprovedIcon,
  Pending as PendingIcon,
  Send as SubmittedIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
} from '@mui/icons-material';

import { useSocket } from '../../contexts/SocketContext';              // Real-time WebSocket
import { useAuth } from '../../contexts/AuthContext';                   // Current user + role
import { sheetsAPI } from '../../services/sheetsAPI';                   // Sheet CRUD + cell ops
import { authService } from '../../services/authService';               // Role name helper
import { assignmentsAPI, Assignment } from '../../services/assignmentsAPI'; // Task management
import LoadingSpinner from '../../components/LoadingSpinner';           // Loading spinner
import api from '../../services/api';                                    // Axios instance

// ─── TYPE: Sheet metadata ───
interface SheetData {
  id: string;
  name: string;
  description?: string;
  status: string;          // active, draft, archived
  projectId?: string;
  structure?: {
    rows?: number;         // Number of rows in the sheet
    cols?: number;         // Number of columns
    columns?: any[];       // Column definitions
  };
  formulas?: Record<string, string>;  // cellId → formula (e.g. "=SUM(A1:A5)")
}

// ─── TYPE: One cell entry from the server ───
interface CellEntry {
  cellId: string;        // e.g. "A1", "B3"
  value: string;         // Display value
  formula?: string;      // Formula if any
  dataType?: string;
  numericValue?: number;
  rowIndex?: number;
  columnIndex?: number;
}

// ─── SHEET VIEW PAGE COMPONENT ───
// The main Excel-like spreadsheet page. Users can:
//   - View and edit cells
//   - Assign rows/columns to engineers
//   - Lock/unlock cells
//   - View formula bar
//   - Real-time sync via Socket.io
const SheetViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();       // Sheet ID from URL
  const navigate = useNavigate();
  // Destructure socket methods for real-time cell sync
  const { isConnected, joinSheet, leaveSheet, onCellUpdate, onBulkCellsUpdated } = useSocket();
  const { user } = useAuth();

  const isAdmin = user?.role === 'L1_ADMIN';         // Admin gets extra controls

  // --- Sheet data state ---
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [cellValues, setCellValues] = useState<Record<string, string>>({}); // cellId → value
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [rows, setRows] = useState(10);
  const [cols, setCols] = useState(8);
  const [formulaBarValue, setFormulaBarValue] = useState('');    // Formula bar input
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  // --- Assignment dialog state (assign rows/cols to engineers) ---
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignType, setAssignType] = useState<'ROW' | 'COLUMN' | 'CELL'>('ROW');
  const [assignTarget, setAssignTarget] = useState<number[]>([]);        // Row numbers to assign
  const [assignColTarget, setAssignColTarget] = useState<string[]>([]);  // Column letters to assign
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState('');
  const [assignQuestion, setAssignQuestion] = useState('');
  const [assignPriority, setAssignPriority] = useState('MEDIUM');
  const [users, setUsers] = useState<any[]>([]);                         // Available users
  const [assignments, setAssignments] = useState<Assignment[]>([]);      // Current assignments

  // --- History dialog ---
  const [historyDialog, setHistoryDialog] = useState(false);
  const [historyTab, setHistoryTab] = useState(0);

  // --- Cell locking (admin only) ---
  const [lockedCells, setLockedCells] = useState<Set<string>>(new Set());
  const [lockMode, setLockMode] = useState(false); // When true, clicking a cell toggles its lock

  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'info' });

  // Compute which rows/cols are assigned (for highlighting)
  const assignedRowSet = new Set<number>();
  const assignedColSet = new Set<string>();
  const assignedCellSet = new Set<string>();
  assignments.forEach(a => {
    (a.assignedRows || []).forEach((r: number) => assignedRowSet.add(r));
    (a.assignedColumns || []).forEach((c: string) => assignedColSet.add(c));
    (a.assignedCells || []).forEach((c: string) => assignedCellSet.add(c));
  });

  // Reusable sheet loader — called on mount and after structure changes
  const loadSheet = useCallback(async (showSpinner = true) => {
    if (!id) return;
    try {
      if (showSpinner) { setLoading(true); setError(null); }

      const sheetResponse = await sheetsAPI.getById(id);
      const sheetInfo = (sheetResponse as any).sheet || sheetResponse;
      setSheet(sheetInfo);

      if (sheetInfo.structure) {
        setRows(sheetInfo.structure.rows || 10);
        setCols(sheetInfo.structure.cols || 8);
      }

      // Build cell values map
      const values: Record<string, string> = {};
      const cellData = sheetInfo.cellData || [];
      let maxRow = 0;
      let maxCol = 0;

      cellData.forEach((cell: CellEntry) => {
        const cid = cell.cellId;
        if (cell.dataType === 'FORMULA' && cell.numericValue !== null && cell.numericValue !== undefined) {
          values[cid] = String(cell.numericValue);
        } else {
          values[cid] = cell.value || '';
        }
        const colIdx = cid.charCodeAt(0) - 65;
        const rowIdx = parseInt(cid.substring(1), 10);
        if (rowIdx > maxRow) maxRow = rowIdx;
        if (colIdx + 1 > maxCol) maxCol = colIdx + 1;
      });

      if (maxRow > rows) setRows(maxRow);
      if (maxCol > cols) setCols(maxCol);
      setCellValues(values);
      if (showSpinner) setLoading(false);

      // Load locked cells
      try {
        const lockedData = await sheetsAPI.getLockedCells(id);
        const lockedSet = new Set<string>();
        (lockedData.lockedCells || []).forEach((lc: any) => lockedSet.add(lc.cellId));
        setLockedCells(lockedSet);
      } catch { /* locked cells not critical */ }

      // Load assignments for this sheet
      if (isAdmin) {
        try {
          const histData = await assignmentsAPI.getSheetHistory(id);
          setAssignments(histData.history || []);
        } catch { /* ignore */ }

        try {
          const usersRes = await api.get('/users');
          setUsers(usersRes.data.users || usersRes.data || []);
        } catch { /* ignore */ }
      }

    } catch (err: any) {
      console.error('Failed to load sheet:', err);
      setError(err.response?.data?.message || 'Failed to load sheet data.');
      if (showSpinner) setLoading(false);
    }
  }, [id, isAdmin, rows, cols]);

  // Load initial data
  useEffect(() => {
    if (!id) return;
    loadSheet();
    joinSheet(id);
    return () => { if (id) leaveSheet(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Socket: cell updates
  useEffect(() => {
    const cleanup = onCellUpdate((update) => {
      if (update.sheetId !== id) return;
      setCellValues(prev => ({ ...prev, [update.cellId]: update.value }));
    });
    return cleanup;
  }, [id, onCellUpdate]);

  // Socket: bulk updates (from assignment responses)
  useEffect(() => {
    const cleanup = onBulkCellsUpdated((update) => {
      if (update.sheetId !== id) return;
      const newVals: Record<string, string> = {};
      (update.updatedCells || []).forEach((c: any) => { newVals[c.cellId] = c.value; });
      setCellValues(prev => ({ ...prev, ...newVals }));
      setNotification({ open: true, message: `Cells updated by ${update.userName || 'a user'}`, severity: 'info' });
    });
    return cleanup;
  }, [id, onBulkCellsUpdated]);

  const getCellId = (row: number, col: number): string => {
    return String.fromCharCode(65 + col) + (row + 1);
  };

  const handleCellClick = (row: number, col: number) => {
    const cellId = getCellId(row, col);
    setSelectedCell(cellId);
    if (sheet?.formulas && sheet.formulas[cellId]) {
      setFormulaBarValue(sheet.formulas[cellId]);
    } else {
      setFormulaBarValue(cellValues[cellId] || '');
    }
  };

  const handleCellChange = useCallback(async (row: number, col: number, value: string) => {
    if (!id) return;
    const cellId = getCellId(row, col);
    const previousValue = cellValues[cellId];
    setCellValues(prev => ({ ...prev, [cellId]: value }));

    try {
      setSaving(true);
      await sheetsAPI.updateCellData({ sheetId: id, cellId, value, dataType: 'TEXT' });
      setSaving(false);
      setLastSaved(new Date());
    } catch (err: any) {
      console.error('Failed to save cell:', err);
      setCellValues(prev => ({ ...prev, [cellId]: previousValue || '' }));
      setSaving(false);
      setNotification({ open: true, message: err.response?.data?.message || 'Failed to save changes', severity: 'error' });
    }
  }, [id, cellValues]);

  // Toggle lock on a cell (admin only, when lockMode is active)
  const handleToggleLock = useCallback(async (cellId: string) => {
    if (!id || !isAdmin) return;
    const isCurrentlyLocked = lockedCells.has(cellId);

    try {
      if (isCurrentlyLocked) {
        await sheetsAPI.unlockCells(id, [cellId]);
        setLockedCells(prev => {
          const next = new Set(prev);
          next.delete(cellId);
          return next;
        });
        setNotification({ open: true, message: `Cell ${cellId} unlocked`, severity: 'success' });
      } else {
        await sheetsAPI.lockCells(id, [cellId]);
        setLockedCells(prev => new Set(prev).add(cellId));
        setNotification({ open: true, message: `Cell ${cellId} locked`, severity: 'success' });
      }
    } catch (err: any) {
      setNotification({ open: true, message: err.response?.data?.message || 'Failed to toggle lock', severity: 'error' });
    }
  }, [id, isAdmin, lockedCells]);

  // Formula bar: enter formula
  const handleFormulaSubmit = async () => {
    if (!selectedCell || !id) return;
    const value = formulaBarValue;

    setCellValues(prev => ({ ...prev, [selectedCell]: value }));
    try {
      setSaving(true);
      await sheetsAPI.updateCellData({
        sheetId: id,
        cellId: selectedCell,
        value,
        dataType: value.startsWith('=') ? 'FORMULA' : 'TEXT',
      });

      // Refresh to get recalculated values
      const sheetResponse = await sheetsAPI.getById(id);
      const sheetInfo = (sheetResponse as any).sheet || sheetResponse;
      setSheet(sheetInfo);
      const vals: Record<string, string> = {};
      (sheetInfo.cellData || []).forEach((cell: CellEntry) => {
        if (cell.dataType === 'FORMULA' && cell.numericValue != null) {
          vals[cell.cellId] = String(cell.numericValue);
        } else {
          vals[cell.cellId] = cell.value || '';
        }
      });
      setCellValues(vals);
      setSaving(false);
      setLastSaved(new Date());
    } catch {
      setSaving(false);
      setNotification({ open: true, message: 'Failed to save formula', severity: 'error' });
    }
  };

  // Add/Remove rows and columns (using dedicated endpoints)
  const handleAddRow = async () => {
    setRows(prev => prev + 1);
    if (id) {
      try {
        await api.post(`/sheets/${id}/rows`, { count: 1 });
      } catch (err) {
        console.error('Add row failed:', err);
        setRows(prev => prev - 1);
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleInsertRow = async (position: number) => {
    setRows(prev => prev + 1);
    if (id) {
      try {
        await api.post(`/sheets/${id}/rows`, { count: 1, position });
        // Refresh to get updated cell positions
        await loadSheet();
      } catch (err) {
        console.error('Insert row failed:', err);
        setRows(prev => prev - 1);
      }
    }
  };

  const handleAddCol = async () => {
    setCols(prev => prev + 1);
    if (id) {
      try {
        await api.post(`/sheets/${id}/columns`, { count: 1 });
      } catch (err) {
        console.error('Add column failed:', err);
        setCols(prev => prev - 1);
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleInsertCol = async (position: number) => {
    setCols(prev => prev + 1);
    if (id) {
      try {
        await api.post(`/sheets/${id}/columns`, { count: 1, position });
        await loadSheet();
      } catch (err) {
        console.error('Insert column failed:', err);
        setCols(prev => prev - 1);
      }
    }
  };

  const handleRemoveRow = async () => {
    if (rows <= 1) return;
    setRows(prev => prev - 1);
    if (id) {
      try {
        await api.delete(`/sheets/${id}/rows?count=1`);
      } catch (err) {
        console.error('Remove row failed:', err);
        setRows(prev => prev + 1);
      }
    }
  };

  const handleRemoveCol = async () => {
    if (cols <= 1) return;
    setCols(prev => prev - 1);
    if (id) {
      try {
        await api.delete(`/sheets/${id}/columns?count=1`);
      } catch (err) {
        console.error('Remove column failed:', err);
        setCols(prev => prev + 1);
      }
    }
  };

  // Assignment
  const handleAssignRow = (rowNum: number) => {
    setAssignType('ROW');
    setAssignTarget([rowNum]);
    setAssignColTarget([]);
    setAssignQuestion('');
    setAssignUserId('');
    setAssignRole('');
    setAssignDialog(true);
  };

  const handleAssignColumn = (colLetter: string) => {
    setAssignType('COLUMN');
    setAssignTarget([]);
    setAssignColTarget([colLetter]);
    setAssignQuestion('');
    setAssignUserId('');
    setAssignRole('');
    setAssignDialog(true);
  };

  const handleAssignSubmit = async () => {
    if (!id) return;
    try {
      await assignmentsAPI.createAssignment({
        sheetId: id,
        userId: assignUserId || undefined,
        assignedRole: assignRole || undefined,
        assignmentType: assignType,
        assignedRows: assignType === 'ROW' ? assignTarget : [],
        assignedColumns: assignType === 'COLUMN' ? assignColTarget : [],
        assignedCells: [],
        question: assignQuestion || undefined,
        priority: assignPriority,
      });
      setAssignDialog(false);
      setNotification({ open: true, message: 'Assignment created! User has been notified.', severity: 'success' });

      const histData = await assignmentsAPI.getSheetHistory(id);
      setAssignments(histData.history || []);
    } catch (err: any) {
      setNotification({ open: true, message: err.response?.data?.message || 'Failed to create assignment', severity: 'error' });
    }
  };

  const handleRefresh = async () => {
    if (!id) return;
    try {
      const sheetResponse = await sheetsAPI.getById(id);
      const sheetInfo = (sheetResponse as any).sheet || sheetResponse;
      setSheet(sheetInfo);
      const values: Record<string, string> = {};
      (sheetInfo.cellData || []).forEach((cell: CellEntry) => {
        if (cell.dataType === 'FORMULA' && cell.numericValue != null) {
          values[cell.cellId] = String(cell.numericValue);
        } else {
          values[cell.cellId] = cell.value || '';
        }
      });
      setCellValues(values);
      setNotification({ open: true, message: 'Sheet refreshed', severity: 'success' });

      // Reload locked cells
      try {
        const lockedData = await sheetsAPI.getLockedCells(id);
        const lockedSet = new Set<string>();
        (lockedData.lockedCells || []).forEach((lc: any) => lockedSet.add(lc.cellId));
        setLockedCells(lockedSet);
      } catch { /* ignore */ }

      if (isAdmin) {
        const histData = await assignmentsAPI.getSheetHistory(id);
        setAssignments(histData.history || []);
      }
    } catch {
      setNotification({ open: true, message: 'Failed to refresh', severity: 'error' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUBMITTED': return <SubmittedIcon color="info" fontSize="small" />;
      case 'APPROVED': return <ApprovedIcon color="success" fontSize="small" />;
      case 'PENDING': return <PendingIcon color="warning" fontSize="small" />;
      default: return <PendingIcon fontSize="small" />;
    }
  };

  const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (status) {
      case 'PENDING': return 'warning';
      case 'IN_PROGRESS': return 'info';
      case 'SUBMITTED': return 'primary';
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <LoadingSpinner />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
        <Button startIcon={<RefreshIcon />} onClick={() => window.location.reload()} sx={{ mt: 2 }}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Paper sx={{ p: 1.5, mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate(-1)} size="small">
            <BackIcon />
          </IconButton>
          <Typography variant="h6" noWrap>{sheet?.name || 'Untitled Sheet'}</Typography>
          {saving ? (
            <Box display="flex" alignItems="center" color="text.secondary">
              <CircularProgress size={16} sx={{ mr: 0.5 }} />
              <Typography variant="caption">Saving...</Typography>
            </Box>
          ) : lastSaved ? (
            <Tooltip title={`Saved at ${lastSaved.toLocaleTimeString()}`}>
              <Box display="flex" alignItems="center" color="success.main">
                <CloudDoneIcon fontSize="small" sx={{ mr: 0.5 }} />
                <Typography variant="caption">Saved</Typography>
              </Box>
            </Tooltip>
          ) : null}
        </Box>

        <Box display="flex" alignItems="center" gap={1}>
          {isAdmin && (
            <>
              <Tooltip title="Add Row">
                <IconButton onClick={handleAddRow} size="small" color="primary">
                  <AddRowIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove Last Row">
                <IconButton onClick={handleRemoveRow} size="small" color="error">
                  <RemoveIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Add Column">
                <IconButton onClick={handleAddCol} size="small" color="primary">
                  <AddColIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove Last Column">
                <IconButton onClick={handleRemoveCol} size="small" color="error">
                  <RemoveIcon />
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title="Assignment History">
                <IconButton onClick={() => setHistoryDialog(true)} size="small" color="info">
                  <Badge badgeContent={assignments.length} color="info" max={99}>
                    <HistoryIcon />
                  </Badge>
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title={lockMode ? 'Exit Lock Mode (click cells to lock/unlock)' : 'Enter Lock Mode'}>
                <IconButton
                  onClick={() => setLockMode(prev => !prev)}
                  size="small"
                  color={lockMode ? 'error' : 'default'}
                  sx={lockMode ? { bgcolor: 'error.light', color: 'white', '&:hover': { bgcolor: 'error.main' } } : {}}
                >
                  {lockMode ? <LockIcon /> : <LockOpenIcon />}
                </IconButton>
              </Tooltip>
              {lockMode && (
                <Chip label="LOCK MODE — Click cells to toggle lock" color="error" size="small" />
              )}
            </>
          )}
          <Tooltip title={isConnected ? 'Connected' : 'Disconnected'}>
            <IconButton color={isConnected ? 'success' : 'error'} size="small">
              {isConnected ? <CloudUploadIcon /> : <CloudOffIcon />}
            </IconButton>
          </Tooltip>
          <IconButton onClick={handleRefresh} title="Refresh" size="small">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Paper>

      {/* Formula Bar */}
      <Paper sx={{ p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FormulaIcon color="action" fontSize="small" />
        <Chip
          label={selectedCell || '\u2014'}
          size="small"
          variant="outlined"
          sx={{ minWidth: 50 }}
        />
        <TextField
          fullWidth
          size="small"
          placeholder={selectedCell ? 'Enter value or formula (e.g. =SUM(A1:A5))' : 'Select a cell'}
          value={formulaBarValue}
          onChange={(e) => setFormulaBarValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleFormulaSubmit();
            }
          }}
          disabled={!selectedCell}
          sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.875rem' } }}
        />
        <Button
          size="small"
          variant="contained"
          onClick={handleFormulaSubmit}
          disabled={!selectedCell || saving}
        >
          Apply
        </Button>
      </Paper>

      {/* Spreadsheet Grid */}
      <TableContainer component={Paper} sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 60, bgcolor: 'grey.100', fontWeight: 'bold', borderRight: '2px solid #ccc' }}>#</TableCell>
              {Array.from({ length: cols }).map((_, colIndex) => {
                const colLetter = String.fromCharCode(65 + colIndex);
                const isAssigned = assignedColSet.has(colLetter);
                return (
                  <TableCell
                    key={colIndex}
                    align="center"
                    sx={{
                      minWidth: 110,
                      fontWeight: 'bold',
                      bgcolor: isAssigned ? 'info.light' : 'grey.100',
                      color: isAssigned ? 'info.contrastText' : 'inherit',
                      cursor: isAdmin ? 'pointer' : 'default',
                      '&:hover': isAdmin ? { bgcolor: 'primary.light', color: 'white' } : {},
                    }}
                    onClick={() => isAdmin && handleAssignColumn(colLetter)}
                  >
                    <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                      {colLetter}
                      {isAdmin && (
                        <Tooltip title={`Assign column ${colLetter}`}>
                          <AssignIcon sx={{ fontSize: 14, opacity: 0.6 }} />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: rows }).map((_, rowIndex) => {
              const rowNum = rowIndex + 1;
              const isRowAssigned = assignedRowSet.has(rowNum);
              return (
                <TableRow key={rowIndex}>
                  <TableCell
                    component="th"
                    scope="row"
                    sx={{
                      bgcolor: isRowAssigned ? 'warning.light' : 'grey.50',
                      color: isRowAssigned ? 'warning.contrastText' : 'inherit',
                      fontWeight: 'bold',
                      borderRight: '2px solid #ccc',
                      cursor: isAdmin ? 'pointer' : 'default',
                      '&:hover': isAdmin ? { bgcolor: 'primary.light', color: 'white' } : {},
                    }}
                    onClick={() => isAdmin && handleAssignRow(rowNum)}
                  >
                    <Box display="flex" alignItems="center" gap={0.5}>
                      {rowNum}
                      {isAdmin && (
                        <Tooltip title={`Assign row ${rowNum}`}>
                          <AssignIcon sx={{ fontSize: 14, opacity: 0.6 }} />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  {Array.from({ length: cols }).map((_, colIndex) => {
                    const cellId = getCellId(rowIndex, colIndex);
                    const colLetter = String.fromCharCode(65 + colIndex);
                    const isCellAssigned = assignedCellSet.has(cellId) || assignedRowSet.has(rowNum) || assignedColSet.has(colLetter);
                    const isSelected = selectedCell === cellId;
                    const isCellLocked = lockedCells.has(cellId);

                    return (
                      <TableCell
                        key={colIndex}
                        sx={{
                          p: 0,
                          border: isSelected ? '2px solid #1976d2' : '1px solid rgba(224, 224, 224, 1)',
                          bgcolor: isCellLocked
                            ? 'rgba(244, 67, 54, 0.08)'
                            : isCellAssigned
                              ? 'rgba(255, 243, 224, 0.4)'
                              : 'inherit',
                          minWidth: 110,
                          position: 'relative',
                          cursor: lockMode ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (lockMode && isAdmin) {
                            handleToggleLock(cellId);
                          } else {
                            handleCellClick(rowIndex, colIndex);
                          }
                        }}
                      >
                        {isCellLocked && (
                          <LockIcon
                            sx={{
                              position: 'absolute',
                              top: 2,
                              right: 2,
                              fontSize: 14,
                              color: 'error.main',
                              opacity: 0.7,
                              zIndex: 1,
                            }}
                          />
                        )}
                        <TextField
                          fullWidth
                          variant="standard"
                          InputProps={{
                            disableUnderline: true,
                            sx: {
                              px: 1,
                              py: 0.5,
                              fontSize: '0.875rem',
                              color: isCellLocked ? 'text.secondary' : 'inherit',
                            },
                            readOnly: isCellLocked || lockMode,
                          }}
                          value={cellValues[cellId] || ''}
                          onChange={(e) => {
                            if (isCellLocked || lockMode) return;
                            setCellValues(prev => ({ ...prev, [cellId]: e.target.value }));
                            setFormulaBarValue(e.target.value);
                          }}
                          onBlur={(e) => {
                            if (isCellLocked || lockMode) return;
                            const val = e.target.value;
                            handleCellChange(rowIndex, colIndex, val);
                          }}
                          onFocus={() => {
                            if (!lockMode) handleCellClick(rowIndex, colIndex);
                          }}
                          placeholder=""
                          disabled={lockMode}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Assign Dialog */}
      <Dialog open={assignDialog} onClose={() => setAssignDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Assign {assignType === 'ROW' ? `Row ${assignTarget.join(', ')}` : `Column ${assignColTarget.join(', ')}`}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info" sx={{ mb: 1 }}>
              Assign this {assignType.toLowerCase()} to a user or role. They will receive a notification and can fill in values that auto-populate this sheet.
            </Alert>

            <FormControl fullWidth size="small">
              <InputLabel>Assign To User (optional)</InputLabel>
              <Select
                value={assignUserId}
                onChange={(e) => { setAssignUserId(e.target.value); if (e.target.value) setAssignRole(''); }}
                label="Assign To User (optional)"
              >
                <MenuItem value="">— None —</MenuItem>
                {users.filter((u: any) => u.role !== 'L1_ADMIN').map((u: any) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({authService.getRoleName(u.role)})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Or Assign To Role</InputLabel>
              <Select
                value={assignRole}
                onChange={(e) => { setAssignRole(e.target.value); if (e.target.value) setAssignUserId(''); }}
                label="Or Assign To Role"
                disabled={!!assignUserId}
              >
                <MenuItem value="">— None —</MenuItem>
                <MenuItem value="L2_SENIOR_ENGINEER">Planning Manager</MenuItem>
                <MenuItem value="L3_JUNIOR_ENGINEER">Site Engineer</MenuItem>
                <MenuItem value="GROUND_MANAGER">Ground Manager</MenuItem>
                <MenuItem value="PROJECT_MANAGER">Project Manager</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Question / Instructions"
              placeholder="What should the assigned user fill in?"
              value={assignQuestion}
              onChange={(e) => setAssignQuestion(e.target.value)}
            />

            <FormControl fullWidth size="small">
              <InputLabel>Priority</InputLabel>
              <Select
                value={assignPriority}
                onChange={(e) => setAssignPriority(e.target.value)}
                label="Priority"
              >
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
                <MenuItem value="URGENT">Urgent</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<AssignIcon />}
            onClick={handleAssignSubmit}
            disabled={!assignUserId && !assignRole}
          >
            Assign & Notify
          </Button>
        </DialogActions>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialog} onClose={() => setHistoryDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Sheet Assignment History</DialogTitle>
        <DialogContent>
          <Tabs value={historyTab} onChange={(_, v) => setHistoryTab(v)} sx={{ mb: 2 }}>
            <Tab label={`All (${assignments.length})`} />
            <Tab label={`Pending (${assignments.filter(a => a.status === 'PENDING').length})`} />
            <Tab label={`Submitted (${assignments.filter(a => a.status === 'SUBMITTED').length})`} />
          </Tabs>

          {assignments.length === 0 ? (
            <Alert severity="info">No assignments yet. Click on a row number or column header to assign.</Alert>
          ) : (
            <List dense>
              {assignments
                .filter(a => {
                  if (historyTab === 1) return a.status === 'PENDING';
                  if (historyTab === 2) return a.status === 'SUBMITTED';
                  return true;
                })
                .map(a => (
                  <ListItem key={a.id} divider secondaryAction={
                    a.status === 'SUBMITTED' && isAdmin ? (
                      <Box display="flex" gap={1}>
                        <Button
                          size="small"
                          color="success"
                          variant="outlined"
                          onClick={async () => {
                            await assignmentsAPI.updateAssignmentStatus(a.id, 'APPROVED');
                            handleRefresh();
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={async () => {
                            await assignmentsAPI.updateAssignmentStatus(a.id, 'REJECTED');
                            handleRefresh();
                          }}
                        >
                          Reject
                        </Button>
                      </Box>
                    ) : null
                  }>
                    <ListItemIcon>{getStatusIcon(a.status)}</ListItemIcon>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2" fontWeight="bold">
                            {a.assignmentType} {a.assignmentType === 'ROW' ? a.assignedRows?.join(', ') : a.assignedColumns?.join(', ')}
                          </Typography>
                          <Chip label={a.status} size="small" color={getStatusColor(a.status)} />
                          <Chip label={a.priority} size="small" variant="outlined" />
                        </Box>
                      }
                      secondary={
                        <Box component="span">
                          <Typography variant="caption" color="text.secondary" component="span">
                            Assigned to: {a.user ? `${a.user.firstName} ${a.user.lastName}` : authService.getRoleName(a.assignedRole || '')}
                            {' \u2022 '}By: {a.assignedBy?.firstName} {a.assignedBy?.lastName}
                            {' \u2022 '}{new Date(a.assignedAt).toLocaleString()}
                          </Typography>
                          {a.question && (
                            <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }} component="span" display="block">
                              Q: {a.question}
                            </Typography>
                          )}
                          {a.response && (
                            <Typography variant="body2" color="success.main" sx={{ mt: 0.5 }} component="span" display="block">
                              Response received ({Object.keys(a.response.values || {}).length} cells) at {new Date(a.respondedAt || '').toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notification.open}
        autoHideDuration={5000}
        onClose={() => setNotification(prev => ({ ...prev, open: false }))}
      >
        <Alert severity={notification.severity} onClose={() => setNotification(prev => ({ ...prev, open: false }))}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SheetViewPage;
