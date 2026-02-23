// ================================================================
// PROJECT DETAILS PAGE (pages/shared/ProjectDetailsPage.tsx)
// ================================================================
// PURPOSE: Shows details for a single project + its sheets.
//
// DISPLAYS:
//   - Project name, description, status, dates
//   - Team members list
//   - List of sheets in this project (click to open)
//   - Project statistics (completion %, active sheets)
//   - Full sheet operations: push with ROW/COLUMN/CELL granularity
//   - Assignment management: view, remove rows/cols/cells, delete assignments
//
// ROUTE: /projects/:projectId
// DATA: Calls GET /api/projects/:id
// ROLE ACCESS: All users with access to the project
// ================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Grid, Button, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText,
  Alert, CircularProgress, Divider, Card, CardContent,
  Accordion, AccordionSummary, AccordionDetails, Tooltip, Tabs, Tab,
  LinearProgress
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
  OpenInNew as OpenIcon,
  People as PeopleIcon,
  TableChart as SheetIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  Assignment as AssignmentIcon,
  Close as CloseIcon,
  ViewColumn as ColumnIcon,
  TableRows as RowIcon,
  GridOn as CellIcon
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { authService } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import socketService from '../../services/socketService';

// ─── TYPE: Full project data from the server ───
interface ProjectData {
  id: string;
  name: string;
  description?: string;
  location?: string;
  status: string;
  priority: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  progressPercentage: number;
  creator?: { id: string; firstName: string; lastName: string; email: string };
  sheets?: SheetData[];
}

// ─── TYPE: A sheet inside the project ───
interface SheetData {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  structure?: { rows?: number; cols?: number; columns?: any[] };
  creator?: { id: string; firstName: string; lastName: string };
}

// ─── TYPE: A user that can be assigned to sheets ───
interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

// ─── TYPE: Sheet assignment record ───
interface SheetAssignment {
  id: string;
  sheetId: string;
  userId?: string;
  assignedRole?: string;
  type?: string;
  status?: string;
  rows?: number[];
  columns?: string[];
  cells?: string[];
  question?: string;
  dueDate?: string;
  user?: { id: string; firstName: string; lastName: string; email: string; role: string };
  assignedBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
}

// ─── PROJECT DETAILS PAGE COMPONENT ───
const ProjectDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const isAdmin = user?.role === 'L1_ADMIN';
  const isPM = user?.role === 'PROJECT_MANAGER';
  const canManage = isAdmin || isPM;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sheet creation dialog
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [sheetName, setSheetName] = useState('');
  const [sheetDesc, setSheetDesc] = useState('');
  const [creatingSheet, setCreatingSheet] = useState(false);

  // Push dialog (assign with granularity)
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pushSheetId, setPushSheetId] = useState<string | null>(null);
  const [pushSheetName, setPushSheetName] = useState('');
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

  // Assignment manager dialog
  const [showAssignmentsDialog, setShowAssignmentsDialog] = useState(false);
  const [assignmentsSheetId, setAssignmentsSheetId] = useState<string | null>(null);
  const [assignmentsSheetName, setAssignmentsSheetName] = useState('');
  const [sheetAssignments, setSheetAssignments] = useState<SheetAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // ─── DATA LOADING ───
  const loadProject = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/projects/${id}`);
      setProject(response.data.project);
    } catch (err: any) {
      console.error('Failed to load project:', err);
      setError(err.response?.data?.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadUsers = useCallback(async () => {
    try {
      const response = await api.get('/auth/users');
      if (response.data?.users) {
        setAvailableUsers(response.data.users.filter((u: UserData) => u.role !== 'L1_ADMIN'));
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, []);

  const loadAssignments = useCallback(async (sheetId: string) => {
    try {
      setLoadingAssignments(true);
      const response = await api.get(`/sheets/${sheetId}/assignments`);
      const data = response.data;
      setSheetAssignments(Array.isArray(data) ? data : (data.assignments || []));
    } catch (err) {
      console.error('Failed to load assignments:', err);
      setSheetAssignments([]);
    } finally {
      setLoadingAssignments(false);
    }
  }, []);

  useEffect(() => {
    loadProject();
    if (canManage) loadUsers();
  }, [loadProject, loadUsers, canManage]);

  // ─── REAL-TIME SOCKET LISTENERS ───
  useEffect(() => {
    if (!socket) return;
    const handleAssignmentUpdate = () => {
      loadProject();
      if (assignmentsSheetId) loadAssignments(assignmentsSheetId);
    };
    socket.on('assignment-updated', handleAssignmentUpdate);
    socket.on('sheet-pushed-notification', handleAssignmentUpdate);
    return () => {
      socket.off('assignment-updated', handleAssignmentUpdate);
      socket.off('sheet-pushed-notification', handleAssignmentUpdate);
    };
  }, [socket, assignmentsSheetId, loadProject, loadAssignments]);

  // ─── SHEET CRUD ───
  const handleCreateSheet = async () => {
    if (!sheetName.trim()) return toast.error('Sheet name is required');
    if (!id) return;
    try {
      setCreatingSheet(true);
      await api.post('/sheets', {
        name: sheetName,
        description: sheetDesc,
        projectId: id,
      });
      toast.success('Sheet created successfully');
      setShowCreateSheet(false);
      setSheetName('');
      setSheetDesc('');
      loadProject();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create sheet');
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleDeleteSheet = async (sheetId: string) => {
    if (!window.confirm('Are you sure you want to delete this sheet?')) return;
    try {
      await api.delete(`/sheets/${sheetId}`);
      toast.success('Sheet deleted');
      loadProject();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete sheet');
    }
  };

  // ─── PUSH DIALOG (with ROW/COLUMN/CELL granularity) ───
  const openPushDialog = (sheet: SheetData) => {
    setPushSheetId(sheet.id);
    setPushSheetName(sheet.name);
    setPushMode('roles');
    setPushGranularity('ROW');
    setPushRows('');
    setPushColumns('');
    setPushCells('');
    setPushQuestion('');
    setPushDueDate('');
    setSelectedUserIds([]);
    setSelectedRoles([]);
    setShowPushDialog(true);
  };

  const handlePush = async () => {
    if (!pushSheetId) return;

    // Build assignment data based on granularity
    const assignmentData: any = {
      assignmentType: pushGranularity,
      question: pushQuestion || undefined,
      dueDate: pushDueDate || undefined,
    };

    if (pushGranularity === 'ROW') {
      const rows = pushRows.split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r));
      if (rows.length === 0) return toast.error('Please enter row numbers (e.g. 1,2,3)');
      assignmentData.rows = rows;
    } else if (pushGranularity === 'COLUMN') {
      const cols = pushColumns.split(',').map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]+$/.test(c));
      if (cols.length === 0) return toast.error('Please enter column letters (e.g. A,B,C)');
      assignmentData.columns = cols;
    } else if (pushGranularity === 'CELL') {
      const cells = pushCells.split(',').map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]+\d+$/.test(c));
      if (cells.length === 0) return toast.error('Please enter cell IDs (e.g. B3,C4)');
      assignmentData.cells = cells;
    }

    try {
      if (pushMode === 'users' && selectedUserIds.length > 0) {
        await api.post(`/sheets/${pushSheetId}/push-to-users`, {
          userIds: selectedUserIds,
          ...assignmentData,
        });
        toast.success(`Sheet pushed to ${selectedUserIds.length} user(s)`);
      } else if (pushMode === 'roles' && selectedRoles.length > 0) {
        await api.post(`/sheets/${pushSheetId}/push-to-roles`, {
          targetRoles: selectedRoles,
          ...assignmentData,
        });
        toast.success(`Sheet pushed to roles: ${selectedRoles.join(', ')}`);
      } else {
        toast.error('Please select users or roles');
        return;
      }

      // Emit socket events for real-time update
      socketService.emitSheetPushed({
        sheetId: pushSheetId,
        userIds: pushMode === 'users' ? selectedUserIds : undefined,
        roles: pushMode === 'roles' ? selectedRoles : undefined,
      });
      socketService.emit('assignment-update', {
        sheetId: pushSheetId,
        action: 'push',
        roles: selectedRoles,
      });

      setShowPushDialog(false);
      loadProject();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to push sheet');
    }
  };

  // ─── ASSIGNMENT MANAGER ───
  const openAssignmentsDialog = (sheet: SheetData) => {
    setAssignmentsSheetId(sheet.id);
    setAssignmentsSheetName(sheet.name);
    setShowAssignmentsDialog(true);
    loadAssignments(sheet.id);
  };

  const handleRemoveAssignmentItems = async (
    assignmentId: string,
    removeRows?: number[],
    removeColumns?: string[],
    removeCells?: string[]
  ) => {
    if (!assignmentsSheetId) return;
    try {
      await api.post(`/sheets/${assignmentsSheetId}/assignments/${assignmentId}/remove-items`, {
        removeRows,
        removeColumns,
        removeCells,
      });
      toast.success('Items removed from assignment');
      loadAssignments(assignmentsSheetId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove items');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!assignmentsSheetId) return;
    if (!window.confirm('Delete this entire assignment?')) return;
    try {
      await api.delete(`/sheets/${assignmentsSheetId}/assignments/${assignmentId}`);
      toast.success('Assignment deleted');
      loadAssignments(assignmentsSheetId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete assignment');
    }
  };

  // ─── HELPERS ───
  const statusColor = (status: string) => {
    const map: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'> = {
      PLANNING: 'default', IN_PROGRESS: 'primary', ON_HOLD: 'warning',
      COMPLETED: 'success', CANCELLED: 'error',
      DRAFT: 'default', ACTIVE: 'success', LOCKED: 'warning', ARCHIVED: 'info',
    };
    return map[status] || 'default';
  };

  const safeArr = (val: any): any[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') { try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {} }
    return [];
  };

  // ─── LOADING STATE ───
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !project) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || 'Project not found'}</Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)} sx={{ mt: 2 }}>Go Back</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3} gap={2}>
        <IconButton onClick={() => navigate(-1)}>
          <BackIcon />
        </IconButton>
        <Box flex={1}>
          <Typography variant="h4">{project.name}</Typography>
          <Box display="flex" gap={1} mt={0.5}>
            <Chip label={project.status} color={statusColor(project.status)} size="small" />
            <Chip label={project.priority} size="small" variant="outlined" />
            {project.location && <Chip label={project.location} size="small" variant="outlined" />}
          </Box>
        </Box>
        <IconButton onClick={loadProject} title="Refresh">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Project Info Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Description</Typography>
              <Typography variant="body1">{project.description || 'No description'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Sheets</Typography>
              <Typography variant="h4">{project.sheets?.length || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Progress</Typography>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="h4">{project.progressPercentage}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={project.progressPercentage}
                sx={{ mt: 1, height: 8, borderRadius: 4 }}
                color={project.progressPercentage >= 80 ? 'success' : project.progressPercentage >= 40 ? 'primary' : 'warning'}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Created By</Typography>
              <Typography variant="body1">
                {project.creator ? `${project.creator.firstName} ${project.creator.lastName}` : 'Unknown'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Divider sx={{ mb: 3 }} />

      {/* Sheets Section */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">
          <SheetIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Sheets ({project.sheets?.length || 0})
        </Typography>
        {canManage && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowCreateSheet(true)}>
            Create Sheet
          </Button>
        )}
      </Box>

      {project.sheets && project.sheets.length > 0 ? (
        <Grid container spacing={2}>
          {project.sheets.map((sheet) => (
            <Grid item xs={12} key={sheet.id}>
              <Card variant="outlined">
                <CardContent sx={{ pb: '8px !important' }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    {/* Sheet Info */}
                    <Box flex={1} minWidth={200}>
                      <Typography variant="h6" fontWeight="bold">{sheet.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {sheet.description || 'No description'} • Created {new Date(sheet.createdAt).toLocaleDateString()}
                      </Typography>
                      <Chip label={sheet.status} color={statusColor(sheet.status)} size="small" sx={{ mt: 0.5 }} />
                    </Box>

                    {/* Action Buttons */}
                    <Box display="flex" gap={0.5} flexWrap="wrap">
                      <Tooltip title="Open Sheet">
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<OpenIcon />}
                          onClick={() => navigate(`/project/${id}/sheet/${sheet.id}`)}
                        >
                          Open
                        </Button>
                      </Tooltip>
                      {canManage && (
                        <>
                          <Tooltip title="Push to Engineers (Assign Rows/Columns)">
                            <Button
                              size="small"
                              variant="outlined"
                              color="secondary"
                              startIcon={<SendIcon />}
                              onClick={() => openPushDialog(sheet)}
                            >
                              Push
                            </Button>
                          </Tooltip>
                          <Tooltip title="Manage Assignments">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<AssignmentIcon />}
                              onClick={() => openAssignmentsDialog(sheet)}
                            >
                              Assignments
                            </Button>
                          </Tooltip>
                          <Tooltip title="Delete Sheet">
                            <IconButton
                              color="error"
                              size="small"
                              onClick={() => handleDeleteSheet(sheet.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <SheetIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No sheets yet</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Create your first sheet for this project
          </Typography>
          {canManage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowCreateSheet(true)}>
              Create Sheet
            </Button>
          )}
        </Paper>
      )}

      {/* ═══════════════ CREATE SHEET DIALOG ═══════════════ */}
      <Dialog open={showCreateSheet} onClose={() => setShowCreateSheet(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Sheet</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'grid', gap: 2 }}>
            <TextField
              label="Sheet Name"
              fullWidth
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              autoFocus
            />
            <TextField
              label="Description (optional)"
              fullWidth
              multiline
              rows={3}
              value={sheetDesc}
              onChange={(e) => setSheetDesc(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateSheet(false)}>Cancel</Button>
          <Button variant="contained" disabled={creatingSheet} onClick={handleCreateSheet}>
            {creatingSheet ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════════ PUSH DIALOG (ROW/COLUMN/CELL GRANULARITY) ═══════════════ */}
      <Dialog open={showPushDialog} onClose={() => setShowPushDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Push Sheet: {pushSheetName}
          <Typography variant="body2" color="text.secondary">
            Assign specific rows, columns, or cells to engineers
          </Typography>
        </DialogTitle>
        <DialogContent>
          {/* Assign Mode Toggle */}
          <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 2 }}>
            <Button
              variant={pushMode === 'roles' ? 'contained' : 'outlined'}
              onClick={() => setPushMode('roles')}
              fullWidth
              size="small"
            >
              By Role
            </Button>
            <Button
              variant={pushMode === 'users' ? 'contained' : 'outlined'}
              onClick={() => setPushMode('users')}
              fullWidth
              size="small"
            >
              Specific Users
            </Button>
          </Box>

          {/* Target Selection */}
          {pushMode === 'users' ? (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Select Users</InputLabel>
              <Select
                multiple
                value={selectedUserIds}
                onChange={(e) => setSelectedUserIds(e.target.value as string[])}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map(uid => {
                      const u = availableUsers.find(x => x.id === uid);
                      return <Chip key={uid} label={u ? `${u.firstName} ${u.lastName}` : uid} size="small" />;
                    })}
                  </Box>
                )}
              >
                {availableUsers.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    <Checkbox checked={selectedUserIds.includes(u.id)} />
                    <ListItemText
                      primary={`${u.firstName} ${u.lastName}`}
                      secondary={authService.getRoleName(u.role)}
                    />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Select Roles</InputLabel>
              <Select
                multiple
                value={selectedRoles}
                onChange={(e) => setSelectedRoles(e.target.value as string[])}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map(r => <Chip key={r} label={authService.getRoleName(r)} size="small" />)}
                  </Box>
                )}
              >
                {['L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER'].map((role) => (
                  <MenuItem key={role} value={role}>
                    <Checkbox checked={selectedRoles.includes(role)} />
                    <ListItemText primary={authService.getRoleName(role)} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Granularity Tabs */}
          <Typography variant="subtitle2" gutterBottom>Assignment Type</Typography>
          <Tabs
            value={pushGranularity}
            onChange={(_, val) => setPushGranularity(val)}
            sx={{ mb: 2 }}
          >
            <Tab label="Rows" value="ROW" icon={<RowIcon />} iconPosition="start" />
            <Tab label="Columns" value="COLUMN" icon={<ColumnIcon />} iconPosition="start" />
            <Tab label="Cells" value="CELL" icon={<CellIcon />} iconPosition="start" />
          </Tabs>

          {pushGranularity === 'ROW' && (
            <TextField
              label="Row Numbers"
              fullWidth
              value={pushRows}
              onChange={(e) => setPushRows(e.target.value)}
              placeholder="e.g. 1,2,3,5-10"
              helperText="Enter row numbers separated by commas (e.g. 1,2,3)"
            />
          )}
          {pushGranularity === 'COLUMN' && (
            <TextField
              label="Column Letters"
              fullWidth
              value={pushColumns}
              onChange={(e) => setPushColumns(e.target.value)}
              placeholder="e.g. A,B,C"
              helperText="Enter column letters separated by commas (e.g. A,B,C)"
            />
          )}
          {pushGranularity === 'CELL' && (
            <TextField
              label="Cell IDs"
              fullWidth
              value={pushCells}
              onChange={(e) => setPushCells(e.target.value)}
              placeholder="e.g. B3,C4,D5"
              helperText="Enter cell IDs separated by commas (e.g. B3,C4,D5)"
            />
          )}

          <Box sx={{ display: 'grid', gap: 2, mt: 2 }}>
            <TextField
              label="Question / Instructions (optional)"
              fullWidth
              multiline
              rows={2}
              value={pushQuestion}
              onChange={(e) => setPushQuestion(e.target.value)}
              placeholder="e.g. Please fill in the cement quantity for this section"
            />
            <TextField
              label="Due Date (optional)"
              type="date"
              fullWidth
              value={pushDueDate}
              onChange={(e) => setPushDueDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPushDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<SendIcon />}
            onClick={handlePush}
            disabled={
              (pushMode === 'users' ? selectedUserIds.length === 0 : selectedRoles.length === 0) ||
              (pushGranularity === 'ROW' && !pushRows.trim()) ||
              (pushGranularity === 'COLUMN' && !pushColumns.trim()) ||
              (pushGranularity === 'CELL' && !pushCells.trim())
            }
          >
            Push to {pushMode === 'users' ? 'Users' : 'Roles'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════════ ASSIGNMENT MANAGER DIALOG ═══════════════ */}
      <Dialog
        open={showAssignmentsDialog}
        onClose={() => setShowAssignmentsDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="h6">Manage Assignments: {assignmentsSheetName}</Typography>
              <Typography variant="body2" color="text.secondary">
                View, modify, or remove assignments for this sheet
              </Typography>
            </Box>
            <IconButton onClick={() => setShowAssignmentsDialog(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loadingAssignments ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : sheetAssignments.length === 0 ? (
            <Alert severity="info" sx={{ my: 2 }}>
              No assignments for this sheet yet. Use "Push" to assign rows/columns to engineers.
            </Alert>
          ) : (
            sheetAssignments.map((assignment) => {
              const rows = safeArr(assignment.rows);
              const columns = safeArr(assignment.columns);
              const cells = safeArr(assignment.cells);
              const assigneeName = assignment.user
                ? `${assignment.user.firstName} ${assignment.user.lastName}`
                : assignment.assignedRole
                  ? authService.getRoleName(assignment.assignedRole)
                  : 'Unknown';

              return (
                <Accordion key={assignment.id} sx={{ mb: 1 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" width="100%">
                      <PeopleIcon color="primary" fontSize="small" />
                      <Typography fontWeight="bold">{assigneeName}</Typography>
                      {assignment.type && (
                        <Chip label={assignment.type} size="small" color="primary" variant="outlined" />
                      )}
                      {assignment.status && (
                        <Chip
                          label={assignment.status}
                          size="small"
                          color={
                            assignment.status === 'APPROVED' ? 'success' :
                            assignment.status === 'SUBMITTED' ? 'info' :
                            assignment.status === 'REJECTED' ? 'error' : 'warning'
                          }
                        />
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                        {new Date(assignment.createdAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {assignment.question && (
                      <Alert severity="info" sx={{ mb: 2 }}>
                        <strong>Question:</strong> {assignment.question}
                      </Alert>
                    )}
                    {assignment.dueDate && (
                      <Typography variant="body2" color="text.secondary" mb={1}>
                        Due: {new Date(assignment.dueDate).toLocaleDateString()}
                      </Typography>
                    )}

                    {/* Assigned Rows */}
                    {rows.length > 0 && (
                      <Box mb={1}>
                        <Typography variant="subtitle2" gutterBottom>
                          <RowIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                          Assigned Rows ({rows.length})
                        </Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {rows.map((row: number) => (
                            <Chip
                              key={row}
                              label={`Row ${row}`}
                              size="small"
                              color="primary"
                              variant="outlined"
                              onDelete={() => handleRemoveAssignmentItems(assignment.id, [row])}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}

                    {/* Assigned Columns */}
                    {columns.length > 0 && (
                      <Box mb={1}>
                        <Typography variant="subtitle2" gutterBottom>
                          <ColumnIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                          Assigned Columns ({columns.length})
                        </Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {columns.map((col: string) => (
                            <Chip
                              key={col}
                              label={`Col ${col}`}
                              size="small"
                              color="secondary"
                              variant="outlined"
                              onDelete={() => handleRemoveAssignmentItems(assignment.id, undefined, [col])}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}

                    {/* Assigned Cells */}
                    {cells.length > 0 && (
                      <Box mb={1}>
                        <Typography variant="subtitle2" gutterBottom>
                          <CellIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                          Assigned Cells ({cells.length})
                        </Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {cells.map((cell: string) => (
                            <Chip
                              key={cell}
                              label={cell}
                              size="small"
                              color="info"
                              variant="outlined"
                              onDelete={() => handleRemoveAssignmentItems(assignment.id, undefined, undefined, [cell])}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}

                    {rows.length === 0 && columns.length === 0 && cells.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        Full sheet assignment (no specific rows/columns/cells)
                      </Typography>
                    )}

                    <Divider sx={{ my: 1.5 }} />
                    <Button
                      color="error"
                      size="small"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleDeleteAssignment(assignment.id)}
                    >
                      Delete Entire Assignment
                    </Button>
                  </AccordionDetails>
                </Accordion>
              );
            })
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => assignmentsSheetId && loadAssignments(assignmentsSheetId)}
            startIcon={<RefreshIcon />}
          >
            Refresh
          </Button>
          <Button onClick={() => setShowAssignmentsDialog(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectDetailsPage;
