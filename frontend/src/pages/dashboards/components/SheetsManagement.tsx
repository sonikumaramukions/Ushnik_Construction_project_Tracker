// ================================================================
// SHEETS MANAGEMENT (pages/dashboards/components/SheetsManagement.tsx)
// ================================================================
// PURPOSE: Admin panel for creating and managing DPR-style tracking sheets.
//
// FEATURES:
//   - Professional DPR (Daily Progress Report) sheet builder
//   - Cell-level styling (background color, text color, font weight, alignment)
//   - DRAG-SELECT cells + right-click context menu (merge/unmerge/lock/color row/column)
//   - Resizable columns and rows (drag borders like Excel)
//   - Merge cells via drag + right-click
//   - Lock specific cells (persisted to backend CellPermission)
//   - Unassign sheets from users/roles
//   - Formula cells (SUM totals)
//   - Push sheets to users/roles with cell-level permissions
//   - Generate CEO reports
//   - DPR Templates for quick creation
//
// DATA: Calls sheetsAPI (CRUD operations)
// PARENT: AdminDashboard.tsx (rendered in "Sheets" tab)
// ================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  IconButton,
  Snackbar,
  CircularProgress,
  TextField,
  Tooltip,
  Popover,
  Divider,
  List,
  ListItem,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Send as SendIcon,
  Assessment as AssessmentIcon,
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  MergeType as MergeIcon,
  CallSplit as UnmergeIcon,
  FormatBold as BoldIcon,
  FormatAlignLeft as AlignLeftIcon,
  FormatAlignCenter as AlignCenterIcon,
  FormatAlignRight as AlignRightIcon,
  FormatColorFill as FillColorIcon,
  FormatColorText as TextColorIcon,
  TableChart as TemplateIcon,
  Save as SaveIcon,
  PersonRemove as UnassignIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../../services/api';
import { authService } from '../../../services/authService';
import socketService from '../../../services/socketService';
import CellEditorModal from './CellEditorModal';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface AssignedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  assignedAt: string;
  userSheetId: string;
}

interface SheetInfo {
  id: string;
  name: string;
  description?: string;
  status: string;
  projectId?: string;
}

// ─── Cell Style interface ───
interface CellStyle {
  backgroundColor?: string;
  color?: string;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: string;
  borderBottom?: string;
}

// ─── Context Menu state ───
interface ContextMenu {
  open: boolean;
  x: number;
  y: number;
  row: number;
  col: number;
}

// ─── Predefined Colors for DPR styling ───
const DPR_COLORS = {
  headerYellow: '#FFD966',
  sectionSalmon: '#F4B084',
  totalGreen: '#A9D08E',
  dataBrown: '#C6975C',
  subHeaderBlue: '#BDD7EE',
  lightGray: '#F2F2F2',
  white: '#FFFFFF',
  lightYellow: '#FFF2CC',
  lightGreen: '#E2EFDA',
  lightOrange: '#FCE4D6',
};

// Color palette for the color picker
const COLOR_PALETTE = [
  '#FFFFFF', '#F2F2F2', '#D9D9D9', '#BFBFBF', '#808080', '#404040',
  '#FFD966', '#FFF2CC', '#F4B084', '#FCE4D6', '#C6975C', '#BF8F00',
  '#A9D08E', '#E2EFDA', '#70AD47', '#548235', '#375623', '#203413',
  '#BDD7EE', '#DEEBF7', '#5B9BD5', '#2F75B5', '#1F4E79', '#102542',
  '#D9B3FF', '#F2E6FF', '#B280D9', '#8040BF', '#602080', '#401060',
  '#FF9999', '#FFE6E6', '#FF4D4D', '#CC0000', '#800000', '#400000',
];

// ─── SHEETS MANAGEMENT COMPONENT ───
const SheetsManagement: React.FC = () => {
  // --- Sheet selection state ---
  const [allSheets, setAllSheets] = useState<SheetInfo[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetInfo | null>(null);
  const [loadingSheets, setLoadingSheets] = useState(true);

  // --- Spreadsheet grid state ---
  const [spreadsheetData, setSpreadsheetData] = useState<{ [key: string]: string }>({});
  const [spreadsheetRows, setSpreadsheetRows] = useState(20);
  const [spreadsheetCols, setSpreadsheetCols] = useState(14);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [showCellEditor, setShowCellEditor] = useState(false);
  const [lockedCells, setLockedCells] = useState<{ [key: string]: boolean }>({});

  // --- Cell Styles ---
  const [cellStyles, setCellStyles] = useState<{ [key: string]: CellStyle }>({});

  // --- Push dialog state ---
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pushMode, setPushMode] = useState<'users' | 'roles'>('users');

  // --- Push assignment granularity ---
  const [pushAssignmentType, setPushAssignmentType] = useState<'SHEET' | 'ROW' | 'COLUMN' | 'CELL'>('SHEET');
  const [pushAssignedRows, setPushAssignedRows] = useState<number[]>([]);
  const [pushAssignedColumns, setPushAssignedColumns] = useState<string[]>([]);
  const [pushAssignedCells, setPushAssignedCells] = useState<string[]>([]);

  // --- Unassign / Assignment Manager dialog state ---
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [sheetAssignments, setSheetAssignments] = useState<any[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  const [showRowColControls, setShowRowColControls] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);

  // --- Template dialog state ---
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showLoadTemplateDialog, setShowLoadTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('custom');
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // --- Inline Finance Panel state ---
  const [showFinancePanel, setShowFinancePanel] = useState(false);
  const [financeRecords, setFinanceRecords] = useState<any[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [showFinanceForm, setShowFinanceForm] = useState(false);
  const [financeForm, setFinanceForm] = useState({
    description: '', category: 'EXPENSE', amount: '', year: new Date().getFullYear(),
    quarter: Math.ceil((new Date().getMonth() + 1) / 3), revenue: '', expenses: '',
    operationalCost: '', notes: '',
  });

  // --- Merge cells state ---
  const [mergedCells, setMergedCells] = useState<Array<{
    startRow: number; startCol: number; endRow: number; endCol: number;
  }>>([]);

  // --- DRAG SELECTION state (replaces old merge mode) ---
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  // --- Context menu state ---
  const [contextMenu, setContextMenu] = useState<ContextMenu>({ open: false, x: 0, y: 0, row: 0, col: 0 });
  const [contextColorPicker, setContextColorPicker] = useState<{ open: boolean; type: 'row' | 'column' | 'cell'; target: number }>({ open: false, type: 'cell', target: 0 });

  // --- Resizable columns & rows ---
  const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({});
  const [rowHeights, setRowHeights] = useState<{ [key: number]: number }>({});
  const [resizing, setResizing] = useState<{ type: 'col' | 'row'; index: number; startPos: number; startSize: number } | null>(null);

  // --- Style toolbar state ---
  const [colorPickerAnchor, setColorPickerAnchor] = useState<HTMLElement | null>(null);
  const [colorPickerType, setColorPickerType] = useState<'bg' | 'text'>('bg');

  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'info',
  });

  const tableRef = useRef<HTMLTableElement>(null);
  const initialLoadDone = useRef(false);

  // Load sheets list
  const loadSheetsList = useCallback(async () => {
    try {
      setLoadingSheets(true);
      const sheetsRes = await api.get('/sheets');
      const d = sheetsRes.data;
      const sheetsList: SheetInfo[] = d.sheets || d || [];
      setAllSheets(sheetsList);
    } catch (err) {
      console.error('Failed to load sheets list:', err);
    } finally {
      setLoadingSheets(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoadDone.current) return; // Prevent StrictMode double-fire
    initialLoadDone.current = true;
    loadSheetsList();
    loadUsers();
  }, [loadSheetsList]);

  const loadUsers = async () => {
    try {
      const response = await api.get('/auth/users');
      if (response.data?.users) setAvailableUsers(response.data.users);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  // Socket connection when sheet is active
  useEffect(() => {
    if (!activeSheetId) return;

    const token = localStorage.getItem('token');
    if (token) {
      socketService.connect(token);
      socketService.joinSheet(activeSheetId);
      // Real-time cell updates from other users
      socketService.onCellUpdate((data) => {
        if (data.sheetId !== activeSheetId) return;
        setSpreadsheetData(prev => ({ ...prev, [data.cellId]: data.value }));
      });
      // Also listen on the other event name
      socketService.on('cell_updated', (data: any) => {
        if (data.sheetId !== activeSheetId) return;
        setSpreadsheetData(prev => ({ ...prev, [data.cellId]: data.value }));
      });
      socketService.onFormulaUpdate((data) => {
        if (data.sheetId !== activeSheetId) return;
        loadSheetData(activeSheetId);
      });
      socketService.onPermissionUpdate(() => {});
      // Listen for assignment changes
      socketService.on('assignment-updated', (data: any) => {
        if (data.sheetId === activeSheetId) {
          loadAssignments();
          toast.success('Assignments updated in real-time');
        }
      });
    }

    loadSheetData(activeSheetId);

    return () => {
      socketService.offCellUpdate();
      socketService.off('cell_updated');
      socketService.offFormulaUpdate();
      socketService.offPermissionUpdate();
      socketService.off('assignment-updated');
      if (activeSheetId) socketService.leaveSheet(activeSheetId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheetId]);

  const loadSheetData = async (sheetId: string) => {
    try {
      const response = await api.get(`/sheets/${sheetId}`);
      if (response.data?.sheet) {
        const sheet = response.data.sheet;
        setActiveSheet(sheet);

        // Load merges
        if (sheet?.structure?.mergedCells && Array.isArray(sheet.structure.mergedCells)) {
          setMergedCells(sheet.structure.mergedCells);
        } else {
          setMergedCells([]);
        }

        // Load cell styles
        if (sheet?.structure?.cellStyles && typeof sheet.structure.cellStyles === 'object') {
          setCellStyles(sheet.structure.cellStyles);
        } else {
          setCellStyles({});
        }

        // Load locked cells from structure
        if (sheet?.structure?.lockedCells && typeof sheet.structure.lockedCells === 'object') {
          setLockedCells(sheet.structure.lockedCells);
        } else {
          setLockedCells({});
        }

        // Load column widths and row heights
        if (sheet?.structure?.columnWidths) setColumnWidths(sheet.structure.columnWidths);
        else setColumnWidths({});
        if (sheet?.structure?.rowHeights) setRowHeights(sheet.structure.rowHeights);
        else setRowHeights({});

        // Load grid size
        if (sheet.structure) {
          setSpreadsheetRows(sheet.structure.rows || 20);
          setSpreadsheetCols(sheet.structure.cols || 14);
        }

        // Load cell data
        const data: { [key: string]: string } = {};
        if (sheet.cellData && Array.isArray(sheet.cellData)) {
          let maxRow = 0;
          let maxCol = 0;
          sheet.cellData.forEach((cell: any) => {
            if (cell.dataType === 'FORMULA' && cell.numericValue !== null) {
              data[cell.cellId] = String(cell.numericValue);
            } else {
              data[cell.cellId] = cell.value || '';
            }
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
        setSpreadsheetData({});
        toast('Sheet not found, starting fresh', { icon: 'ℹ️' });
      } else {
        toast.error('Failed to load sheet data');
      }
    }
  };

  // ─── SAVE STRUCTURE (merges, styles, grid size, column widths, row heights, locked cells) ───
  const saveStructure = async (
    updatedMerges?: typeof mergedCells,
    updatedStyles?: typeof cellStyles,
    updatedRows?: number,
    updatedCols?: number,
    updatedColWidths?: typeof columnWidths,
    updatedRowHeights?: typeof rowHeights,
    updatedLockedCells?: typeof lockedCells,
  ) => {
    if (!activeSheetId) return;
    try {
      await api.put(`/sheets/${activeSheetId}/structure`, {
        structure: {
          ...(activeSheet as any)?.structure,
          rows: updatedRows ?? spreadsheetRows,
          cols: updatedCols ?? spreadsheetCols,
          mergedCells: updatedMerges ?? mergedCells,
          cellStyles: updatedStyles ?? cellStyles,
          columnWidths: updatedColWidths ?? columnWidths,
          rowHeights: updatedRowHeights ?? rowHeights,
          lockedCells: updatedLockedCells ?? lockedCells,
        },
      });
    } catch (err) {
      console.error('Failed to save structure:', err);
      toast.error('Failed to save structure');
    }
  };

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
          merge,
        };
      }
    }
    return { isMerged: false, isOrigin: false, rowSpan: 1, colSpan: 1, merge: null };
  };

  // ─── DRAG SELECTION HELPERS ───
  const getDragSelection = (): { startRow: number; endRow: number; startCol: number; endCol: number } | null => {
    if (!dragStart || !dragEnd) return null;
    return {
      startRow: Math.min(dragStart.row, dragEnd.row),
      endRow: Math.max(dragStart.row, dragEnd.row),
      startCol: Math.min(dragStart.col, dragEnd.col),
      endCol: Math.max(dragStart.col, dragEnd.col),
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
      for (let c = sel.startCol; c <= sel.endCol; c++) {
        cells.push(getCellId(r, c));
      }
    }
    return cells;
  };

  // ─── MOUSE HANDLERS for drag selection ───
  const handleMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    if (e.button === 2) return; // right-click handled separately
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ row, col });
    setDragEnd({ row, col });
    const cellId = getCellId(row, col);
    setSelectedCell(cellId);
    setSelectedCells(new Set([cellId]));
  };

  const handleMouseMove = (row: number, col: number) => {
    if (!isDragging || !dragStart) return;
    setDragEnd({ row, col });
    // Update selected cells set
    const sel = {
      startRow: Math.min(dragStart.row, row),
      endRow: Math.max(dragStart.row, row),
      startCol: Math.min(dragStart.col, col),
      endCol: Math.max(dragStart.col, col),
    };
    const newSelected = new Set<string>();
    for (let r = sel.startRow; r <= sel.endRow; r++) {
      for (let c = sel.startCol; c <= sel.endCol; c++) {
        newSelected.add(getCellId(r, c));
      }
    }
    setSelectedCells(newSelected);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add global mouseup listener
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  // ─── RIGHT-CLICK CONTEXT MENU ───
  const handleContextMenu = (row: number, col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // If right-click is outside current drag selection, select this cell
    if (!isInDragSelection(row, col)) {
      setDragStart({ row, col });
      setDragEnd({ row, col });
      setSelectedCell(getCellId(row, col));
      setSelectedCells(new Set([getCellId(row, col)]));
    }
    setContextMenu({ open: true, x: e.clientX, y: e.clientY, row, col });
  };

  const closeContextMenu = () => {
    setContextMenu({ ...contextMenu, open: false });
    setContextColorPicker({ open: false, type: 'cell', target: 0 });
  };

  // ─── MERGE from context menu ───
  const handleMergeFromContext = async () => {
    const sel = getDragSelection();
    if (!sel) { toast.error('Select cells to merge first (drag to select)'); closeContextMenu(); return; }
    if (sel.startRow === sel.endRow && sel.startCol === sel.endCol) {
      toast.error('Select at least 2 cells to merge'); closeContextMenu(); return;
    }

    // Check for overlapping merges
    for (const existing of mergedCells) {
      const overlaps = !(sel.endRow < existing.startRow || sel.startRow > existing.endRow ||
                         sel.endCol < existing.startCol || sel.startCol > existing.endCol);
      if (overlaps) {
        toast.error('Cannot merge: overlaps existing range. Unmerge first.');
        closeContextMenu(); return;
      }
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
    const updated = mergedCells.filter(m =>
      !(row >= m.startRow && row <= m.endRow && col >= m.startCol && col <= m.endCol)
    );
    if (updated.length === mergedCells.length) {
      toast.error('No merge found at this cell');
    } else {
      setMergedCells(updated);
      await saveStructure(updated);
      toast.success('Cells unmerged');
    }
    closeContextMenu();
  };

  // ─── LOCK CELLS from context menu (persisted to backend) ───
  const handleLockFromContext = async (lock: boolean) => {
    if (!activeSheetId) return;
    const cellIds = getSelectedCellIds();
    if (cellIds.length === 0) { toast.error('No cells selected'); closeContextMenu(); return; }

    try {
      await api.post(`/sheets/${activeSheetId}/lock-cells`, { cellIds, locked: lock });
      const updatedLocked = { ...lockedCells };
      cellIds.forEach(id => {
        if (lock) updatedLocked[id] = true;
        else delete updatedLocked[id];
      });
      setLockedCells(updatedLocked);
      toast.success(`${cellIds.length} cell(s) ${lock ? 'locked' : 'unlocked'}`);
    } catch (err) {
      toast.error(`Failed to ${lock ? 'lock' : 'unlock'} cells`);
    }
    closeContextMenu();
  };

  // ─── COLOR ROW/COLUMN from context menu ───
  const handleColorRow = async (color: string) => {
    const row = contextMenu.row;
    const updated = { ...cellStyles };
    for (let c = 0; c < spreadsheetCols; c++) {
      const cid = getCellId(row, c);
      updated[cid] = { ...(updated[cid] || {}), backgroundColor: color };
    }
    setCellStyles(updated);
    await saveStructure(undefined, updated);
    toast.success(`Row ${row + 1} colored`);
    setContextColorPicker({ open: false, type: 'cell', target: 0 });
    closeContextMenu();
  };

  const handleColorColumn = async (color: string) => {
    const col = contextMenu.col;
    const updated = { ...cellStyles };
    for (let r = 0; r < spreadsheetRows; r++) {
      const cid = getCellId(r, col);
      updated[cid] = { ...(updated[cid] || {}), backgroundColor: color };
    }
    setCellStyles(updated);
    await saveStructure(undefined, updated);
    toast.success(`Column ${String.fromCharCode(65 + col)} colored`);
    setContextColorPicker({ open: false, type: 'cell', target: 0 });
    closeContextMenu();
  };

  // ─── COLUMN/ROW RESIZE HANDLERS ───
  const handleResizeStart = (type: 'col' | 'row', index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startPos = type === 'col' ? e.clientX : e.clientY;
    const startSize = type === 'col'
      ? (columnWidths[index] || (index === 1 ? 180 : 100))
      : (rowHeights[index] || 28);
    setResizing({ type, index, startPos, startSize });
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMove = (e: MouseEvent) => {
      const diff = resizing.type === 'col'
        ? e.clientX - resizing.startPos
        : e.clientY - resizing.startPos;
      const newSize = Math.max(resizing.type === 'col' ? 40 : 20, resizing.startSize + diff);

      if (resizing.type === 'col') {
        setColumnWidths(prev => ({ ...prev, [resizing.index]: newSize }));
      } else {
        setRowHeights(prev => ({ ...prev, [resizing.index]: newSize }));
      }
    };

    const handleUp = () => {
      // Save to structure on mouse up
      saveStructure(undefined, undefined, undefined, undefined,
        resizing.type === 'col' ? { ...columnWidths, [resizing.index]: columnWidths[resizing.index] || (resizing.index === 1 ? 180 : 100) } : undefined,
        resizing.type === 'row' ? { ...rowHeights, [resizing.index]: rowHeights[resizing.index] || 28 } : undefined,
      );
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing, columnWidths, rowHeights]);

  // ─── CELL STYLING ───
  const applyStyleToSelection = async (style: Partial<CellStyle>) => {
    const cellsToStyle = selectedCells.size > 0 ? Array.from(selectedCells) : (selectedCell ? [selectedCell] : []);
    if (cellsToStyle.length === 0) {
      toast.error('Select cells first');
      return;
    }

    const updated = { ...cellStyles };
    cellsToStyle.forEach(cellId => {
      updated[cellId] = { ...(updated[cellId] || {}), ...style };
    });
    setCellStyles(updated);
    await saveStructure(undefined, updated);
    toast.success(`Style applied to ${cellsToStyle.length} cell(s)`);
  };

  const handleColorPick = async (color: string) => {
    if (colorPickerType === 'bg') {
      await applyStyleToSelection({ backgroundColor: color });
    } else {
      await applyStyleToSelection({ color: color });
    }
    setColorPickerAnchor(null);
  };

  // ─── APPLY DPR TEMPLATE ───
  const applyDPRTemplate = async () => {
    if (!activeSheetId) return;

    const confirmed = window.confirm(
      'This will overwrite the current sheet with a DPR template. Continue?'
    );
    if (!confirmed) return;

    toast.loading('Applying DPR template...');

    const newRows = 25;
    const newCols = 14;
    setSpreadsheetRows(newRows);
    setSpreadsheetCols(newCols);

    const newData: { [key: string]: string } = {};
    const newStyles: { [key: string]: CellStyle } = {};
    const newMerges: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }> = [];

    // Row 0: Title
    newData['A1'] = 'DAILY PROGRESS REPORT';
    newMerges.push({ startRow: 0, startCol: 0, endRow: 0, endCol: newCols - 1 });
    for (let c = 0; c < newCols; c++) {
      newStyles[getCellId(0, c)] = { backgroundColor: DPR_COLORS.headerYellow, fontWeight: 'bold', textAlign: 'center', fontSize: '14px' };
    }

    // Row 1: Column Headers
    const headers = [
      'S.No', 'Description', 'Tunnel Type', 'Start Chainage',
      'End Chainage', 'Face Current Chainage', 'Tunnel Drive Length (m)',
      'Steel Rib (Nos)', 'Rock Class', 'Month Target (m)', 'Target Per Day (m)',
      "Today's Progress (m)", 'Progress This Month (m)', 'Progress To Date (m)',
    ];
    headers.forEach((h, i) => {
      const cid = getCellId(1, i);
      newData[cid] = h;
      newStyles[cid] = { backgroundColor: DPR_COLORS.subHeaderBlue, fontWeight: 'bold', textAlign: 'center', fontSize: '11px' };
    });

    // Row 2: Section Header
    newData['A3'] = 'TUNNEL UNDERGROUND EXCAVATION - HEADING';
    newMerges.push({ startRow: 2, startCol: 0, endRow: 2, endCol: newCols - 1 });
    for (let c = 0; c < newCols; c++) {
      newStyles[getCellId(2, c)] = { backgroundColor: DPR_COLORS.sectionSalmon, fontWeight: 'bold', textAlign: 'center', fontSize: '12px' };
    }

    // Row 3: Sub-section P1
    newData['A4'] = 'P1 - PORTAL HEADING';
    newMerges.push({ startRow: 3, startCol: 0, endRow: 3, endCol: newCols - 1 });
    for (let c = 0; c < newCols; c++) {
      newStyles[getCellId(3, c)] = { backgroundColor: DPR_COLORS.lightOrange, fontWeight: 'bold', textAlign: 'left', fontSize: '11px' };
    }

    // Rows 4-5: Data rows
    newData['A5'] = '1'; newData['B5'] = 'LHS TUBE'; newData['C5'] = 'Main Tunnel';
    newStyles['A5'] = { textAlign: 'center' }; newStyles['B5'] = { fontWeight: 'bold' };
    newStyles['D5'] = { backgroundColor: DPR_COLORS.dataBrown, color: '#FFFFFF', textAlign: 'center' };
    newStyles['E5'] = { backgroundColor: DPR_COLORS.dataBrown, color: '#FFFFFF', textAlign: 'center' };

    newData['A6'] = '2'; newData['B6'] = 'RHS TUBE'; newData['C6'] = 'Main Tunnel';
    newStyles['A6'] = { textAlign: 'center' }; newStyles['B6'] = { fontWeight: 'bold' };
    newStyles['D6'] = { backgroundColor: DPR_COLORS.dataBrown, color: '#FFFFFF', textAlign: 'center' };
    newStyles['E6'] = { backgroundColor: DPR_COLORS.dataBrown, color: '#FFFFFF', textAlign: 'center' };

    // Row 6: Total P1
    newData['B7'] = 'Total P1 - U/G Excavation';
    newMerges.push({ startRow: 6, startCol: 0, endRow: 6, endCol: 1 });
    for (let c = 0; c < newCols; c++) {
      newStyles[getCellId(6, c)] = { backgroundColor: DPR_COLORS.totalGreen, fontWeight: 'bold', textAlign: 'center' };
    }

    // Row 8: Sub-section P2
    newData['A9'] = 'P2 - PORTAL HEADING';
    newMerges.push({ startRow: 8, startCol: 0, endRow: 8, endCol: newCols - 1 });
    for (let c = 0; c < newCols; c++) {
      newStyles[getCellId(8, c)] = { backgroundColor: DPR_COLORS.lightOrange, fontWeight: 'bold', textAlign: 'left', fontSize: '11px' };
    }

    newData['A10'] = '3'; newData['B10'] = 'LHS TUBE'; newData['C10'] = 'Main Tunnel';
    newStyles['A10'] = { textAlign: 'center' }; newStyles['B10'] = { fontWeight: 'bold' };
    newStyles['D10'] = { backgroundColor: DPR_COLORS.dataBrown, color: '#FFFFFF', textAlign: 'center' };
    newStyles['E10'] = { backgroundColor: DPR_COLORS.dataBrown, color: '#FFFFFF', textAlign: 'center' };

    newData['A11'] = '4'; newData['B11'] = 'RHS TUBE'; newData['C11'] = 'Main Tunnel';
    newStyles['A11'] = { textAlign: 'center' }; newStyles['B11'] = { fontWeight: 'bold' };
    newStyles['D11'] = { backgroundColor: DPR_COLORS.dataBrown, color: '#FFFFFF', textAlign: 'center' };
    newStyles['E11'] = { backgroundColor: DPR_COLORS.dataBrown, color: '#FFFFFF', textAlign: 'center' };

    // Row 11: Total P2
    newData['B12'] = 'Total P2 - U/G Excavation';
    newMerges.push({ startRow: 11, startCol: 0, endRow: 11, endCol: 1 });
    for (let c = 0; c < newCols; c++) {
      newStyles[getCellId(11, c)] = { backgroundColor: DPR_COLORS.totalGreen, fontWeight: 'bold', textAlign: 'center' };
    }

    // Row 13: Grand Total
    newData['B14'] = 'GRAND TOTAL';
    newMerges.push({ startRow: 13, startCol: 0, endRow: 13, endCol: 1 });
    for (let c = 0; c < newCols; c++) {
      newStyles[getCellId(13, c)] = { backgroundColor: DPR_COLORS.headerYellow, fontWeight: 'bold', textAlign: 'center', fontSize: '12px' };
    }

    setSpreadsheetData(newData);
    setCellStyles(newStyles);
    setMergedCells(newMerges);

    // Save cells to backend
    for (const [cellId, value] of Object.entries(newData)) {
      if (value) {
        try {
          await api.post(`/sheets/${activeSheetId}/cells`, { cellId, value, dataType: 'TEXT' });
        } catch { /* continue */ }
      }
    }

    // Save structure
    try {
      await api.put(`/sheets/${activeSheetId}/structure`, {
        structure: { rows: newRows, cols: newCols, mergedCells: newMerges, cellStyles: newStyles },
      });
      toast.dismiss();
      toast.success('DPR template applied!');
    } catch (err) {
      toast.dismiss();
      toast.error('Failed to save DPR template');
    }
  };

  const selectSheet = (sheetId: string) => {
    setSpreadsheetData({}); setLockedCells({}); setSelectedCell(null);
    setSelectedCells(new Set()); setMergedCells([]); setCellStyles({});
    setDragStart(null); setDragEnd(null); setIsDragging(false);
    setColumnWidths({}); setRowHeights({});
    setActiveSheetId(sheetId);
  };

  const getCellId = (row: number, col: number): string => {
    return String.fromCharCode(65 + col) + (row + 1);
  };

  const addRow = () => { setSpreadsheetRows(prev => prev + 1); toast.success('Row added'); };
  const removeRow = () => { if (spreadsheetRows > 1) { setSpreadsheetRows(prev => prev - 1); toast.success('Row removed'); } };
  const addColumn = () => { setSpreadsheetCols(prev => prev + 1); toast.success('Column added'); };
  const removeColumn = () => { if (spreadsheetCols > 1) { setSpreadsheetCols(prev => prev - 1); toast.success('Column removed'); } };

  // ── Cell double-click to edit ──
  const handleCellDoubleClick = (cellId: string) => {
    if (lockedCells[cellId]) { toast.error(`Cell ${cellId} is locked`); return; }
    setSelectedCell(cellId);
    setShowCellEditor(true);
  };

  const handleCellSave = async (cellId: string, value: string) => {
    if (!activeSheetId) return;
    const isFormula = value.trim().startsWith('=');
    setSpreadsheetData(prev => ({ ...prev, [cellId]: value }));
    setShowCellEditor(false); setSelectedCell(null);

    try {
      await api.post(`/sheets/${activeSheetId}/cells`, { cellId, value, dataType: isFormula ? 'FORMULA' : 'TEXT' });
      setTimeout(() => { if (activeSheetId) loadSheetData(activeSheetId); }, 500);
    } catch (error) {
      console.error('Failed to save cell:', error);
      toast.error('Failed to save cell');
    }

    const userName = localStorage.getItem('userName') || 'Admin';
    const userId = localStorage.getItem('userId') || 'admin';
    socketService.emitCellUpdate({ sheetId: activeSheetId, cellId, value, userId, userName });
  };

  const handleCloseEditor = () => { setShowCellEditor(false); setSelectedCell(null); };

  // ── Generate CEO Report ──
  const handleGenerateReport = async () => {
    if (!activeSheetId) return toast.error('No sheet selected');
    try {
      setGeneratingReport(true);
      const response = await api.post('/ceo-reports/generate', {
        sheetId: activeSheetId,
        title: reportTitle || `Report: ${activeSheet?.name || 'Sheet'}`,
        description: reportDescription || `Generated from sheet: ${activeSheet?.name || 'Unknown'}`,
      });
      if (response.data.success) {
        toast.success('Report generated and sent to CEO!');
        setShowReportDialog(false); setReportTitle(''); setReportDescription('');
      } else { toast.error(response.data.message || 'Failed to generate report'); }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to generate report');
    } finally { setGeneratingReport(false); }
  };

  // ── Push to Users/Roles ──
  const handlePushToUsers = async () => {
    if (!activeSheetId) return toast.error('No sheet selected');
    if (pushMode === 'users' && selectedUsers.length === 0) return toast.error('Select at least one user');
    if (pushMode === 'roles' && selectedRoles.length === 0) return toast.error('Select at least one role');

    try {
      toast.loading('Pushing sheet...');
      if (pushMode === 'users') {
        await api.post(`/sheets/${activeSheetId}/push-to-users`, { userIds: selectedUsers.map(u => u.id) });
        toast.dismiss(); toast.success(`Sheet pushed to ${selectedUsers.length} user(s)`);
      } else {
        const payload: any = { targetRoles: selectedRoles };
        // Add granular assignment data if not pushing whole sheet
        if (pushAssignmentType !== 'SHEET') {
          payload.assignmentType = pushAssignmentType;
          if (pushAssignmentType === 'ROW') payload.assignedRows = pushAssignedRows;
          if (pushAssignmentType === 'COLUMN') payload.assignedColumns = pushAssignedColumns;
          if (pushAssignmentType === 'CELL') {
            // Use drag selection if available, otherwise use manually entered cells
            const cells = pushAssignedCells.length > 0 ? pushAssignedCells : Array.from(selectedCells);
            payload.assignedCells = cells;
          }
        }
        await api.post(`/sheets/${activeSheetId}/push-to-roles`, payload);
        const detailMsg = pushAssignmentType === 'ROW'
          ? ` (rows: ${pushAssignedRows.join(', ')})`
          : pushAssignmentType === 'COLUMN'
          ? ` (columns: ${pushAssignedColumns.join(', ')})`
          : pushAssignmentType === 'CELL'
          ? ` (${pushAssignedCells.length} cells)`
          : ' (entire sheet)';
        toast.dismiss(); toast.success(`Sheet pushed to roles: ${selectedRoles.join(', ')}${detailMsg}`);
        // Emit real-time push notification
        socketService.emitSheetPushed({ sheetId: activeSheetId, roles: selectedRoles });
        socketService.emit('assignment-update', { sheetId: activeSheetId, targetRoles: selectedRoles });
      }
      setShowPushDialog(false); setSelectedUsers([]); setSelectedRoles([]);
      setPushAssignmentType('SHEET'); setPushAssignedRows([]); setPushAssignedColumns([]); setPushAssignedCells([]);
    } catch (error: any) {
      toast.dismiss(); toast.error(error.response?.data?.message || 'Failed to push sheet');
    }
  };

  const handleUserSelection = (userId: string) => {
    const user = availableUsers.find(u => u.id === userId);
    if (!user) return;
    setSelectedUsers(prev => {
      const exists = prev.find(u => u.id === userId);
      return exists ? prev.filter(u => u.id !== userId) : [...prev, user];
    });
  };

  const getRoleColor = (role: string): string => {
    const colors: { [key: string]: string } = {
      'L1_ADMIN': '#d32f2f', 'L2_SENIOR_ENGINEER': '#1976d2',
      'L3_JUNIOR_ENGINEER': '#388e3c', 'PROJECT_MANAGER': '#f57c00', 'GROUND_MANAGER': '#7b1fa2',
    };
    return colors[role] || '#757575';
  };

  const handleSaveAllStyles = async () => {
    await saveStructure();
    toast.success('All styles and structure saved!');
  };

  // ── Template Management ──
  const handleSaveTemplate = async () => {
    if (!activeSheetId || !templateName.trim()) {
      toast.error('Template name is required');
      return;
    }
    try {
      const response = await api.post('/templates', {
        name: templateName,
        description: templateDescription,
        category: templateCategory,
        sheetId: activeSheetId,
      });
      if (response.data.success) {
        toast.success(`Template "${templateName}" saved!`);
        setShowSaveTemplateDialog(false);
        setTemplateName(''); setTemplateDescription(''); setTemplateCategory('custom');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save template');
    }
  };

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const response = await api.get('/templates');
      if (response.data.success) {
        setSavedTemplates(response.data.templates);
        setShowLoadTemplateDialog(true);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load templates');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    if (!activeSheetId) return toast.error('No sheet selected');
    const confirmed = window.confirm('This will overwrite the current sheet with the template. Continue?');
    if (!confirmed) return;

    try {
      toast.loading('Applying template...');
      const response = await api.post(`/templates/${templateId}/apply`, { sheetId: activeSheetId });
      if (response.data.success) {
        toast.dismiss();
        toast.success(response.data.message);
        setShowLoadTemplateDialog(false);
        // Reload sheet data
        loadSheetData(activeSheetId);
      }
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.response?.data?.message || 'Failed to apply template');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.delete(`/templates/${templateId}`);
      toast.success('Template deleted');
      setSavedTemplates(prev => prev.filter(t => t.id !== templateId));
    } catch (error: any) {
      toast.error('Failed to delete template');
    }
  };

  // ── Inline Finance Management ──
  const loadFinanceRecords = async () => {
    try {
      setFinanceLoading(true);
      // Load records for the active sheet if one is selected
      const params = new URLSearchParams();
      if (activeSheetId) params.append('sheetId', activeSheetId);
      const response = await api.get(`/finance?${params.toString()}`);
      if (response.data.success) {
        setFinanceRecords(response.data.records);
      }
    } catch (error: any) {
      toast.error('Failed to load finance records');
    } finally {
      setFinanceLoading(false);
    }
  };

  const handleToggleFinance = () => {
    if (!showFinancePanel) {
      loadFinanceRecords();
    }
    setShowFinancePanel(!showFinancePanel);
  };

  const handleSaveFinanceRecord = async () => {
    try {
      const revenue = parseFloat(financeForm.revenue) || 0;
      const expenses = parseFloat(financeForm.expenses) || 0;
      const operationalCost = parseFloat(financeForm.operationalCost) || 0;
      const profit = revenue - expenses - operationalCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      // Link to current sheet's project and the sheet itself
      const projectId = activeSheet?.projectId || undefined;
      await api.post('/finance', {
        ...financeForm,
        revenue, expenses, operationalCost, profit, margin,
        projectId,
        sheetId: activeSheetId || undefined,
      });
      toast.success('Finance record added for this sheet');
      setShowFinanceForm(false);
      setFinanceForm({
        description: '', category: 'EXPENSE', amount: '', year: new Date().getFullYear(),
        quarter: Math.ceil((new Date().getMonth() + 1) / 3), revenue: '', expenses: '',
        operationalCost: '', notes: '',
      });
      loadFinanceRecords();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save finance record');
    }
  };

  const handleDeleteFinance = async (id: string) => {
    if (!window.confirm('Delete this finance record?')) return;
    try {
      await api.delete(`/finance/${id}`);
      toast.success('Record deleted');
      setFinanceRecords(prev => prev.filter(r => r.id !== id));
    } catch (error: any) {
      toast.error('Failed to delete record');
    }
  };

  // ── Unassign Sheet ──
  const loadAssignedUsers = async () => {
    if (!activeSheetId) return;
    try {
      setLoadingAssigned(true);
      const response = await api.get(`/sheets/${activeSheetId}/assigned-users`);
      if (response.data?.assignedUsers) {
        setAssignedUsers(response.data.assignedUsers);
      }
    } catch (error) {
      console.error('Failed to load assigned users:', error);
    } finally {
      setLoadingAssigned(false);
    }
  };

  // ── Load granular SheetAssignments ──
  const loadAssignments = async () => {
    if (!activeSheetId) return;
    try {
      setLoadingAssignments(true);
      const response = await api.get(`/sheets/${activeSheetId}/assignments`);
      if (response.data?.assignments) {
        setSheetAssignments(response.data.assignments);
      }
    } catch (error) {
      console.error('Failed to load assignments:', error);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const handleUnassignUser = async (userId: string) => {
    if (!activeSheetId) return;
    try {
      await api.post(`/sheets/${activeSheetId}/unassign`, { userIds: [userId] });
      toast.success('User unassigned from sheet');
      loadAssignedUsers();
      loadAssignments();
    } catch (error) {
      toast.error('Failed to unassign user');
    }
  };

  const handleUnassignRole = async (role: string) => {
    if (!activeSheetId) return;
    try {
      await api.post(`/sheets/${activeSheetId}/unassign`, { roles: [role] });
      toast.success(`Role ${authService.getRoleName(role)} unassigned from sheet`);
      loadAssignedUsers();
      loadAssignments();
    } catch (error) {
      toast.error('Failed to unassign role');
    }
  };

  // Remove specific rows/columns from an assignment
  const handleRemoveAssignmentItems = async (assignmentId: string, removeRows?: number[], removeColumns?: string[], removeCells?: string[]) => {
    if (!activeSheetId) return;
    try {
      await api.post(`/sheets/${activeSheetId}/assignments/${assignmentId}/remove-items`, {
        removeRows, removeColumns, removeCells,
      });
      toast.success('Assignment items removed');
      loadAssignments();
      // Emit real-time update
      socketService.emit('assignment-update', { sheetId: activeSheetId });
    } catch (error) {
      toast.error('Failed to update assignment');
    }
  };

  // Delete an entire assignment record
  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!activeSheetId) return;
    if (!window.confirm('Delete this entire assignment?')) return;
    try {
      await api.delete(`/sheets/${activeSheetId}/assignments/${assignmentId}`);
      toast.success('Assignment deleted');
      loadAssignments();
      socketService.emit('assignment-update', { sheetId: activeSheetId });
    } catch (error) {
      toast.error('Failed to delete assignment');
    }
  };

  const getColWidth = (col: number) => columnWidths[col] || (col === 1 ? 180 : 100);
  const getRowHeight = (row: number) => rowHeights[row] || 28;

  // ════════════════════════════════════════════════
  // SHEET SELECTOR VIEW (no sheet selected)
  // ════════════════════════════════════════════════
  if (!activeSheetId) {
    return (
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4">📊 Sheets Management</Typography>
          <IconButton onClick={loadSheetsList} title="Refresh"><RefreshIcon /></IconButton>
        </Box>

        {loadingSheets ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : allSheets.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">No sheets found</Typography>
            <Typography variant="body2" color="text.secondary">
              Create a project first, then add sheets from the Projects section.
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {allSheets.map((sheet) => (
              <Grid item xs={12} sm={6} md={4} key={sheet.id}>
                <Paper
                  sx={{
                    p: 2, cursor: 'pointer', transition: 'all 0.2s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
                    borderLeft: '4px solid #1976d2',
                  }}
                  onClick={() => selectSheet(sheet.id)}
                >
                  <Typography variant="h6">{sheet.name}</Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {sheet.description || 'No description'}
                  </Typography>
                  <Chip
                    label={sheet.status || 'ACTIVE'}
                    color={sheet.status === 'ACTIVE' ? 'success' : sheet.status === 'DRAFT' ? 'default' : 'info'}
                    size="small"
                  />
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    );
  }

  // ════════════════════════════════════════════════
  // SPREADSHEET EDITOR VIEW (DPR-style)
  // ════════════════════════════════════════════════
  return (
    <Box>
      {/* ── Header ── */}
      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <IconButton onClick={() => { setActiveSheetId(null); setActiveSheet(null); }}><BackIcon /></IconButton>
        <Typography variant="h4" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
          {activeSheet?.name || 'Sheet Editor'}
        </Typography>
        <IconButton onClick={() => { if (activeSheetId) loadSheetData(activeSheetId); }} title="Refresh"><RefreshIcon /></IconButton>
      </Box>

      {/* ── Stats Cards ── */}
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

      {/* ── Toolbar ── */}
      <Paper sx={{ p: 1.5, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setShowRowColControls(!showRowColControls)}>
            Rows/Cols
          </Button>
          <Divider orientation="vertical" flexItem />

          <Tooltip title="Bold"><IconButton size="small" onClick={() => applyStyleToSelection({ fontWeight: 'bold' })}><BoldIcon /></IconButton></Tooltip>
          <Tooltip title="Align Left"><IconButton size="small" onClick={() => applyStyleToSelection({ textAlign: 'left' })}><AlignLeftIcon /></IconButton></Tooltip>
          <Tooltip title="Align Center"><IconButton size="small" onClick={() => applyStyleToSelection({ textAlign: 'center' })}><AlignCenterIcon /></IconButton></Tooltip>
          <Tooltip title="Align Right"><IconButton size="small" onClick={() => applyStyleToSelection({ textAlign: 'right' })}><AlignRightIcon /></IconButton></Tooltip>

          <Tooltip title="Background Color">
            <IconButton size="small" onClick={(e) => { setColorPickerType('bg'); setColorPickerAnchor(e.currentTarget); }}><FillColorIcon /></IconButton>
          </Tooltip>
          <Tooltip title="Text Color">
            <IconButton size="small" onClick={(e) => { setColorPickerType('text'); setColorPickerAnchor(e.currentTarget); }}><TextColorIcon /></IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem />

          {/* Quick DPR Colors */}
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
          <Button size="small" variant="outlined" color="error" startIcon={<UnassignIcon />} onClick={() => { setShowUnassignDialog(true); loadAssignedUsers(); loadAssignments(); }}>Manage Assignments</Button>
          <Button size="small" variant="contained" color="info" startIcon={<AssessmentIcon />} onClick={() => setShowReportDialog(true)}>CEO Report</Button>
          <Button size="small" variant={showFinancePanel ? 'contained' : 'outlined'} color="success" onClick={handleToggleFinance}>💰 Finance</Button>
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

      {selectedCells.size > 1 && (
        <Alert severity="info" sx={{ mb: 1 }}>
          {selectedCells.size} cells selected — Right-click for options (merge, lock, color row/column)
        </Alert>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* SPREADSHEET GRID (DPR-Style with drag-select & resize) */}
      {/* ════════════════════════════════════════════════ */}
      <Paper sx={{ mb: 3, overflow: 'hidden' }}>
        <Box sx={{
          overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 420px)',
          userSelect: isDragging ? 'none' : 'auto',
          cursor: resizing ? (resizing.type === 'col' ? 'col-resize' : 'row-resize') : 'default',
        }}>
          <table ref={tableRef} style={{ borderCollapse: 'collapse', width: 'auto', minWidth: '100%' }}
            onMouseUp={handleMouseUp}>
            <thead>
              <tr>
                <th style={{
                  fontWeight: 'bold', backgroundColor: '#404040', color: '#fff', padding: '6px 8px',
                  textAlign: 'center', fontSize: '0.7rem', border: '1px solid #333',
                  minWidth: 36, position: 'sticky', left: 0, top: 0, zIndex: 3,
                }}>#</th>
                {Array.from({ length: spreadsheetCols }, (_, col) => (
                  <th key={col} style={{
                    fontWeight: 'bold', backgroundColor: '#404040', color: '#fff', padding: '6px 8px',
                    textAlign: 'center', fontSize: '0.7rem', border: '1px solid #333',
                    width: getColWidth(col), minWidth: getColWidth(col),
                    position: 'sticky', top: 0, zIndex: 2, userSelect: 'none', whiteSpace: 'nowrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      <span>{String.fromCharCode(65 + col)}</span>
                      {/* Column resize handle */}
                      <div
                        onMouseDown={(e) => handleResizeStart('col', col, e)}
                        style={{
                          position: 'absolute', right: -2, top: 0, bottom: 0, width: 5,
                          cursor: 'col-resize', zIndex: 10,
                        }}
                        title="Drag to resize column"
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: spreadsheetRows }, (_, row) => (
                <tr key={row} style={{ height: getRowHeight(row) }}>
                  <td style={{
                    fontWeight: 'bold', backgroundColor: '#404040', color: '#fff', padding: '4px 6px',
                    textAlign: 'center', fontSize: '0.7rem', border: '1px solid #333',
                    position: 'sticky', left: 0, zIndex: 1, userSelect: 'none',
                    height: getRowHeight(row),
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', height: '100%' }}>
                      <span>{row + 1}</span>
                      {/* Row resize handle */}
                      <div
                        onMouseDown={(e) => handleResizeStart('row', row, e)}
                        style={{
                          position: 'absolute', left: 0, right: 0, bottom: -2, height: 5,
                          cursor: 'row-resize', zIndex: 10,
                        }}
                        title="Drag to resize row"
                      />
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
                      <td
                        key={cellId}
                        rowSpan={mergeInfo.rowSpan}
                        colSpan={mergeInfo.colSpan}
                        onMouseDown={(e) => handleMouseDown(row, col, e)}
                        onMouseMove={() => handleMouseMove(row, col)}
                        onMouseUp={handleMouseUp}
                        onDoubleClick={() => handleCellDoubleClick(cellId)}
                        onContextMenu={(e) => handleContextMenu(row, col, e)}
                        style={{
                          padding: '4px 8px',
                          border: isSelected ? '2px solid #1976d2' : inDragSel ? '2px solid #1976d2' : '1px solid #c0c0c0',
                          backgroundColor: inDragSel
                            ? (style.backgroundColor ? `${style.backgroundColor}CC` : '#e3f2fd')
                            : style.backgroundColor || (isLocked ? '#fff3e0' : '#ffffff'),
                          color: style.color || '#333',
                          fontWeight: style.fontWeight || 'normal',
                          textAlign: (style.textAlign as any) || 'left',
                          fontSize: style.fontSize || '0.8rem',
                          cursor: isLocked ? 'not-allowed' : 'cell',
                          position: 'relative',
                          height: getRowHeight(row),
                          width: getColWidth(col),
                          minWidth: getColWidth(col),
                          verticalAlign: 'middle',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: getColWidth(col),
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
            💡 Drag to select cells • Right-click for merge/lock/color options • Double-click to edit • Drag column/row borders to resize
          </Typography>
          {mergedCells.length > 0 && (
            <Typography variant="caption" color="text.secondary">📐 {mergedCells.length} merged range(s)</Typography>
          )}
          {Object.keys(lockedCells).length > 0 && (
            <Typography variant="caption" color="text.secondary">🔒 {Object.keys(lockedCells).length} locked cell(s)</Typography>
          )}
        </Box>
      </Paper>

      {/* ═══ RIGHT-CLICK CONTEXT MENU ═══ */}
      {contextMenu.open && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
            minWidth: 220,
            py: 0.5,
            borderRadius: 1,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Merge / Unmerge */}
          {getMergeInfo(contextMenu.row, contextMenu.col).isMerged ? (
            <MenuItem onClick={handleUnmergeFromContext}>
              <UnmergeIcon sx={{ mr: 1.5, fontSize: 18 }} /> Unmerge Cells
            </MenuItem>
          ) : (
            <MenuItem onClick={handleMergeFromContext} disabled={selectedCells.size < 2}>
              <MergeIcon sx={{ mr: 1.5, fontSize: 18 }} /> Merge Selected Cells
            </MenuItem>
          )}

          <Divider sx={{ my: 0.5 }} />

          {/* Lock / Unlock */}
          {lockedCells[getCellId(contextMenu.row, contextMenu.col)] ? (
            <MenuItem onClick={() => handleLockFromContext(false)}>
              <LockOpenIcon sx={{ mr: 1.5, fontSize: 18, color: '#4caf50' }} /> Unlock Cell(s)
            </MenuItem>
          ) : (
            <MenuItem onClick={() => handleLockFromContext(true)}>
              <LockIcon sx={{ mr: 1.5, fontSize: 18, color: '#ff9800' }} /> Lock Cell(s)
            </MenuItem>
          )}

          <Divider sx={{ my: 0.5 }} />

          {/* Color Row */}
          <MenuItem onClick={() => setContextColorPicker({ open: true, type: 'row', target: contextMenu.row })}>
            <FillColorIcon sx={{ mr: 1.5, fontSize: 18, color: '#e91e63' }} /> Color Row {contextMenu.row + 1}
          </MenuItem>

          {/* Color Column */}
          <MenuItem onClick={() => setContextColorPicker({ open: true, type: 'column', target: contextMenu.col })}>
            <FillColorIcon sx={{ mr: 1.5, fontSize: 18, color: '#9c27b0' }} /> Color Column {String.fromCharCode(65 + contextMenu.col)}
          </MenuItem>

          {/* Color Selected Cells */}
          <MenuItem onClick={() => setContextColorPicker({ open: true, type: 'cell', target: 0 })}>
            <FillColorIcon sx={{ mr: 1.5, fontSize: 18, color: '#2196f3' }} /> Color Selected Cells
          </MenuItem>

          <Divider sx={{ my: 0.5 }} />

          {/* Edit Cell */}
          <MenuItem onClick={() => { handleCellDoubleClick(getCellId(contextMenu.row, contextMenu.col)); closeContextMenu(); }}>
            <Typography variant="body2" sx={{ ml: 4.5 }}>✏️ Edit Cell</Typography>
          </MenuItem>

          {/* Context Color Picker Sub-panel */}
          {contextColorPicker.open && (
            <Box sx={{ p: 1.5, borderTop: '1px solid #eee' }}>
              <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                {contextColorPicker.type === 'row' ? `Row ${contextColorPicker.target + 1} Color` :
                 contextColorPicker.type === 'column' ? `Column ${String.fromCharCode(65 + contextColorPicker.target)} Color` :
                 'Cell Color'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 200 }}>
                {COLOR_PALETTE.map((color) => (
                  <Box key={color}
                    onClick={() => {
                      if (contextColorPicker.type === 'row') handleColorRow(color);
                      else if (contextColorPicker.type === 'column') handleColorColumn(color);
                      else { applyStyleToSelection({ backgroundColor: color }); closeContextMenu(); }
                    }}
                    sx={{
                      width: 22, height: 22, borderRadius: '3px', bgcolor: color,
                      border: '1px solid #ccc', cursor: 'pointer',
                      '&:hover': { transform: 'scale(1.2)', boxShadow: 2 },
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {/* ═══ INLINE FINANCE PANEL ═══ */}
      {showFinancePanel && (
        <Paper sx={{ mt: 2, p: 2, border: '2px solid #4caf50' }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">💰 Finance Records</Typography>
            <Box display="flex" gap={1}>
              <Button size="small" variant="contained" color="success"
                onClick={() => setShowFinanceForm(!showFinanceForm)}>
                {showFinanceForm ? 'Cancel' : '+ Add Record'}
              </Button>
              <Button size="small" variant="outlined" onClick={loadFinanceRecords}>Refresh</Button>
            </Box>
          </Box>

          {showFinanceForm && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: '#f9fbe7' }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Description" value={financeForm.description}
                    onChange={(e) => setFinanceForm(prev => ({ ...prev, description: e.target.value }))} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Category</InputLabel>
                    <Select value={financeForm.category}
                      onChange={(e) => setFinanceForm(prev => ({ ...prev, category: e.target.value }))}>
                      <MenuItem value="EXPENSE">Expense</MenuItem>
                      <MenuItem value="REVENUE">Revenue</MenuItem>
                      <MenuItem value="OPERATIONAL">Operational</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" label="Revenue (₹)" type="number"
                    value={financeForm.revenue}
                    onChange={(e) => setFinanceForm(prev => ({ ...prev, revenue: e.target.value }))} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" label="Expenses (₹)" type="number"
                    value={financeForm.expenses}
                    onChange={(e) => setFinanceForm(prev => ({ ...prev, expenses: e.target.value }))} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" label="Operational Cost (₹)" type="number"
                    value={financeForm.operationalCost}
                    onChange={(e) => setFinanceForm(prev => ({ ...prev, operationalCost: e.target.value }))} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" label="Year" type="number"
                    value={financeForm.year}
                    onChange={(e) => setFinanceForm(prev => ({ ...prev, year: parseInt(e.target.value) }))} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Quarter</InputLabel>
                    <Select value={financeForm.quarter}
                      onChange={(e) => setFinanceForm(prev => ({ ...prev, quarter: e.target.value as number }))}>
                      <MenuItem value={1}>Q1</MenuItem>
                      <MenuItem value={2}>Q2</MenuItem>
                      <MenuItem value={3}>Q3</MenuItem>
                      <MenuItem value={4}>Q4</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Notes" value={financeForm.notes}
                    onChange={(e) => setFinanceForm(prev => ({ ...prev, notes: e.target.value }))} />
                </Grid>
                <Grid item xs={12} sm={2}>
                  <Button fullWidth variant="contained" color="success" onClick={handleSaveFinanceRecord}>
                    Save Record
                  </Button>
                </Grid>
              </Grid>
            </Paper>
          )}

          {financeLoading ? (
            <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
          ) : financeRecords.length === 0 ? (
            <Alert severity="info">No finance records yet. Click "+ Add Record" to create one.</Alert>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e8f5e9' }}>
                    {['Description', 'Category', 'Revenue', 'Expenses', 'Op. Cost', 'Profit', 'Margin', 'Year', 'Q', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px', border: '1px solid #c8e6c9', textAlign: 'center', fontWeight: 'bold' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {financeRecords.map((record: any) => (
                    <tr key={record.id} style={{ '&:hover': { bgcolor: '#f5f5f5' } } as any}>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0' }}>{record.description || '-'}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem',
                          backgroundColor: record.category === 'REVENUE' ? '#e8f5e9' : record.category === 'EXPENSE' ? '#fce4ec' : '#fff3e0',
                        }}>{record.category}</span>
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', textAlign: 'right', color: '#2e7d32' }}>
                        ₹{parseFloat(record.revenue || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', textAlign: 'right', color: '#c62828' }}>
                        ₹{parseFloat(record.expenses || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', textAlign: 'right' }}>
                        ₹{parseFloat(record.operationalCost || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', textAlign: 'right', fontWeight: 'bold',
                        color: parseFloat(record.profit || 0) >= 0 ? '#2e7d32' : '#c62828' }}>
                        ₹{parseFloat(record.profit || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        {parseFloat(record.margin || 0).toFixed(1)}%
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>{record.year}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>Q{record.quarter}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <IconButton size="small" color="error" onClick={() => handleDeleteFinance(record.id)} title="Delete">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          )}
        </Paper>
      )}

      {/* Click-away handler for context menu */}
      {contextMenu.open && (
        <Box
          sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }}
          onClick={closeContextMenu}
          onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}
        />
      )}

      {/* Color Picker Popover */}
      <Popover open={Boolean(colorPickerAnchor)} anchorEl={colorPickerAnchor}
        onClose={() => setColorPickerAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 2, width: 230 }}>
          <Typography variant="subtitle2" gutterBottom>
            {colorPickerType === 'bg' ? 'Background Color' : 'Text Color'}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {COLOR_PALETTE.map((color) => (
              <Box key={color} onClick={() => handleColorPick(color)}
                sx={{ width: 28, height: 28, borderRadius: '4px', bgcolor: color, border: '1px solid #ccc', cursor: 'pointer', '&:hover': { transform: 'scale(1.15)', boxShadow: 2 } }} />
            ))}
          </Box>
        </Box>
      </Popover>

      {/* Cell Editor Modal */}
      <CellEditorModal open={showCellEditor} cellId={selectedCell} sheetId={activeSheetId}
        currentValue={selectedCell ? (spreadsheetData[selectedCell] || '') : ''}
        onClose={handleCloseEditor} onSave={handleCellSave}
        onReload={() => { if (activeSheetId) loadSheetData(activeSheetId); }} />

      {/* Push Dialog */}
      <Dialog open={showPushDialog} onClose={() => setShowPushDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Push Sheet to Users or Roles</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>Select how you want to push this spreadsheet</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 2, mb: 3 }}>
            <Button variant={pushMode === 'users' ? 'contained' : 'outlined'} onClick={() => setPushMode('users')} fullWidth>Push to Specific Users</Button>
            <Button variant={pushMode === 'roles' ? 'contained' : 'outlined'} onClick={() => setPushMode('roles')} fullWidth>Push to Roles</Button>
          </Box>

          {pushMode === 'users' ? (
            <FormControl fullWidth>
              <InputLabel>Select Users</InputLabel>
              <Select multiple value={selectedUsers.map(u => u.id)}
                renderValue={() => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selectedUsers.map((user) => (
                      <Chip key={user.id} label={`${user.firstName} ${user.lastName}`} size="small" sx={{ bgcolor: getRoleColor(user.role), color: 'white' }} />
                    ))}
                  </Box>
                )}>
                {availableUsers.map((user) => (
                  <MenuItem key={user.id} value={user.id} onClick={() => handleUserSelection(user.id)}>
                    <Checkbox checked={selectedUsers.some(u => u.id === user.id)} />
                    <ListItemText primary={`${user.firstName} ${user.lastName}`} secondary={authService.getRoleName(user.role)} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Select Roles</InputLabel>
                <Select multiple value={selectedRoles} onChange={(e) => setSelectedRoles(e.target.value as string[])}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((role) => (
                        <Chip key={role} label={authService.getRoleName(role)} size="small" sx={{ bgcolor: getRoleColor(role), color: 'white' }} />
                      ))}
                    </Box>
                  )}>
                  {['L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER'].map((role) => (
                    <MenuItem key={role} value={role}>
                      <Checkbox checked={selectedRoles.includes(role)} />
                      <ListItemText primary={authService.getRoleName(role)} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* ─── ASSIGNMENT GRANULARITY ─── */}
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>📋 What to assign:</Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {(['SHEET', 'ROW', 'COLUMN', 'CELL'] as const).map(type => (
                  <Button
                    key={type}
                    variant={pushAssignmentType === type ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => setPushAssignmentType(type)}
                    color={pushAssignmentType === type ? 'primary' : 'inherit'}
                  >
                    {type === 'SHEET' ? '📄 Entire Sheet' : type === 'ROW' ? '↔️ Specific Rows' : type === 'COLUMN' ? '↕️ Specific Columns' : '🔲 Specific Cells'}
                  </Button>
                ))}
              </Box>

              {pushAssignmentType === 'ROW' && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Enter row numbers (1-based) that these roles can see and edit:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    {Array.from({ length: spreadsheetRows }, (_, i) => i + 1).map(rowNum => (
                      <Chip
                        key={rowNum}
                        label={`Row ${rowNum}`}
                        size="small"
                        variant={pushAssignedRows.includes(rowNum) ? 'filled' : 'outlined'}
                        color={pushAssignedRows.includes(rowNum) ? 'primary' : 'default'}
                        onClick={() => {
                          setPushAssignedRows(prev =>
                            prev.includes(rowNum) ? prev.filter(r => r !== rowNum) : [...prev, rowNum]
                          );
                        }}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Box>
                  {pushAssignedRows.length > 0 && (
                    <Typography variant="caption" color="primary">
                      Selected rows: {pushAssignedRows.sort((a, b) => a - b).join(', ')}
                    </Typography>
                  )}
                </Box>
              )}

              {pushAssignmentType === 'COLUMN' && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Select columns that these roles can see and edit:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    {Array.from({ length: spreadsheetCols }, (_, i) => String.fromCharCode(65 + i)).map(col => (
                      <Chip
                        key={col}
                        label={`Col ${col}`}
                        size="small"
                        variant={pushAssignedColumns.includes(col) ? 'filled' : 'outlined'}
                        color={pushAssignedColumns.includes(col) ? 'secondary' : 'default'}
                        onClick={() => {
                          setPushAssignedColumns(prev =>
                            prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
                          );
                        }}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Box>
                  {pushAssignedColumns.length > 0 && (
                    <Typography variant="caption" color="secondary">
                      Selected columns: {pushAssignedColumns.sort().join(', ')}
                    </Typography>
                  )}
                </Box>
              )}

              {pushAssignmentType === 'CELL' && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {selectedCells.size > 0
                      ? `Using your current drag selection: ${selectedCells.size} cell(s) selected`
                      : 'First drag-select cells on the sheet, then open this dialog. Or enter cell IDs manually:'}
                  </Typography>
                  {selectedCells.size > 0 ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                      {Array.from(selectedCells).slice(0, 50).map(cellId => (
                        <Chip key={cellId} label={cellId} size="small" color="info" variant="filled" />
                      ))}
                      {selectedCells.size > 50 && (
                        <Chip label={`+${selectedCells.size - 50} more`} size="small" variant="outlined" />
                      )}
                    </Box>
                  ) : (
                    <TextField
                      fullWidth size="small" placeholder="e.g. A1, B2, C3 (comma-separated)"
                      onChange={(e) => {
                        const cells = e.target.value.split(',').map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]+\d+$/.test(c));
                        setPushAssignedCells(cells);
                      }}
                    />
                  )}
                </Box>
              )}
            </>
          )}

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              {pushMode === 'users' ? `Selected ${selectedUsers.length} user(s).` : `Selected ${selectedRoles.length} role(s).`}
              {pushMode === 'roles' && pushAssignmentType !== 'SHEET' && (
                <> • Assignment: <strong>
                  {pushAssignmentType === 'ROW' ? `${pushAssignedRows.length} rows` :
                   pushAssignmentType === 'COLUMN' ? `${pushAssignedColumns.length} columns` :
                   pushAssignmentType === 'CELL' ? `${pushAssignedCells.length || selectedCells.size} cells` : 'entire sheet'}
                </strong></>
              )}
              {' '}Locked cells will remain read-only for all users.
              {pushMode === 'roles' && pushAssignmentType !== 'SHEET' && (
                <><br />⚠️ Users will ONLY see the assigned rows/columns/cells. Other areas will be hidden.</>
              )}
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPushDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            // If CELL mode and using drag selection, set pushAssignedCells first
            if (pushAssignmentType === 'CELL' && selectedCells.size > 0 && pushAssignedCells.length === 0) {
              setPushAssignedCells(Array.from(selectedCells));
            }
            handlePushToUsers();
          }}
            disabled={(pushMode === 'users' && selectedUsers.length === 0) || (pushMode === 'roles' && selectedRoles.length === 0)}
            startIcon={<SendIcon />}>
            {pushMode === 'users' ? `Push to ${selectedUsers.length} User(s)` : `Push to ${selectedRoles.length} Role(s)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ ASSIGNMENT MANAGER DIALOG ═══ */}
      <Dialog open={showUnassignDialog} onClose={() => setShowUnassignDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>📋 Assignment Manager</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            View, modify, and remove row/column/cell assignments. Users only see the cells assigned to them.
          </Typography>

          {/* ── Granular Assignments Section ── */}
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
            🎯 Row/Column/Cell Assignments
          </Typography>
          {loadingAssignments ? (
            <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
          ) : sheetAssignments.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              No granular assignments yet. Use the Push dialog to assign specific rows/columns to roles.
            </Alert>
          ) : (
            <Box sx={{ mb: 2 }}>
              {sheetAssignments.map((assignment: any) => (
                <Paper key={assignment.id} sx={{ p: 2, mb: 1.5, border: '1px solid #e0e0e0' }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={authService.getRoleName(assignment.assignedRole || 'Unknown')}
                        sx={{ bgcolor: getRoleColor(assignment.assignedRole || ''), color: 'white' }}
                        size="small"
                      />
                      <Chip label={assignment.assignmentType || 'SHEET'} size="small" variant="outlined"
                        color={assignment.assignmentType === 'ROW' ? 'primary' : assignment.assignmentType === 'COLUMN' ? 'secondary' : 'default'} />
                      <Chip label={assignment.status || 'PENDING'} size="small"
                        color={assignment.status === 'PENDING' ? 'warning' : assignment.status === 'IN_PROGRESS' ? 'info' : 'success'} />
                    </Box>
                    <IconButton size="small" color="error" onClick={() => handleDeleteAssignment(assignment.id)} title="Delete entire assignment">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  {/* Show assigned rows with individual remove buttons */}
                  {assignment.assignedRows && assignment.assignedRows.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" fontWeight="bold" color="text.secondary">Assigned Rows:</Typography>
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                        {assignment.assignedRows.map((row: number) => (
                          <Chip
                            key={`row-${row}`}
                            label={`Row ${row}`}
                            size="small"
                            variant="outlined"
                            color="primary"
                            onDelete={() => handleRemoveAssignmentItems(assignment.id, [row], undefined, undefined)}
                            sx={{ '& .MuiChip-deleteIcon': { fontSize: 16 } }}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Show assigned columns with individual remove buttons */}
                  {assignment.assignedColumns && assignment.assignedColumns.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" fontWeight="bold" color="text.secondary">Assigned Columns:</Typography>
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                        {assignment.assignedColumns.map((col: string) => (
                          <Chip
                            key={`col-${col}`}
                            label={`Col ${col}`}
                            size="small"
                            variant="outlined"
                            color="secondary"
                            onDelete={() => handleRemoveAssignmentItems(assignment.id, undefined, [col], undefined)}
                            sx={{ '& .MuiChip-deleteIcon': { fontSize: 16 } }}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Show assigned cells with individual remove buttons */}
                  {assignment.assignedCells && assignment.assignedCells.length > 0 && (
                    <Box>
                      <Typography variant="caption" fontWeight="bold" color="text.secondary">Assigned Cells:</Typography>
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                        {assignment.assignedCells.map((cell: string) => (
                          <Chip
                            key={`cell-${cell}`}
                            label={cell}
                            size="small"
                            variant="outlined"
                            onDelete={() => handleRemoveAssignmentItems(assignment.id, undefined, undefined, [cell])}
                            sx={{ '& .MuiChip-deleteIcon': { fontSize: 16 } }}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {assignment.assignmentType === 'SHEET' && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      Full sheet access (all rows and columns)
                    </Typography>
                  )}

                  {assignment.user && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      👤 {assignment.user.firstName} {assignment.user.lastName} ({assignment.user.email})
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    📅 Assigned: {new Date(assignment.assignedAt).toLocaleDateString()}
                  </Typography>
                </Paper>
              ))}
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {/* ── User-level Unassign Section ── */}
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
            👥 Assigned Users
          </Typography>
          {loadingAssigned ? (
            <Box display="flex" justifyContent="center" py={3}><CircularProgress /></Box>
          ) : assignedUsers.length === 0 ? (
            <Alert severity="info" sx={{ mt: 1 }}>No users are currently assigned to this sheet.</Alert>
          ) : (
            <>
              {(['L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER'] as string[]).map(role => {
                const usersInRole = assignedUsers.filter(u => u.role === role);
                if (usersInRole.length === 0) return null;
                return (
                  <Box key={role} sx={{ mt: 1.5 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Chip label={authService.getRoleName(role)} sx={{ bgcolor: getRoleColor(role), color: 'white' }} size="small" />
                      <Button size="small" color="error" variant="outlined"
                        onClick={() => handleUnassignRole(role)}
                        startIcon={<DeleteIcon />}>
                        Unassign All
                      </Button>
                    </Box>
                    <List dense>
                      {usersInRole.map(user => (
                        <ListItem key={user.id} divider>
                          <ListItemText
                            primary={`${user.firstName} ${user.lastName}`}
                            secondary={`${user.email} • Status: ${user.status} • Assigned: ${new Date(user.assignedAt).toLocaleDateString()}`}
                          />
                          <ListItemSecondaryAction>
                            <IconButton edge="end" color="error" onClick={() => handleUnassignUser(user.id)} title="Unassign this user">
                              <UnassignIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                );
              })}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowUnassignDialog(false)} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>

      {/* CEO Report Dialog */}
      <Dialog open={showReportDialog} onClose={() => setShowReportDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>📊 Generate Report for CEO</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Generate an Excel-downloadable report from <strong>{activeSheet?.name || 'sheet'}</strong>.
          </Alert>
          <TextField label="Report Title" fullWidth value={reportTitle} onChange={(e) => setReportTitle(e.target.value)}
            placeholder={`Report: ${activeSheet?.name || 'Sheet'}`} sx={{ mb: 2, mt: 1 }} />
          <TextField label="Description (optional)" fullWidth multiline rows={3} value={reportDescription}
            onChange={(e) => setReportDescription(e.target.value)} placeholder="Brief description..." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowReportDialog(false)} disabled={generatingReport}>Cancel</Button>
          <Button variant="contained" color="info" onClick={handleGenerateReport} disabled={generatingReport}
            startIcon={generatingReport ? <CircularProgress size={20} /> : <AssessmentIcon />}>
            {generatingReport ? 'Generating...' : 'Generate & Send to CEO'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ SAVE TEMPLATE DIALOG ═══ */}
      <Dialog open={showSaveTemplateDialog} onClose={() => setShowSaveTemplateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>💾 Save Sheet as Template</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Save the current sheet layout, styles, and data as a reusable template for future projects.
          </Alert>
          <TextField fullWidth label="Template Name" value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. DPR Tunnel Progress" sx={{ mb: 2, mt: 1 }} />
          <TextField fullWidth label="Description (optional)" multiline rows={2}
            value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)}
            placeholder="Brief description of this template..." sx={{ mb: 2 }} />
          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select value={templateCategory} onChange={(e) => setTemplateCategory(e.target.value)}>
              <MenuItem value="dpr">DPR (Daily Progress Report)</MenuItem>
              <MenuItem value="finance">Finance / Budget</MenuItem>
              <MenuItem value="progress">Progress Tracking</MenuItem>
              <MenuItem value="custom">Custom</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSaveTemplateDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTemplate} disabled={!templateName.trim()}
            startIcon={<SaveIcon />}>Save Template</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ LOAD TEMPLATE DIALOG ═══ */}
      <Dialog open={showLoadTemplateDialog} onClose={() => setShowLoadTemplateDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>📂 Load Template</DialogTitle>
        <DialogContent>
          {loadingTemplates ? (
            <Box display="flex" justifyContent="center" py={3}><CircularProgress /></Box>
          ) : savedTemplates.length === 0 ? (
            <Alert severity="info" sx={{ mt: 1 }}>
              No saved templates yet. Create a sheet and click "Save Template" to save it.
            </Alert>
          ) : (
            <List>
              {savedTemplates.map(template => (
                <ListItem key={template.id} divider sx={{ '&:hover': { bgcolor: '#f5f5f5' } }}>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="subtitle1" fontWeight="bold">{template.name}</Typography>
                        <Chip label={template.category} size="small" variant="outlined"
                          color={template.category === 'dpr' ? 'warning' : template.category === 'finance' ? 'success' : 'default'} />
                      </Box>
                    }
                    secondary={
                      <>
                        {template.description && <Typography variant="body2" color="text.secondary">{template.description}</Typography>}
                        <Typography variant="caption" color="text.secondary">
                          Created: {new Date(template.createdAt).toLocaleDateString()}
                        </Typography>
                      </>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Button size="small" variant="contained" color="primary"
                      onClick={() => handleApplyTemplate(template.id)} sx={{ mr: 1 }}>
                      Apply
                    </Button>
                    <IconButton edge="end" color="error" onClick={() => handleDeleteTemplate(template.id)} title="Delete template">
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLoadTemplateDialog(false)} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={notification.open} autoHideDuration={6000}
        onClose={() => setNotification(prev => ({ ...prev, open: false }))}>
        <Alert severity={notification.severity} onClose={() => setNotification(prev => ({ ...prev, open: false }))}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SheetsManagement;
