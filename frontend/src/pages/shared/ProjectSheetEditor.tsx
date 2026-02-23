// ================================================================
// PROJECT SHEET EDITOR (pages/shared/ProjectSheetEditor.tsx)
// ================================================================
// PURPOSE: Full DPR-style spreadsheet editor for sheets within a project.
//   Mirrors the admin SheetsManagement editor with all features:
//   - Cell styling (background, text color, font weight, alignment)
//   - Drag-select + right-click context menu (merge/unmerge/lock/color)
//   - Resizable columns and rows
//   - Push to users/roles with ROW/COLUMN/CELL granularity
//   - Template save/load/apply
//   - CEO report generation
//   - Role-based permissions dialog
//   - Finance panel per sheet
//
// ROUTE: /project/:projectId/sheet/:sheetId
// ACCESS: Admin/PM get full edit, others get view-only
// ================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Grid, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, Chip, FormControl, InputLabel, Select,
  MenuItem, Checkbox, ListItemText, IconButton, CircularProgress, TextField,
  Tooltip, Popover, Divider, Tabs, Tab, Accordion, AccordionSummary,
  AccordionDetails, Switch, FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon, Remove as RemoveIcon, Lock as LockIcon,
  LockOpen as LockOpenIcon, Send as SendIcon, Assessment as AssessmentIcon,
  ArrowBack as BackIcon, Refresh as RefreshIcon, MergeType as MergeIcon,
  CallSplit as UnmergeIcon, FormatBold as BoldIcon,
  FormatAlignLeft as AlignLeftIcon, FormatAlignCenter as AlignCenterIcon,
  FormatAlignRight as AlignRightIcon, FormatColorFill as FillColorIcon,
  FormatColorText as TextColorIcon, TableChart as TemplateIcon,
  Save as SaveIcon, PersonRemove as UnassignIcon, Delete as DeleteIcon,
  Security as PermissionsIcon, Close as CloseIcon,
  ExpandMore as ExpandMoreIcon, People as PeopleIcon,
  ViewColumn as ColumnIcon, TableRows as RowIcon, GridOn as CellIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { authService } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import socketService from '../../services/socketService';
import CellEditorModal from '../dashboards/components/CellEditorModal';

// ─── INTERFACES ───
interface CellStyle {
  backgroundColor?: string;
  color?: string;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: string;
}

interface ContextMenu {
  open: boolean; x: number; y: number; row: number; col: number;
}

interface UserData {
  id: string; firstName: string; lastName: string; email: string; role: string;
}

interface SheetAssignment {
  id: string; sheetId: string; userId?: string; assignedRole?: string;
  type?: string; status?: string; rows?: number[]; columns?: string[];
  cells?: string[]; question?: string; dueDate?: string;
  user?: { id: string; firstName: string; lastName: string; email: string; role: string };
  assignedBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
}

// ─── DPR COLORS ───
const DPR_COLORS = {
  headerYellow: '#FFD966', sectionSalmon: '#F4B084', totalGreen: '#A9D08E',
  dataBrown: '#C6975C', subHeaderBlue: '#BDD7EE', lightGray: '#F2F2F2',
  white: '#FFFFFF', lightYellow: '#FFF2CC', lightGreen: '#E2EFDA', lightOrange: '#FCE4D6',
};

const COLOR_PALETTE = [
  '#FFFFFF', '#F2F2F2', '#D9D9D9', '#BFBFBF', '#808080', '#404040',
  '#FFD966', '#FFF2CC', '#F4B084', '#FCE4D6', '#C6975C', '#BF8F00',
  '#A9D08E', '#E2EFDA', '#70AD47', '#548235', '#375623', '#203413',
  '#BDD7EE', '#DEEBF7', '#5B9BD5', '#2F75B5', '#1F4E79', '#102542',
  '#D9B3FF', '#F2E6FF', '#B280D9', '#8040BF', '#602080', '#401060',
  '#FF9999', '#FFE6E6', '#FF4D4D', '#CC0000', '#800000', '#400000',
];

const ALL_ROLES = [
  'L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER',
  'PROJECT_MANAGER', 'GROUND_MANAGER', 'CEO',
];

// ─── COMPONENT ───
const ProjectSheetEditor: React.FC = () => {
  const { projectId, sheetId } = useParams<{ projectId: string; sheetId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'L1_ADMIN';
  const isPM = user?.role === 'PROJECT_MANAGER';
  const canEdit = isAdmin || isPM;

  // Sheet data
  const [sheetInfo, setSheetInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [spreadsheetData, setSpreadsheetData] = useState<Record<string, string>>({});
  const [spreadsheetRows, setSpreadsheetRows] = useState(20);
  const [spreadsheetCols, setSpreadsheetCols] = useState(14);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [showCellEditor, setShowCellEditor] = useState(false);
  const [lockedCells, setLockedCells] = useState<Record<string, boolean>>({});
  const [cellStyles, setCellStyles] = useState<Record<string, CellStyle>>({});
  const [mergedCells, setMergedCells] = useState<Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>>([]);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});

  // Drag selection
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu>({ open: false, x: 0, y: 0, row: 0, col: 0 });

  // Resize
  const [resizing, setResizing] = useState<{ type: 'col' | 'row'; index: number; startPos: number; startSize: number } | null>(null);

  // Style toolbar
  const [colorPickerAnchor, setColorPickerAnchor] = useState<HTMLElement | null>(null);
  const [colorPickerType, setColorPickerType] = useState<'bg' | 'text'>('bg');
  const [showRowColControls, setShowRowColControls] = useState(false);

  // Push dialog
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pushMode, setPushMode] = useState<'users' | 'roles'>('roles');
  const [pushGranularity, setPushGranularity] = useState<'ROW' | 'COLUMN' | 'CELL'>('ROW');
  const [pushRows, setPushRows] = useState('');
  const [pushColumns, setPushColumns] = useState('');
  const [pushCells, setPushCells] = useState('');
  const [pushQuestion, setPushQuestion] = useState('');
  const [pushDueDate, setPushDueDate] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserData[]>([]);

  // Assignments dialog
  const [showAssignmentsDialog, setShowAssignmentsDialog] = useState(false);
  const [sheetAssignments, setSheetAssignments] = useState<SheetAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Permissions dialog
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [sheetPermissions, setSheetPermissions] = useState<Record<string, { canView: boolean; canEdit: boolean }>>({});

  // Templates
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showLoadTemplateDialog, setShowLoadTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('custom');
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // CEO Report
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);

  const tableRef = useRef<HTMLTableElement>(null);
  const initialLoadDone = useRef(false);

  // ─── HELPERS ───
  const getCellId = (row: number, col: number): string => String.fromCharCode(65 + col) + (row + 1);
  const getColWidth = (col: number) => columnWidths[col] || (col === 1 ? 180 : 100);
  const getRowHeight = (row: number) => rowHeights[row] || 28;

  const safeArr = (val: any): any[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') { try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {} }
    return [];
  };

  // ─── LOAD SHEET DATA ───
  const loadSheetData = useCallback(async () => {
    if (!sheetId) return;
    try {
      setLoading(true);
      const response = await api.get(`/sheets/${sheetId}`);
      if (response.data?.sheet) {
        const sheet = response.data.sheet;
        setSheetInfo(sheet);

        // Load structure
        if (sheet.structure) {
          setSpreadsheetRows(sheet.structure.rows || 20);
          setSpreadsheetCols(sheet.structure.cols || 14);
          setMergedCells(sheet.structure.mergedCells || []);
          setCellStyles(sheet.structure.cellStyles || {});
          setLockedCells(sheet.structure.lockedCells || {});
          setColumnWidths(sheet.structure.columnWidths || {});
          setRowHeights(sheet.structure.rowHeights || {});
        }

        // Load permissions from sheet
        if (sheet.permissions) {
          setSheetPermissions(sheet.permissions);
        }

        // Load cell data
        const data: Record<string, string> = {};
        if (sheet.cellData && Array.isArray(sheet.cellData)) {
          let maxRow = 0, maxCol = 0;
          sheet.cellData.forEach((cell: any) => {
            data[cell.cellId] = (cell.dataType === 'FORMULA' && cell.numericValue !== null)
              ? String(cell.numericValue) : (cell.value || '');
            const colIndex = cell.cellId.charCodeAt(0) - 65;
            const rowIndex = parseInt(cell.cellId.substring(1), 10) - 1;
            if (rowIndex >= maxRow) maxRow = rowIndex + 1;
            if (colIndex >= maxCol) maxCol = colIndex + 1;
          });
          if (maxRow > spreadsheetRows) setSpreadsheetRows(maxRow);
          if (maxCol > spreadsheetCols) setSpreadsheetCols(maxCol);
        }
        setSpreadsheetData(data);
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        toast.error('Sheet not found');
      } else {
        toast.error('Failed to load sheet data');
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  const loadUsers = useCallback(async () => {
    try {
      const response = await api.get('/auth/users');
      if (response.data?.users) setAvailableUsers(response.data.users.filter((u: UserData) => u.role !== 'L1_ADMIN'));
    } catch (err) { console.error('Failed to load users:', err); }
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!sheetId) return;
    try {
      setLoadingAssignments(true);
      const response = await api.get(`/sheets/${sheetId}/assignments`);
      const data = response.data;
      setSheetAssignments(Array.isArray(data) ? data : (data.assignments || []));
    } catch (err) { setSheetAssignments([]); } finally { setLoadingAssignments(false); }
  }, [sheetId]);

  useEffect(() => {
    if (initialLoadDone.current) return; // Prevent StrictMode double-fire
    initialLoadDone.current = true;
    loadSheetData();
    if (canEdit) loadUsers();
  }, [loadSheetData, loadUsers, canEdit]);

  // Socket connection
  useEffect(() => {
    if (!sheetId) return;
    const token = localStorage.getItem('token');
    if (token) {
      socketService.connect(token);
      socketService.joinSheet(sheetId);
      socketService.onCellUpdate((data) => {
        if (data.sheetId !== sheetId) return;
        setSpreadsheetData(prev => ({ ...prev, [data.cellId]: data.value }));
      });
      socketService.on('cell_updated', (data: any) => {
        if (data.sheetId !== sheetId) return;
        setSpreadsheetData(prev => ({ ...prev, [data.cellId]: data.value }));
      });
      socketService.on('assignment-updated', (data: any) => {
        if (data.sheetId === sheetId) { loadAssignments(); toast.success('Assignments updated'); }
      });
    }
    return () => {
      socketService.offCellUpdate();
      socketService.off('cell_updated');
      socketService.off('assignment-updated');
      if (sheetId) socketService.leaveSheet(sheetId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  // Global mouse up
  useEffect(() => {
    const handleGlobalMouseUp = () => { if (isDragging) setIsDragging(false); };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  // ─── SAVE STRUCTURE ───
  const saveStructure = async (
    updatedMerges?: typeof mergedCells, updatedStyles?: typeof cellStyles,
    updatedRows?: number, updatedCols?: number,
    updatedColWidths?: typeof columnWidths, updatedRowHeights?: typeof rowHeights,
    updatedLockedCells?: typeof lockedCells,
  ) => {
    if (!sheetId) return;
    try {
      await api.put(`/sheets/${sheetId}/structure`, {
        structure: {
          ...(sheetInfo?.structure || {}),
          rows: updatedRows ?? spreadsheetRows,
          cols: updatedCols ?? spreadsheetCols,
          mergedCells: updatedMerges ?? mergedCells,
          cellStyles: updatedStyles ?? cellStyles,
          columnWidths: updatedColWidths ?? columnWidths,
          rowHeights: updatedRowHeights ?? rowHeights,
          lockedCells: updatedLockedCells ?? lockedCells,
        },
      });
    } catch (err) { toast.error('Failed to save structure'); }
  };

  // ─── MERGE HELPERS ───
  const getMergeInfo = (row: number, col: number) => {
    for (const merge of mergedCells) {
      if (row >= merge.startRow && row <= merge.endRow && col >= merge.startCol && col <= merge.endCol) {
        return { isMerged: true, isOrigin: row === merge.startRow && col === merge.startCol,
          rowSpan: merge.endRow - merge.startRow + 1, colSpan: merge.endCol - merge.startCol + 1, merge };
      }
    }
    return { isMerged: false, isOrigin: false, rowSpan: 1, colSpan: 1, merge: null };
  };

  const getDragSelection = () => {
    if (!dragStart || !dragEnd) return null;
    return {
      startRow: Math.min(dragStart.row, dragEnd.row), endRow: Math.max(dragStart.row, dragEnd.row),
      startCol: Math.min(dragStart.col, dragEnd.col), endCol: Math.max(dragStart.col, dragEnd.col),
    };
  };

  const isInDragSelection = (row: number, col: number): boolean => {
    const sel = getDragSelection();
    if (!sel) return false;
    return row >= sel.startRow && row <= sel.endRow && col >= sel.startCol && col <= sel.endCol;
  };

  const getSelectedCellIds = (): string[] => {
    const sel = getDragSelection();
    if (!sel) return selectedCell ? [selectedCell] : [];
    const cells: string[] = [];
    for (let r = sel.startRow; r <= sel.endRow; r++) {
      for (let c = sel.startCol; c <= sel.endCol; c++) cells.push(getCellId(r, c));
    }
    return cells;
  };

  // ─── MOUSE HANDLERS ───
  const handleMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    if (e.button === 2 || !canEdit) return;
    e.preventDefault();
    setIsDragging(true); setDragStart({ row, col }); setDragEnd({ row, col });
    const cellId = getCellId(row, col);
    setSelectedCell(cellId); setSelectedCells(new Set([cellId]));
  };

  const handleMouseMove = (row: number, col: number) => {
    if (!isDragging || !dragStart) return;
    setDragEnd({ row, col });
    const sel = {
      startRow: Math.min(dragStart.row, row), endRow: Math.max(dragStart.row, row),
      startCol: Math.min(dragStart.col, col), endCol: Math.max(dragStart.col, col),
    };
    const newSelected = new Set<string>();
    for (let r = sel.startRow; r <= sel.endRow; r++) {
      for (let c = sel.startCol; c <= sel.endCol; c++) newSelected.add(getCellId(r, c));
    }
    setSelectedCells(newSelected);
  };

  const handleMouseUp = () => { setIsDragging(false); };

  // ─── CONTEXT MENU ───
  const handleContextMenu = (row: number, col: number, e: React.MouseEvent) => {
    if (!canEdit) return;
    e.preventDefault(); e.stopPropagation();
    if (!isInDragSelection(row, col)) {
      setDragStart({ row, col }); setDragEnd({ row, col });
      setSelectedCell(getCellId(row, col)); setSelectedCells(new Set([getCellId(row, col)]));
    }
    setContextMenu({ open: true, x: e.clientX, y: e.clientY, row, col });
  };

  const closeContextMenu = () => setContextMenu({ ...contextMenu, open: false });

  const handleMergeFromContext = async () => {
    const sel = getDragSelection();
    if (!sel || (sel.startRow === sel.endRow && sel.startCol === sel.endCol)) {
      toast.error('Select at least 2 cells to merge'); closeContextMenu(); return;
    }
    for (const existing of mergedCells) {
      const overlaps = !(sel.endRow < existing.startRow || sel.startRow > existing.endRow ||
                         sel.endCol < existing.startCol || sel.startCol > existing.endCol);
      if (overlaps) { toast.error('Cannot merge: overlaps existing range'); closeContextMenu(); return; }
    }
    const newMerge = { startRow: sel.startRow, startCol: sel.startCol, endRow: sel.endRow, endCol: sel.endCol };
    const updatedMerges = [...mergedCells, newMerge];
    setMergedCells(updatedMerges);
    await saveStructure(updatedMerges);
    toast.success(`Merged ${getCellId(sel.startRow, sel.startCol)}:${getCellId(sel.endRow, sel.endCol)}`);
    closeContextMenu();
  };

  const handleUnmergeFromContext = async () => {
    const { row, col } = contextMenu;
    const updated = mergedCells.filter(m => !(row >= m.startRow && row <= m.endRow && col >= m.startCol && col <= m.endCol));
    if (updated.length === mergedCells.length) { toast.error('No merge found at this cell'); }
    else { setMergedCells(updated); await saveStructure(updated); toast.success('Cells unmerged'); }
    closeContextMenu();
  };

  const handleLockFromContext = async (lock: boolean) => {
    if (!sheetId) return;
    const cellIds = getSelectedCellIds();
    if (cellIds.length === 0) { toast.error('No cells selected'); closeContextMenu(); return; }
    try {
      await api.post(`/sheets/${sheetId}/lock-cells`, { cellIds, locked: lock });
      const updatedLocked = { ...lockedCells };
      cellIds.forEach(id => { if (lock) updatedLocked[id] = true; else delete updatedLocked[id]; });
      setLockedCells(updatedLocked);
      toast.success(`${cellIds.length} cell(s) ${lock ? 'locked' : 'unlocked'}`);
    } catch { toast.error(`Failed to ${lock ? 'lock' : 'unlock'} cells`); }
    closeContextMenu();
  };

  const handleColorRow = async (color: string) => {
    const row = contextMenu.row;
    const updated = { ...cellStyles };
    for (let c = 0; c < spreadsheetCols; c++) updated[getCellId(row, c)] = { ...(updated[getCellId(row, c)] || {}), backgroundColor: color };
    setCellStyles(updated); await saveStructure(undefined, updated);
    toast.success(`Row ${row + 1} colored`); closeContextMenu();
  };

  const handleColorColumn = async (color: string) => {
    const col = contextMenu.col;
    const updated = { ...cellStyles };
    for (let r = 0; r < spreadsheetRows; r++) updated[getCellId(r, col)] = { ...(updated[getCellId(r, col)] || {}), backgroundColor: color };
    setCellStyles(updated); await saveStructure(undefined, updated);
    toast.success(`Column ${String.fromCharCode(65 + col)} colored`); closeContextMenu();
  };

  // ─── RESIZE ───
  const handleResizeStart = (type: 'col' | 'row', index: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startPos = type === 'col' ? e.clientX : e.clientY;
    const startSize = type === 'col' ? (columnWidths[index] || (index === 1 ? 180 : 100)) : (rowHeights[index] || 28);
    setResizing({ type, index, startPos, startSize });
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: MouseEvent) => {
      const diff = resizing.type === 'col' ? e.clientX - resizing.startPos : e.clientY - resizing.startPos;
      const newSize = Math.max(resizing.type === 'col' ? 40 : 20, resizing.startSize + diff);
      if (resizing.type === 'col') setColumnWidths(prev => ({ ...prev, [resizing.index]: newSize }));
      else setRowHeights(prev => ({ ...prev, [resizing.index]: newSize }));
    };
    const handleUp = () => {
      saveStructure(undefined, undefined, undefined, undefined,
        resizing.type === 'col' ? columnWidths : undefined,
        resizing.type === 'row' ? rowHeights : undefined);
      setResizing(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing, columnWidths, rowHeights]);

  // ─── CELL STYLING ───
  const applyStyleToSelection = async (style: Partial<CellStyle>) => {
    const cellsToStyle = selectedCells.size > 0 ? Array.from(selectedCells) : (selectedCell ? [selectedCell] : []);
    if (cellsToStyle.length === 0) { toast.error('Select cells first'); return; }
    const updated = { ...cellStyles };
    cellsToStyle.forEach(cellId => { updated[cellId] = { ...(updated[cellId] || {}), ...style }; });
    setCellStyles(updated); await saveStructure(undefined, updated);
    toast.success(`Style applied to ${cellsToStyle.length} cell(s)`);
  };

  const handleColorPick = async (color: string) => {
    if (colorPickerType === 'bg') await applyStyleToSelection({ backgroundColor: color });
    else await applyStyleToSelection({ color });
    setColorPickerAnchor(null);
  };

  // ─── CELL EDIT ───
  const handleCellDoubleClick = (cellId: string) => {
    if (!canEdit) return;
    if (lockedCells[cellId]) { toast.error(`Cell ${cellId} is locked`); return; }
    setSelectedCell(cellId); setShowCellEditor(true);
  };

  const handleCellSave = async (cellId: string, value: string) => {
    if (!sheetId) return;
    const isFormula = value.trim().startsWith('=');
    setSpreadsheetData(prev => ({ ...prev, [cellId]: value }));
    setShowCellEditor(false); setSelectedCell(null);
    try {
      await api.post(`/sheets/${sheetId}/cells`, { cellId, value, dataType: isFormula ? 'FORMULA' : 'TEXT' });
      setTimeout(() => loadSheetData(), 500);
    } catch { toast.error('Failed to save cell'); }
    const userName = localStorage.getItem('userName') || 'User';
    const userId = localStorage.getItem('userId') || '';
    socketService.emitCellUpdate({ sheetId, cellId, value, userId, userName });
  };

  // ─── ROW/COL ───
  const addRow = () => { setSpreadsheetRows(prev => prev + 1); toast.success('Row added'); };
  const removeRow = () => { if (spreadsheetRows > 1) setSpreadsheetRows(prev => prev - 1); };
  const addColumn = () => { setSpreadsheetCols(prev => prev + 1); toast.success('Column added'); };
  const removeColumn = () => { if (spreadsheetCols > 1) setSpreadsheetCols(prev => prev - 1); };

  // ─── PUSH ───
  const handlePush = async () => {
    if (!sheetId) return;
    const assignmentData: any = {
      assignmentType: pushGranularity, question: pushQuestion || undefined, dueDate: pushDueDate || undefined,
    };
    if (pushGranularity === 'ROW') {
      const rows = pushRows.split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r));
      if (rows.length === 0) return toast.error('Enter row numbers');
      assignmentData.rows = rows;
    } else if (pushGranularity === 'COLUMN') {
      const cols = pushColumns.split(',').map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]+$/.test(c));
      if (cols.length === 0) return toast.error('Enter column letters');
      assignmentData.columns = cols;
    } else if (pushGranularity === 'CELL') {
      const cells = pushCells.split(',').map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]+\d+$/.test(c));
      if (cells.length === 0) return toast.error('Enter cell IDs');
      assignmentData.cells = cells;
    }
    try {
      if (pushMode === 'users' && selectedUserIds.length > 0) {
        await api.post(`/sheets/${sheetId}/push-to-users`, { userIds: selectedUserIds, ...assignmentData });
        toast.success(`Sheet pushed to ${selectedUserIds.length} user(s)`);
      } else if (pushMode === 'roles' && selectedRoles.length > 0) {
        await api.post(`/sheets/${sheetId}/push-to-roles`, { targetRoles: selectedRoles, ...assignmentData });
        toast.success(`Sheet pushed to roles: ${selectedRoles.join(', ')}`);
      } else { return toast.error('Select users or roles'); }
      socketService.emitSheetPushed({ sheetId, userIds: pushMode === 'users' ? selectedUserIds : undefined, roles: pushMode === 'roles' ? selectedRoles : undefined });
      socketService.emit('assignment-update', { sheetId, action: 'push' });
      setShowPushDialog(false);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to push sheet'); }
  };

  // ─── ASSIGNMENTS ───
  const handleRemoveAssignmentItems = async (assignmentId: string, removeRows?: number[], removeColumns?: string[], removeCells?: string[]) => {
    if (!sheetId) return;
    try {
      await api.post(`/sheets/${sheetId}/assignments/${assignmentId}/remove-items`, { removeRows, removeColumns, removeCells });
      toast.success('Items removed'); loadAssignments();
    } catch { toast.error('Failed to remove items'); }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!sheetId || !window.confirm('Delete this entire assignment?')) return;
    try { await api.delete(`/sheets/${sheetId}/assignments/${assignmentId}`); toast.success('Assignment deleted'); loadAssignments(); }
    catch { toast.error('Failed to delete assignment'); }
  };

  // ─── PERMISSIONS ───
  const handleSavePermissions = async () => {
    if (!sheetId) return;
    try {
      await api.put(`/sheets/${sheetId}`, { permissions: sheetPermissions });
      toast.success('Sheet permissions updated');
      setShowPermissionsDialog(false);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to update permissions'); }
  };

  // ─── TEMPLATES ───
  const handleSaveTemplate = async () => {
    if (!sheetId || !templateName.trim()) { toast.error('Template name required'); return; }
    try {
      const response = await api.post('/templates', { name: templateName, description: templateDescription, category: templateCategory, sheetId });
      if (response.data.success) { toast.success(`Template "${templateName}" saved!`); setShowSaveTemplateDialog(false); setTemplateName(''); }
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to save template'); }
  };

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const response = await api.get('/templates');
      if (response.data.success) { setSavedTemplates(response.data.templates); setShowLoadTemplateDialog(true); }
    } catch (err: any) { toast.error('Failed to load templates'); } finally { setLoadingTemplates(false); }
  };

  const handleApplyTemplate = async (templateId: string) => {
    if (!sheetId || !window.confirm('This will overwrite the current sheet. Continue?')) return;
    try {
      toast.loading('Applying template...');
      const response = await api.post(`/templates/${templateId}/apply`, { sheetId });
      if (response.data.success) { toast.dismiss(); toast.success(response.data.message); setShowLoadTemplateDialog(false); loadSheetData(); }
    } catch (err: any) { toast.dismiss(); toast.error(err.response?.data?.message || 'Failed to apply template'); }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!window.confirm('Delete this template?')) return;
    try { await api.delete(`/templates/${templateId}`); toast.success('Template deleted'); setSavedTemplates(prev => prev.filter(t => t.id !== templateId)); }
    catch { toast.error('Failed to delete template'); }
  };

  // ─── DPR TEMPLATE ───
  const applyDPRTemplate = async () => {
    if (!sheetId || !window.confirm('This will overwrite the current sheet with a DPR template. Continue?')) return;
    toast.loading('Applying DPR template...');
    const newRows = 25, newCols = 14;
    setSpreadsheetRows(newRows); setSpreadsheetCols(newCols);
    const newData: Record<string, string> = {};
    const newStyles: Record<string, CellStyle> = {};
    const newMerges: typeof mergedCells = [];

    newData['A1'] = 'DAILY PROGRESS REPORT';
    newMerges.push({ startRow: 0, startCol: 0, endRow: 0, endCol: newCols - 1 });
    for (let c = 0; c < newCols; c++) newStyles[getCellId(0, c)] = { backgroundColor: DPR_COLORS.headerYellow, fontWeight: 'bold', textAlign: 'center', fontSize: '14px' };

    const headers = ['S.No', 'Description', 'Tunnel Type', 'Start Chainage', 'End Chainage', 'Face Current Chainage', 'Tunnel Drive Length (m)', 'Steel Rib (Nos)', 'Rock Class', 'Month Target (m)', 'Target Per Day (m)', "Today's Progress (m)", 'Progress This Month (m)', 'Progress To Date (m)'];
    headers.forEach((h, i) => { newData[getCellId(1, i)] = h; newStyles[getCellId(1, i)] = { backgroundColor: DPR_COLORS.subHeaderBlue, fontWeight: 'bold', textAlign: 'center', fontSize: '11px' }; });

    newData['A3'] = 'TUNNEL UNDERGROUND EXCAVATION - HEADING';
    newMerges.push({ startRow: 2, startCol: 0, endRow: 2, endCol: newCols - 1 });
    for (let c = 0; c < newCols; c++) newStyles[getCellId(2, c)] = { backgroundColor: DPR_COLORS.sectionSalmon, fontWeight: 'bold', textAlign: 'center', fontSize: '12px' };

    newData['A4'] = 'P1 - PORTAL HEADING';
    newMerges.push({ startRow: 3, startCol: 0, endRow: 3, endCol: newCols - 1 });
    for (let c = 0; c < newCols; c++) newStyles[getCellId(3, c)] = { backgroundColor: DPR_COLORS.lightOrange, fontWeight: 'bold', textAlign: 'left', fontSize: '11px' };

    newData['A5'] = '1'; newData['B5'] = 'LHS TUBE'; newData['C5'] = 'Main Tunnel';
    newData['A6'] = '2'; newData['B6'] = 'RHS TUBE'; newData['C6'] = 'Main Tunnel';
    newData['B7'] = 'Total P1 - U/G Excavation';
    newMerges.push({ startRow: 6, startCol: 0, endRow: 6, endCol: 1 });
    for (let c = 0; c < newCols; c++) newStyles[getCellId(6, c)] = { backgroundColor: DPR_COLORS.totalGreen, fontWeight: 'bold', textAlign: 'center' };

    newData['B14'] = 'GRAND TOTAL';
    newMerges.push({ startRow: 13, startCol: 0, endRow: 13, endCol: 1 });
    for (let c = 0; c < newCols; c++) newStyles[getCellId(13, c)] = { backgroundColor: DPR_COLORS.headerYellow, fontWeight: 'bold', textAlign: 'center', fontSize: '12px' };

    setSpreadsheetData(newData); setCellStyles(newStyles); setMergedCells(newMerges);
    for (const [cellId, value] of Object.entries(newData)) {
      if (value) { try { await api.post(`/sheets/${sheetId}/cells`, { cellId, value, dataType: 'TEXT' }); } catch {} }
    }
    try {
      await api.put(`/sheets/${sheetId}/structure`, { structure: { rows: newRows, cols: newCols, mergedCells: newMerges, cellStyles: newStyles } });
      toast.dismiss(); toast.success('DPR template applied!');
    } catch { toast.dismiss(); toast.error('Failed to save DPR template'); }
  };

  // ─── CEO REPORT ───
  const handleGenerateReport = async () => {
    if (!sheetId) return;
    try {
      setGeneratingReport(true);
      const response = await api.post('/ceo-reports/generate', {
        sheetId, title: reportTitle || `Report: ${sheetInfo?.name || 'Sheet'}`,
        description: reportDescription || `Generated from sheet: ${sheetInfo?.name || 'Unknown'}`,
      });
      if (response.data.success) { toast.success('Report generated!'); setShowReportDialog(false); }
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to generate report'); }
    finally { setGeneratingReport(false); }
  };

  const handleSaveAllStyles = async () => { await saveStructure(); toast.success('All styles and structure saved!'); };

  // ─── LOADING ───
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // ════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════
  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <IconButton onClick={() => navigate(`/project/${projectId}`, { replace: true })}><BackIcon /></IconButton>
        <Box flex={1}>
          <Typography variant="h4" fontWeight="bold">{sheetInfo?.name || 'Sheet Editor'}</Typography>
          <Typography variant="body2" color="text.secondary">{sheetInfo?.description || 'No description'}</Typography>
        </Box>
        <IconButton onClick={loadSheetData} title="Refresh"><RefreshIcon /></IconButton>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#e3f2fd' }}>
            <Typography variant="h5" fontWeight="bold">{spreadsheetRows}×{spreadsheetCols}</Typography>
            <Typography variant="caption">Grid Size</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#e8f5e9' }}>
            <Typography variant="h5" fontWeight="bold">{Object.keys(spreadsheetData).filter(k => spreadsheetData[k]).length}</Typography>
            <Typography variant="caption">Filled Cells</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#f3e5f5' }}>
            <Typography variant="h5" fontWeight="bold">{mergedCells.length}</Typography>
            <Typography variant="caption">Merged Ranges</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#fff3e0' }}>
            <Typography variant="h5" fontWeight="bold">{Object.keys(lockedCells).length}</Typography>
            <Typography variant="caption">Locked Cells</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Toolbar (admin/PM only) */}
      {canEdit && (
        <Paper sx={{ p: 1.5, mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setShowRowColControls(!showRowColControls)}>Rows/Cols</Button>
            <Divider orientation="vertical" flexItem />
            <Tooltip title="Bold"><IconButton size="small" onClick={() => applyStyleToSelection({ fontWeight: 'bold' })}><BoldIcon /></IconButton></Tooltip>
            <Tooltip title="Align Left"><IconButton size="small" onClick={() => applyStyleToSelection({ textAlign: 'left' })}><AlignLeftIcon /></IconButton></Tooltip>
            <Tooltip title="Align Center"><IconButton size="small" onClick={() => applyStyleToSelection({ textAlign: 'center' })}><AlignCenterIcon /></IconButton></Tooltip>
            <Tooltip title="Align Right"><IconButton size="small" onClick={() => applyStyleToSelection({ textAlign: 'right' })}><AlignRightIcon /></IconButton></Tooltip>
            <Tooltip title="Background Color"><IconButton size="small" onClick={(e) => { setColorPickerType('bg'); setColorPickerAnchor(e.currentTarget); }}><FillColorIcon /></IconButton></Tooltip>
            <Tooltip title="Text Color"><IconButton size="small" onClick={(e) => { setColorPickerType('text'); setColorPickerAnchor(e.currentTarget); }}><TextColorIcon /></IconButton></Tooltip>
            <Divider orientation="vertical" flexItem />
            <Typography variant="caption" sx={{ ml: 0.5 }}>Quick:</Typography>
            {[
              { color: DPR_COLORS.headerYellow, label: 'Header' },
              { color: DPR_COLORS.sectionSalmon, label: 'Section' },
              { color: DPR_COLORS.totalGreen, label: 'Total' },
              { color: DPR_COLORS.dataBrown, label: 'Data' },
              { color: DPR_COLORS.subHeaderBlue, label: 'SubHdr' },
            ].map(({ color, label }) => (
              <Tooltip key={label} title={`Apply ${label} color`}>
                <Box onClick={() => applyStyleToSelection({ backgroundColor: color })}
                  sx={{ width: 20, height: 20, borderRadius: '3px', bgcolor: color, border: '1px solid #999', cursor: 'pointer', '&:hover': { transform: 'scale(1.2)', boxShadow: 2 } }} />
              </Tooltip>
            ))}
            <Divider orientation="vertical" flexItem />
            <Button size="small" variant="contained" color="success" startIcon={<SendIcon />} onClick={() => setShowPushDialog(true)}>Push</Button>
            <Button size="small" variant="outlined" color="error" startIcon={<UnassignIcon />} onClick={() => { setShowAssignmentsDialog(true); loadAssignments(); }}>Assignments</Button>
            <Button size="small" variant="contained" color="info" startIcon={<AssessmentIcon />} onClick={() => setShowReportDialog(true)}>CEO Report</Button>
            <Button size="small" variant="outlined" color="primary" startIcon={<PermissionsIcon />} onClick={() => setShowPermissionsDialog(true)}>Permissions</Button>
            <Button size="small" variant="outlined" color="warning" startIcon={<TemplateIcon />} onClick={applyDPRTemplate}>DPR Template</Button>
            <Button size="small" variant="outlined" color="secondary" startIcon={<SaveIcon />} onClick={() => setShowSaveTemplateDialog(true)}>Save Template</Button>
            <Button size="small" variant="outlined" color="secondary" startIcon={<TemplateIcon />} onClick={loadTemplates}>Load Template</Button>
            <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={handleSaveAllStyles}>Save</Button>
          </Box>
          {showRowColControls && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" gutterBottom>Rows ({spreadsheetRows})</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addRow} color="success">Add</Button>
                    <Button size="small" variant="outlined" startIcon={<RemoveIcon />} onClick={removeRow} color="error" disabled={spreadsheetRows <= 1}>Remove</Button>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" gutterBottom>Columns ({spreadsheetCols})</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addColumn} color="success">Add</Button>
                    <Button size="small" variant="outlined" startIcon={<RemoveIcon />} onClick={removeColumn} color="error" disabled={spreadsheetCols <= 1}>Remove</Button>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </Paper>
      )}

      {selectedCells.size > 1 && canEdit && (
        <Alert severity="info" sx={{ mb: 1 }}>{selectedCells.size} cells selected — Right-click for options</Alert>
      )}

      {/* ═══ SPREADSHEET GRID ═══ */}
      <Paper sx={{ mb: 3, overflow: 'hidden' }}>
        <Box sx={{
          overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 420px)',
          userSelect: isDragging ? 'none' : 'auto',
          cursor: resizing ? (resizing.type === 'col' ? 'col-resize' : 'row-resize') : 'default',
        }}>
          <table ref={tableRef} style={{ borderCollapse: 'collapse', width: 'auto', minWidth: '100%' }} onMouseUp={handleMouseUp}>
            <thead>
              <tr>
                <th style={{ fontWeight: 'bold', backgroundColor: '#404040', color: '#fff', padding: '6px 8px', textAlign: 'center', fontSize: '0.7rem', border: '1px solid #333', minWidth: 36, position: 'sticky', left: 0, top: 0, zIndex: 3 }}>#</th>
                {Array.from({ length: spreadsheetCols }, (_, col) => (
                  <th key={col} style={{ fontWeight: 'bold', backgroundColor: '#404040', color: '#fff', padding: '6px 8px', textAlign: 'center', fontSize: '0.7rem', border: '1px solid #333', width: getColWidth(col), minWidth: getColWidth(col), position: 'sticky', top: 0, zIndex: 2, userSelect: 'none', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      <span>{String.fromCharCode(65 + col)}</span>
                      {canEdit && <div onMouseDown={(e) => handleResizeStart('col', col, e)} style={{ position: 'absolute', right: -2, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: spreadsheetRows }, (_, row) => (
                <tr key={row} style={{ height: getRowHeight(row) }}>
                  <td style={{ fontWeight: 'bold', backgroundColor: '#404040', color: '#fff', padding: '4px 6px', textAlign: 'center', fontSize: '0.7rem', border: '1px solid #333', position: 'sticky', left: 0, zIndex: 1, userSelect: 'none', height: getRowHeight(row) }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', height: '100%' }}>
                      <span>{row + 1}</span>
                      {canEdit && <div onMouseDown={(e) => handleResizeStart('row', row, e)} style={{ position: 'absolute', left: 0, right: 0, bottom: -2, height: 5, cursor: 'row-resize', zIndex: 10 }} />}
                    </div>
                  </td>
                  {Array.from({ length: spreadsheetCols }, (_, col) => {
                    const cellId = getCellId(row, col);
                    const mergeInfo = getMergeInfo(row, col);
                    const isSelected = selectedCells.has(cellId) || selectedCell === cellId;
                    const isLocked = lockedCells[cellId];
                    const inDragSel = isInDragSelection(row, col);
                    const style = cellStyles[cellId] || {};
                    const value = spreadsheetData[cellId] || '';

                    if (mergeInfo.isMerged && !mergeInfo.isOrigin) return null;

                    return (
                      <td key={cellId} rowSpan={mergeInfo.rowSpan} colSpan={mergeInfo.colSpan}
                        onMouseDown={(e) => handleMouseDown(row, col, e)}
                        onMouseMove={() => handleMouseMove(row, col)}
                        onMouseUp={handleMouseUp}
                        onDoubleClick={() => handleCellDoubleClick(cellId)}
                        onContextMenu={(e) => handleContextMenu(row, col, e)}
                        style={{
                          padding: '4px 8px',
                          border: isSelected ? '2px solid #1976d2' : inDragSel ? '2px solid #1976d2' : '1px solid #c0c0c0',
                          backgroundColor: inDragSel ? (style.backgroundColor ? `${style.backgroundColor}CC` : '#e3f2fd') : style.backgroundColor || (isLocked ? '#fff3e0' : '#ffffff'),
                          color: style.color || '#333', fontWeight: style.fontWeight || 'normal',
                          textAlign: (style.textAlign as any) || 'left', fontSize: style.fontSize || '0.8rem',
                          cursor: !canEdit ? 'default' : isLocked ? 'not-allowed' : 'cell',
                          position: 'relative', height: getRowHeight(row), width: getColWidth(col),
                          minWidth: getColWidth(col), verticalAlign: 'middle', whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: getColWidth(col),
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
                          {isLocked && <LockIcon sx={{ fontSize: 12, color: '#ff9800', ml: 0.5 }} />}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Box sx={{ p: 1, borderTop: '1px solid #e0e0e0', display: 'flex', gap: 2, flexWrap: 'wrap', bgcolor: '#f9f9f9' }}>
          <Typography variant="caption" color="text.secondary">
            💡 {canEdit ? 'Drag to select • Right-click for options • Double-click to edit • Drag borders to resize' : 'View-only mode — contact admin to edit'}
          </Typography>
          {mergedCells.length > 0 && <Typography variant="caption" color="text.secondary">📐 {mergedCells.length} merged range(s)</Typography>}
          {Object.keys(lockedCells).length > 0 && <Typography variant="caption" color="text.secondary">🔒 {Object.keys(lockedCells).length} locked cell(s)</Typography>}
        </Box>
      </Paper>

      {/* ═══ CONTEXT MENU ═══ */}
      {contextMenu.open && canEdit && (
        <Paper elevation={8} sx={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999, minWidth: 220, py: 0.5, borderRadius: 1 }}
          onClick={(e) => e.stopPropagation()}>
          {getMergeInfo(contextMenu.row, contextMenu.col).isMerged ? (
            <ContextMenuItem onClick={handleUnmergeFromContext}><UnmergeIcon sx={{ mr: 1.5, fontSize: 18 }} /> Unmerge Cells</ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={handleMergeFromContext} disabled={selectedCells.size < 2}><MergeIcon sx={{ mr: 1.5, fontSize: 18 }} /> Merge Selected</ContextMenuItem>
          )}
          <Divider sx={{ my: 0.5 }} />
          {lockedCells[getCellId(contextMenu.row, contextMenu.col)] ? (
            <ContextMenuItem onClick={() => handleLockFromContext(false)}><LockOpenIcon sx={{ mr: 1.5, fontSize: 18, color: '#4caf50' }} /> Unlock Cell(s)</ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={() => handleLockFromContext(true)}><LockIcon sx={{ mr: 1.5, fontSize: 18, color: '#ff9800' }} /> Lock Cell(s)</ContextMenuItem>
          )}
          <Divider sx={{ my: 0.5 }} />
          <Typography variant="caption" sx={{ px: 2, color: 'text.secondary' }}>Color Row {contextMenu.row + 1}:</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, px: 2, py: 0.5, flexWrap: 'wrap' }}>
            {[DPR_COLORS.headerYellow, DPR_COLORS.sectionSalmon, DPR_COLORS.totalGreen, DPR_COLORS.subHeaderBlue, DPR_COLORS.lightGray, '#FFFFFF'].map(c => (
              <Box key={c} onClick={() => handleColorRow(c)} sx={{ width: 20, height: 20, borderRadius: '3px', bgcolor: c, border: '1px solid #999', cursor: 'pointer', '&:hover': { transform: 'scale(1.3)' } }} />
            ))}
          </Box>
          <Typography variant="caption" sx={{ px: 2, color: 'text.secondary' }}>Color Column {String.fromCharCode(65 + contextMenu.col)}:</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, px: 2, py: 0.5, flexWrap: 'wrap' }}>
            {[DPR_COLORS.headerYellow, DPR_COLORS.sectionSalmon, DPR_COLORS.totalGreen, DPR_COLORS.subHeaderBlue, DPR_COLORS.lightGray, '#FFFFFF'].map(c => (
              <Box key={c} onClick={() => handleColorColumn(c)} sx={{ width: 20, height: 20, borderRadius: '3px', bgcolor: c, border: '1px solid #999', cursor: 'pointer', '&:hover': { transform: 'scale(1.3)' } }} />
            ))}
          </Box>
        </Paper>
      )}

      {/* Close context menu on click anywhere */}
      {contextMenu.open && <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }} onClick={closeContextMenu} />}

      {/* ═══ COLOR PICKER POPOVER ═══ */}
      <Popover open={Boolean(colorPickerAnchor)} anchorEl={colorPickerAnchor} onClose={() => setColorPickerAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.5 }}>
          {COLOR_PALETTE.map(color => (
            <Box key={color} onClick={() => handleColorPick(color)}
              sx={{ width: 24, height: 24, borderRadius: '3px', bgcolor: color, border: '1px solid #ccc', cursor: 'pointer', '&:hover': { transform: 'scale(1.2)', boxShadow: 2 } }} />
          ))}
        </Box>
      </Popover>

      {/* ═══ CELL EDITOR MODAL ═══ */}
      {showCellEditor && selectedCell && (
        <CellEditorModal
          open={showCellEditor}
          cellId={selectedCell}
          sheetId={sheetId || ''}
          currentValue={spreadsheetData[selectedCell] || ''}
          onSave={handleCellSave}
          onClose={() => { setShowCellEditor(false); setSelectedCell(null); }}
          onReload={loadSheetData}
        />
      )}

      {/* ═══ PUSH DIALOG ═══ */}
      <Dialog open={showPushDialog} onClose={() => setShowPushDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Push Sheet: {sheetInfo?.name}<Typography variant="body2" color="text.secondary">Assign rows, columns, or cells to engineers</Typography></DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 2 }}>
            <Button variant={pushMode === 'roles' ? 'contained' : 'outlined'} onClick={() => setPushMode('roles')} fullWidth size="small">By Role</Button>
            <Button variant={pushMode === 'users' ? 'contained' : 'outlined'} onClick={() => setPushMode('users')} fullWidth size="small">Specific Users</Button>
          </Box>
          {pushMode === 'users' ? (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Select Users</InputLabel>
              <Select multiple value={selectedUserIds} onChange={(e) => setSelectedUserIds(e.target.value as string[])}
                renderValue={(selected) => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{selected.map(uid => { const u = availableUsers.find(x => x.id === uid); return <Chip key={uid} label={u ? `${u.firstName} ${u.lastName}` : uid} size="small" />; })}</Box>}>
                {availableUsers.map(u => (<MenuItem key={u.id} value={u.id}><Checkbox checked={selectedUserIds.includes(u.id)} /><ListItemText primary={`${u.firstName} ${u.lastName}`} secondary={authService.getRoleName(u.role)} /></MenuItem>))}
              </Select>
            </FormControl>
          ) : (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Select Roles</InputLabel>
              <Select multiple value={selectedRoles} onChange={(e) => setSelectedRoles(e.target.value as string[])}
                renderValue={(selected) => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{selected.map(r => <Chip key={r} label={authService.getRoleName(r)} size="small" />)}</Box>}>
                {['L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER'].map(role => (
                  <MenuItem key={role} value={role}><Checkbox checked={selectedRoles.includes(role)} /><ListItemText primary={authService.getRoleName(role)} /></MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>Assignment Type</Typography>
          <Tabs value={pushGranularity} onChange={(_, val) => setPushGranularity(val)} sx={{ mb: 2 }}>
            <Tab label="Rows" value="ROW" icon={<RowIcon />} iconPosition="start" />
            <Tab label="Columns" value="COLUMN" icon={<ColumnIcon />} iconPosition="start" />
            <Tab label="Cells" value="CELL" icon={<CellIcon />} iconPosition="start" />
          </Tabs>
          {pushGranularity === 'ROW' && <TextField label="Row Numbers" fullWidth value={pushRows} onChange={(e) => setPushRows(e.target.value)} placeholder="e.g. 1,2,3" helperText="Comma-separated row numbers" />}
          {pushGranularity === 'COLUMN' && <TextField label="Column Letters" fullWidth value={pushColumns} onChange={(e) => setPushColumns(e.target.value)} placeholder="e.g. A,B,C" helperText="Comma-separated column letters" />}
          {pushGranularity === 'CELL' && <TextField label="Cell IDs" fullWidth value={pushCells} onChange={(e) => setPushCells(e.target.value)} placeholder="e.g. B3,C4,D5" helperText="Comma-separated cell IDs" />}
          <Box sx={{ display: 'grid', gap: 2, mt: 2 }}>
            <TextField label="Instructions (optional)" fullWidth multiline rows={2} value={pushQuestion} onChange={(e) => setPushQuestion(e.target.value)} placeholder="e.g. Please fill in the cement quantity" />
            <TextField label="Due Date (optional)" type="date" fullWidth value={pushDueDate} onChange={(e) => setPushDueDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPushDialog(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<SendIcon />} onClick={handlePush}
            disabled={(pushMode === 'users' ? selectedUserIds.length === 0 : selectedRoles.length === 0) || (pushGranularity === 'ROW' && !pushRows.trim()) || (pushGranularity === 'COLUMN' && !pushColumns.trim()) || (pushGranularity === 'CELL' && !pushCells.trim())}>
            Push
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ ASSIGNMENTS MANAGER ═══ */}
      <Dialog open={showAssignmentsDialog} onClose={() => setShowAssignmentsDialog(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="h6">Manage Assignments: {sheetInfo?.name}</Typography>
              <Typography variant="body2" color="text.secondary">View, modify, or remove assignments</Typography>
            </Box>
            <IconButton onClick={() => setShowAssignmentsDialog(false)}><CloseIcon /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loadingAssignments ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : sheetAssignments.length === 0 ? (
            <Alert severity="info" sx={{ my: 2 }}>No assignments yet. Use "Push" to assign.</Alert>
          ) : (
            sheetAssignments.map((assignment) => {
              const rows = safeArr(assignment.rows);
              const columns = safeArr(assignment.columns);
              const cells = safeArr(assignment.cells);
              const assigneeName = assignment.user ? `${assignment.user.firstName} ${assignment.user.lastName}` : assignment.assignedRole ? authService.getRoleName(assignment.assignedRole) : 'Unknown';
              return (
                <Accordion key={assignment.id} sx={{ mb: 1 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" width="100%">
                      <PeopleIcon color="primary" fontSize="small" /><Typography fontWeight="bold">{assigneeName}</Typography>
                      {assignment.type && <Chip label={assignment.type} size="small" color="primary" variant="outlined" />}
                      {assignment.status && <Chip label={assignment.status} size="small" color={assignment.status === 'APPROVED' ? 'success' : assignment.status === 'SUBMITTED' ? 'info' : 'warning'} />}
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{new Date(assignment.createdAt).toLocaleDateString()}</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {rows.length > 0 && (
                      <Box mb={1}>
                        <Typography variant="subtitle2"><RowIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />Rows ({rows.length})</Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {rows.map((row: number) => <Chip key={row} label={`Row ${row}`} size="small" color="primary" variant="outlined" onDelete={() => handleRemoveAssignmentItems(assignment.id, [row])} />)}
                        </Box>
                      </Box>
                    )}
                    {columns.length > 0 && (
                      <Box mb={1}>
                        <Typography variant="subtitle2"><ColumnIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />Columns ({columns.length})</Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {columns.map((col: string) => <Chip key={col} label={`Col ${col}`} size="small" color="secondary" variant="outlined" onDelete={() => handleRemoveAssignmentItems(assignment.id, undefined, [col])} />)}
                        </Box>
                      </Box>
                    )}
                    {cells.length > 0 && (
                      <Box mb={1}>
                        <Typography variant="subtitle2"><CellIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />Cells ({cells.length})</Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {cells.map((cell: string) => <Chip key={cell} label={cell} size="small" color="info" variant="outlined" onDelete={() => handleRemoveAssignmentItems(assignment.id, undefined, undefined, [cell])} />)}
                        </Box>
                      </Box>
                    )}
                    <Divider sx={{ my: 1.5 }} />
                    <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={() => handleDeleteAssignment(assignment.id)}>Delete Assignment</Button>
                  </AccordionDetails>
                </Accordion>
              );
            })
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={loadAssignments} startIcon={<RefreshIcon />}>Refresh</Button>
          <Button onClick={() => setShowAssignmentsDialog(false)} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ PERMISSIONS DIALOG ═══ */}
      <Dialog open={showPermissionsDialog} onClose={() => setShowPermissionsDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <PermissionsIcon color="primary" />
            Sheet Permissions: {sheetInfo?.name}
          </Box>
          <Typography variant="body2" color="text.secondary">Set which roles can view or edit this sheet</Typography>
        </DialogTitle>
        <DialogContent dividers>
          {ALL_ROLES.filter(r => r !== 'L1_ADMIN').map(role => {
            const perm = sheetPermissions[role] || { canView: false, canEdit: false };
            return (
              <Box key={role} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #eee' }}>
                <Box>
                  <Typography fontWeight="bold">{authService.getRoleName(role)}</Typography>
                  <Typography variant="caption" color="text.secondary">{role}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <FormControlLabel
                    control={<Switch checked={perm.canView} onChange={(e) => setSheetPermissions(prev => ({ ...prev, [role]: { ...perm, canView: e.target.checked } }))} />}
                    label="View" labelPlacement="start"
                  />
                  <FormControlLabel
                    control={<Switch checked={perm.canEdit} onChange={(e) => setSheetPermissions(prev => ({ ...prev, [role]: { ...perm, canEdit: e.target.checked, canView: e.target.checked ? true : perm.canView } }))} />}
                    label="Edit" labelPlacement="start"
                  />
                </Box>
              </Box>
            );
          })}
          <Alert severity="info" sx={{ mt: 2 }}>
            L1 Admin always has full access. Edit permission automatically grants View.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPermissionsDialog(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSavePermissions}>Save Permissions</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ CEO REPORT DIALOG ═══ */}
      <Dialog open={showReportDialog} onClose={() => setShowReportDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>📊 Generate CEO Report</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'grid', gap: 2 }}>
            <TextField label="Report Title" fullWidth value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder={`Report: ${sheetInfo?.name}`} />
            <TextField label="Description" fullWidth multiline rows={3} value={reportDescription} onChange={(e) => setReportDescription(e.target.value)} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowReportDialog(false)}>Cancel</Button>
          <Button variant="contained" disabled={generatingReport} onClick={handleGenerateReport}>{generatingReport ? 'Generating...' : 'Generate'}</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ SAVE TEMPLATE DIALOG ═══ */}
      <Dialog open={showSaveTemplateDialog} onClose={() => setShowSaveTemplateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>💾 Save as Template</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'grid', gap: 2 }}>
            <TextField label="Template Name" fullWidth value={templateName} onChange={(e) => setTemplateName(e.target.value)} autoFocus />
            <TextField label="Description" fullWidth multiline rows={2} value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} />
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select value={templateCategory} onChange={(e) => setTemplateCategory(e.target.value)}>
                <MenuItem value="dpr">DPR</MenuItem><MenuItem value="finance">Finance</MenuItem>
                <MenuItem value="progress">Progress</MenuItem><MenuItem value="custom">Custom</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSaveTemplateDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTemplate} disabled={!templateName.trim()}>Save Template</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ LOAD TEMPLATE DIALOG ═══ */}
      <Dialog open={showLoadTemplateDialog} onClose={() => setShowLoadTemplateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>📂 Load Template</DialogTitle>
        <DialogContent>
          {loadingTemplates ? <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box> :
            savedTemplates.length === 0 ? <Alert severity="info">No templates saved yet</Alert> : (
              savedTemplates.map(t => (
                <Paper key={t.id} sx={{ p: 2, mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography fontWeight="bold">{t.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{t.description || t.category} • {new Date(t.createdAt).toLocaleDateString()}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="contained" onClick={() => handleApplyTemplate(t.id)}>Apply</Button>
                    <IconButton size="small" color="error" onClick={() => handleDeleteTemplate(t.id)}><DeleteIcon /></IconButton>
                  </Box>
                </Paper>
              ))
            )}
        </DialogContent>
        <DialogActions><Button onClick={() => setShowLoadTemplateDialog(false)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

// Need ContextMenuItem for context menu (not the MUI MenuItem)
const ContextMenuItem = ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
  <Box onClick={disabled ? undefined : onClick}
    sx={{ px: 2, py: 0.75, display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1, '&:hover': disabled ? {} : { bgcolor: 'action.hover' }, fontSize: '0.875rem' }}>
    {children}
  </Box>
);

export default ProjectSheetEditor;
