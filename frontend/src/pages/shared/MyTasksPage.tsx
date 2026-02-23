// ================================================================
// MY TASKS PAGE (pages/shared/MyTasksPage.tsx)
// ================================================================
// PURPOSE: Shows pending assignments/tasks for the current user.
//
// FEATURES:
//   - List of assigned tasks with status (pending/done)
//   - Filter by status, project, due date
//   - Click to open the related sheet
//   - Submit responses to Q&A assignments
//
// DATA: Calls GET /api/user-sheets/my-sheets
// ROLE ACCESS: All roles except CEO
// USED BY: Sidebar navigation → "My Tasks"
// ================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  TextField,
  Grid,
  Chip,
  Alert,
  Snackbar,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Badge,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Assignment as TaskIcon,
  Send as SendIcon,
  Refresh as RefreshIcon,
  CheckCircle as DoneIcon,
  Pending as PendingIcon,
  ArrowBack as BackIcon,
  Notifications as NotifIcon,
  OpenInNew as OpenIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { assignmentsAPI, Assignment, AppNotification } from '../../services/assignmentsAPI';
import { sheetsAPI } from '../../services/sheetsAPI';
import { authService } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';

// ============================================================
// Excel-like Mini Spreadsheet for Task View
// Shows the assigned area as a proper grid with column headers (A, B, C...)
// and row numbers. Locked cells are visible with a lock icon but not editable.
// ============================================================
interface ExcelMiniGridProps {
  task: Assignment;
  lockedCells: Set<string>;
  responseValues: Record<string, string>;
  onValueChange: (cellId: string, value: string) => void;
}

const ExcelMiniGrid: React.FC<ExcelMiniGridProps> = ({ task, lockedCells, responseValues, onValueChange }) => {
  // Determine which rows and columns to show based on assignment type
  // PRIVACY: Only show the assigned rows/columns — not the full sheet
  const gridInfo = useMemo(() => {
    const sheetStructure = task.sheet?.structure;
    const taskRows = sheetStructure?.rows || 10;
    const taskCols = sheetStructure?.cols || 8;

    let rowNumbers: number[] = [];
    let colLetters: string[] = [];

    if (task.assignmentType === 'ROW' && task.assignedRows?.length) {
      rowNumbers = [...task.assignedRows].sort((a, b) => a - b);
      // PRIVACY: Only show assigned columns if specified, otherwise show all columns for the assigned rows
      if (task.assignedColumns?.length) {
        colLetters = [...task.assignedColumns].sort();
      } else {
        colLetters = Array.from({ length: taskCols }, (_, i) => String.fromCharCode(65 + i));
      }
    } else if (task.assignmentType === 'COLUMN' && task.assignedColumns?.length) {
      colLetters = [...task.assignedColumns].sort();
      // PRIVACY: Only show assigned rows if specified, otherwise show all rows for the assigned columns
      if (task.assignedRows?.length) {
        rowNumbers = [...task.assignedRows].sort((a, b) => a - b);
      } else {
        rowNumbers = Array.from({ length: taskRows }, (_, i) => i + 1);
      }
    } else if (task.assignmentType === 'CELL' && task.assignedCells?.length) {
      // Parse cells to determine range — only show cells that are assigned
      const allRows = new Set<number>();
      const allCols = new Set<string>();
      task.assignedCells.forEach(cid => {
        const m = cid.match(/^([A-Z]+)(\d+)$/);
        if (m) { allCols.add(m[1]); allRows.add(parseInt(m[2])); }
      });
      rowNumbers = Array.from(allRows).sort((a, b) => a - b);
      colLetters = Array.from(allCols).sort();
    } else {
      // SHEET — show everything (but cap at 20 rows for performance)
      const maxDisplay = Math.min(taskRows, 20);
      rowNumbers = Array.from({ length: maxDisplay }, (_, i) => i + 1);
      colLetters = Array.from({ length: taskCols }, (_, i) => String.fromCharCode(65 + i));
    }

    return { rowNumbers, colLetters };
  }, [task]);

  // Build a set of editable cell IDs for this assignment
  const editableCellIds = useMemo(() => {
    const sheetStructure = task.sheet?.structure;
    const taskRows = sheetStructure?.rows || 10;
    const taskCols = sheetStructure?.cols || 8;
    const s = new Set<string>();

    if (task.assignmentType === 'ROW' && task.assignedRows?.length) {
      task.assignedRows.forEach(rowNum => {
        for (let c = 0; c < taskCols; c++) {
          s.add(String.fromCharCode(65 + c) + rowNum);
        }
      });
    } else if (task.assignmentType === 'COLUMN' && task.assignedColumns?.length) {
      task.assignedColumns.forEach(col => {
        for (let r = 1; r <= taskRows; r++) {
          s.add(col + r);
        }
      });
    } else if (task.assignmentType === 'CELL' && task.assignedCells?.length) {
      task.assignedCells.forEach(c => s.add(c));
    } else {
      for (let r = 1; r <= taskRows; r++) {
        for (let c = 0; c < taskCols; c++) {
          s.add(String.fromCharCode(65 + c) + r);
        }
      }
    }
    return s;
  }, [task]);

  const getCellValue = (cellId: string): string => {
    if (responseValues[cellId] !== undefined) return responseValues[cellId];
    const existing = task.cellData?.find(cd => cd.cellId === cellId);
    return existing?.value || '';
  };

  const { rowNumbers, colLetters } = gridInfo;

  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        maxHeight: 360,
        overflow: 'auto',
        border: '2px solid #e0e0e0',
        borderRadius: 1,
      }}
    >
      <Table size="small" stickyHeader sx={{ minWidth: colLetters.length * 100 + 60 }}>
        <TableHead>
          <TableRow>
            {/* Row number header */}
            <TableCell
              sx={{
                minWidth: 50,
                maxWidth: 50,
                bgcolor: '#f5f5f5',
                fontWeight: 'bold',
                borderRight: '2px solid #ccc',
                borderBottom: '2px solid #ccc',
                position: 'sticky',
                left: 0,
                zIndex: 3,
                textAlign: 'center',
              }}
            >
              #
            </TableCell>
            {/* Column headers — A, B, C, etc. */}
            {colLetters.map(letter => (
              <TableCell
                key={letter}
                align="center"
                sx={{
                  minWidth: 100,
                  fontWeight: 'bold',
                  bgcolor: '#e3f2fd',
                  borderBottom: '2px solid #ccc',
                  color: '#1565c0',
                  fontSize: '0.85rem',
                }}
              >
                {letter}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rowNumbers.map(rowNum => (
            <TableRow key={rowNum}>
              {/* Row number */}
              <TableCell
                sx={{
                  bgcolor: '#f5f5f5',
                  fontWeight: 'bold',
                  borderRight: '2px solid #ccc',
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  textAlign: 'center',
                  fontSize: '0.85rem',
                  color: '#1565c0',
                }}
              >
                {rowNum}
              </TableCell>
              {colLetters.map(letter => {
                const cellId = letter + rowNum;
                const isLocked = lockedCells.has(cellId);
                const isEditable = editableCellIds.has(cellId) && !isLocked;
                const currentValue = getCellValue(cellId);

                return (
                  <TableCell
                    key={cellId}
                    sx={{
                      p: 0,
                      border: '1px solid #e0e0e0',
                      minWidth: 100,
                      position: 'relative',
                      bgcolor: isLocked
                        ? 'rgba(244, 67, 54, 0.06)'
                        : isEditable
                          ? '#fff'
                          : 'rgba(0,0,0,0.03)',
                    }}
                  >
                    {isLocked && (
                      <Tooltip title="This cell is locked by the admin — read only">
                        <LockIcon
                          sx={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            fontSize: 13,
                            color: 'error.main',
                            opacity: 0.6,
                            zIndex: 1,
                          }}
                        />
                      </Tooltip>
                    )}
                    {isEditable ? (
                      <TextField
                        fullWidth
                        variant="standard"
                        InputProps={{
                          disableUnderline: true,
                          sx: { px: 0.75, py: 0.4, fontSize: '0.825rem' },
                        }}
                        value={currentValue}
                        onChange={(e) => onValueChange(cellId, e.target.value)}
                        placeholder="..."
                      />
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{
                          px: 0.75,
                          py: 0.5,
                          fontSize: '0.825rem',
                          color: isLocked ? 'text.secondary' : 'text.disabled',
                          minHeight: 28,
                          display: 'flex',
                          alignItems: 'center',
                          fontStyle: isLocked && currentValue ? 'normal' : 'italic',
                        }}
                      >
                        {currentValue || (isLocked ? '—' : '')}
                      </Typography>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

// ============================================================
// Main Component — My Tasks Page
// Shows all tasks assigned to the current user with:
//   - Excel-like mini grids for each task
//   - Submit button per task
//   - Notification tab
// ============================================================
const MyTasksPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();              // Current logged-in user
  const { socket } = useSocket();          // Real-time updates

  const [tasks, setTasks] = useState<Assignment[]>([]);                  // All my assigned tasks
  const [notifications, setNotifications] = useState<AppNotification[]>([]); // My notifications
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);                         // Tasks tab vs Notifications tab
  const [responseValues, setResponseValues] = useState<Record<string, Record<string, string>>>({}); // taskId → { cellId → value }
  const [responseNotes, setResponseNotes] = useState<Record<string, string>>({}); // taskId → notes text
  const [submitting, setSubmitting] = useState<string | null>(null);     // Which task is being submitted
  // Locked cells per sheet — { sheetId: Set<cellId> }
  const [lockedCellsMap, setLockedCellsMap] = useState<Record<string, Set<string>>>({});

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'info'
  });

  // Fetch all tasks and notifications, plus locked cells for each sheet
  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksData, notifsData] = await Promise.all([
        assignmentsAPI.getMyTasks(),
        assignmentsAPI.getNotifications(),
      ]);
      const loadedTasks = tasksData.tasks || [];
      setTasks(loadedTasks);
      setNotifications(notifsData.notifications || []);
      setUnreadCount(notifsData.unreadCount || 0);

      // Load locked cells for each unique sheet
      const sheetIds = Array.from(new Set(loadedTasks.map((t: Assignment) => t.sheetId).filter(Boolean))) as string[];
      const lcMap: Record<string, Set<string>> = {};
      await Promise.all(sheetIds.map(async (sid) => {
        try {
          const data = await sheetsAPI.getLockedCells(sid);
          const s = new Set<string>();
          (data.lockedCells || []).forEach((lc: any) => s.add(lc.cellId));
          lcMap[sid] = s;
        } catch { lcMap[sid] = new Set(); }
      }));
      setLockedCellsMap(lcMap);
    } catch (err: any) {
      console.error('Failed to load tasks:', err);
      setSnack({ open: true, message: 'Failed to load tasks', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Listen for new task assignments via socket
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      loadData();
      setSnack({ open: true, message: 'New task assigned to you!', severity: 'info' });
    };
    socket.on('task_assigned', handler);
    return () => { socket.off('task_assigned', handler); };
  }, [socket]);

  // Get cells that the user should fill for a task
  const getEditableCells = (task: Assignment): string[] => {
    const sheetStructure = task.sheet?.structure;
    const taskRows = sheetStructure?.rows || 10;
    const taskCols = sheetStructure?.cols || 8;

    if (task.assignmentType === 'ROW' && task.assignedRows?.length) {
      const cells: string[] = [];
      task.assignedRows.forEach(rowNum => {
        for (let c = 0; c < taskCols; c++) {
          cells.push(String.fromCharCode(65 + c) + rowNum);
        }
      });
      return cells;
    }
    if (task.assignmentType === 'COLUMN' && task.assignedColumns?.length) {
      const cells: string[] = [];
      task.assignedColumns.forEach(col => {
        for (let r = 1; r <= taskRows; r++) {
          cells.push(col + r);
        }
      });
      return cells;
    }
    if (task.assignmentType === 'CELL' && task.assignedCells?.length) {
      return task.assignedCells;
    }
    // SHEET assignment — all cells
    const cells: string[] = [];
    for (let r = 1; r <= taskRows; r++) {
      for (let c = 0; c < taskCols; c++) {
        cells.push(String.fromCharCode(65 + c) + r);
      }
    }
    return cells;
  };

  const handleValueChange = (taskId: string, cellId: string, value: string) => {
    setResponseValues(prev => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), [cellId]: value },
    }));
  };

  const handleSubmitResponse = async (task: Assignment) => {
    try {
      setSubmitting(task.id);
      const vals = responseValues[task.id] || {};

      // Include current cell data values as defaults for cells user didn't modify
      const editableCells = getEditableCells(task);
      const allValues: Record<string, string> = {};
      editableCells.forEach(cellId => {
        if (vals[cellId] !== undefined) {
          allValues[cellId] = vals[cellId];
        } else {
          const existing = task.cellData?.find(cd => cd.cellId === cellId);
          if (existing?.value) allValues[cellId] = existing.value;
        }
      });

      // Only send cells that have values
      const toSend: Record<string, string> = {};
      Object.entries(allValues).forEach(([k, v]) => {
        if (v && v.trim()) toSend[k] = v;
      });

      if (Object.keys(toSend).length === 0) {
        setSnack({ open: true, message: 'Please fill in at least one cell before submitting', severity: 'error' });
        setSubmitting(null);
        return;
      }

      await assignmentsAPI.submitResponse(task.id, toSend, responseNotes[task.id]);
      setSnack({ open: true, message: 'Response submitted! Values have been filled into the admin\'s sheet.', severity: 'success' });
      await loadData();
    } catch (err: any) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to submit response', severity: 'error' });
    } finally {
      setSubmitting(null);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await assignmentsAPI.markNotificationsRead('all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch { /* ignore */ }
  };

  const pendingTasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
  const submittedTasks = tasks.filter(t => t.status === 'SUBMITTED' || t.status === 'APPROVED' || t.status === 'REJECTED');

  const getPriorityColor = (p: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (p) {
      case 'URGENT': return 'error';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'primary';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading your tasks...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={() => navigate(-1)}>
            <BackIcon />
          </IconButton>
          <TaskIcon color="primary" fontSize="large" />
          <Box>
            <Typography variant="h5">My Tasks</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.firstName} {user?.lastName} • {authService.getRoleName(user?.role || '')}
            </Typography>
          </Box>
        </Box>
        <Box display="flex" gap={1}>
          <Tooltip title={`${unreadCount} unread notifications`}>
            <IconButton onClick={handleMarkAllRead}>
              <Badge badgeContent={unreadCount} color="error">
                <NotifIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          <IconButton onClick={loadData}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light' }}>
            <Typography variant="h4">{pendingTasks.length}</Typography>
            <Typography variant="body2">Pending</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
            <Typography variant="h4">{submittedTasks.filter(t => t.status === 'SUBMITTED').length}</Typography>
            <Typography variant="body2">Submitted</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light' }}>
            <Typography variant="h4">{submittedTasks.filter(t => t.status === 'APPROVED').length}</Typography>
            <Typography variant="body2">Approved</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.200' }}>
            <Typography variant="h4">{tasks.length}</Typography>
            <Typography variant="body2">Total</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Pending Tasks (${pendingTasks.length})`} />
        <Tab label={`Completed (${submittedTasks.length})`} />
        <Tab label={`Notifications (${unreadCount})`} />
      </Tabs>

      {/* Tab 0: Pending Tasks */}
      {activeTab === 0 && (
        <Box>
          {pendingTasks.length === 0 ? (
            <Alert severity="success" sx={{ mt: 2 }}>No pending tasks. You're all caught up!</Alert>
          ) : (
            pendingTasks.map(task => (
              <Card key={task.id} sx={{ mb: 2, border: task.priority === 'URGENT' ? '2px solid red' : '1px solid #e0e0e0' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="h6">{task.sheet?.name || 'Sheet'}</Typography>
                      <Chip label={task.assignmentType} size="small" variant="outlined" />
                      <Chip label={task.priority} size="small" color={getPriorityColor(task.priority)} />
                      <Chip label={task.status} size="small" color="warning" />
                    </Box>
                    <Tooltip title="Open sheet in full view">
                      <IconButton size="small" onClick={() => navigate(`/sheet/${task.sheetId}`)}>
                        <OpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Project: {task.sheet?.project?.name || 'N/A'} • Assigned by: {task.assignedBy?.firstName} {task.assignedBy?.lastName}
                    {' • '}{new Date(task.assignedAt).toLocaleString()}
                  </Typography>

                  {task.question && (
                    <Alert severity="info" sx={{ my: 1 }}>
                      <Typography variant="subtitle2">Instructions:</Typography>
                      {task.question}
                    </Alert>
                  )}

                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                    {task.assignmentType === 'ROW' && `Fill in Row(s): ${task.assignedRows?.join(', ')}`}
                    {task.assignmentType === 'COLUMN' && `Fill in Column(s): ${task.assignedColumns?.join(', ')}`}
                    {task.assignmentType === 'CELL' && `Fill in Cell(s): ${task.assignedCells?.join(', ')}`}
                    {task.assignmentType === 'SHEET' && 'Fill in the entire sheet'}
                  </Typography>

                  {/* Excel-like mini spreadsheet */}
                  <ExcelMiniGrid
                    task={task}
                    lockedCells={lockedCellsMap[task.sheetId] || new Set()}
                    responseValues={responseValues[task.id] || {}}
                    onValueChange={(cellId, value) => handleValueChange(task.id, cellId, value)}
                  />

                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="Notes (optional)"
                    placeholder="Add any notes about your response..."
                    value={responseNotes[task.id] || ''}
                    onChange={(e) => setResponseNotes(prev => ({ ...prev, [task.id]: e.target.value }))}
                    sx={{ mt: 2 }}
                  />
                </CardContent>
                <CardActions sx={{ px: 2, pb: 2 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={submitting === task.id ? <CircularProgress size={16} /> : <SendIcon />}
                    onClick={() => handleSubmitResponse(task)}
                    disabled={submitting === task.id}
                  >
                    {submitting === task.id ? 'Submitting...' : 'Submit Response'}
                  </Button>
                </CardActions>
              </Card>
            ))
          )}
        </Box>
      )}

      {/* Tab 1: Completed Tasks */}
      {activeTab === 1 && (
        <Box>
          {submittedTasks.length === 0 ? (
            <Alert severity="info">No submitted tasks yet.</Alert>
          ) : (
            submittedTasks.map(task => (
              <Card key={task.id} sx={{ mb: 2 }}>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    {task.status === 'APPROVED' ? <DoneIcon color="success" /> : task.status === 'REJECTED' ? <DoneIcon color="error" /> : <PendingIcon color="info" />}
                    <Typography variant="h6">{task.sheet?.name || 'Sheet'}</Typography>
                    <Chip label={task.status} size="small" color={
                      task.status === 'APPROVED' ? 'success' : task.status === 'REJECTED' ? 'error' : 'info'
                    } />
                    <Chip label={task.assignmentType} size="small" variant="outlined" />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Submitted: {task.respondedAt ? new Date(task.respondedAt).toLocaleString() : 'N/A'}
                    {' • '}Cells filled: {task.response ? Object.keys(task.response.values || {}).length : 0}
                  </Typography>
                  {task.question && (
                    <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>Q: {task.question}</Typography>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </Box>
      )}

      {/* Tab 2: Notifications */}
      {activeTab === 2 && (
        <Box>
          {notifications.length === 0 ? (
            <Alert severity="info">No notifications.</Alert>
          ) : (
            <>
              {unreadCount > 0 && (
                <Button size="small" onClick={handleMarkAllRead} sx={{ mb: 1 }}>
                  Mark all as read
                </Button>
              )}
              {notifications.map(n => (
                <Paper
                  key={n.id}
                  sx={{
                    p: 2,
                    mb: 1,
                    bgcolor: n.isRead ? 'inherit' : 'action.hover',
                    borderLeft: n.isRead ? 'none' : '4px solid #1976d2',
                  }}
                >
                  <Typography variant="subtitle2">{n.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{n.message}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(n.createdAt).toLocaleString()} • {n.priority}
                  </Typography>
                </Paper>
              ))}
            </>
          )}
        </Box>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack(prev => ({ ...prev, open: false }))}
      >
        <Alert severity={snack.severity} onClose={() => setSnack(prev => ({ ...prev, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MyTasksPage;
