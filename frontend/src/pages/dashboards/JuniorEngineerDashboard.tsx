// ================================================================
// JUNIOR ENGINEER DASHBOARD (pages/dashboards/JuniorEngineerDashboard.tsx)
// ================================================================
// PURPOSE: Dashboard for L3 Junior Engineer role.
//
// SECTIONS:
//   - Assigned sheets overview
//   - Pending Q&A items to answer
//   - Task completion status
//   - Notifications
//   - Quick access to frequently used sheets
//
// FEATURES:
//   - Can edit cells assigned to them
//   - Can answer questionnaires from senior engineers
//   - Cannot modify sheet structure
//
// DATA: Calls user-sheets, assignments, notifications APIs
// ROLE ACCESS: L3 Junior Engineer only
// ================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Paper,
  Chip,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Divider,
} from '@mui/material';
import {
  School as SchoolIcon,
  Assignment as AssignmentIcon,
  CheckCircle as CheckIcon,
  Pending as PendingIcon,
  Send as SendIcon,
  Notifications as NotifIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';

import DashboardLayout from '../../components/DashboardLayout';    // Page wrapper with sidebar
import { useNavigate } from 'react-router-dom';                     // Navigation
import toast from 'react-hot-toast';                                 // Toast notifications
import { assignmentsAPI, Assignment, AppNotification } from '../../services/assignmentsAPI'; // Task API
import { useAuth } from '../../contexts/AuthContext';                // Current user info
import { useSocket } from '../../contexts/SocketContext';            // Real-time socket events

// ─── JUNIOR ENGINEER DASHBOARD COMPONENT ───
const JuniorEngineerDashboard: React.FC = () => {
  const navigate = useNavigate();
  useAuth();                                      // Auth context (ensures login)
  const { socket } = useSocket();                // Socket.io connection for real-time updates
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Assignment[]>([]);                  // My assigned tasks
  const [, setNotifications] = useState<AppNotification[]>([]); // My notifications (stored for future use)
  const [unreadCount, setUnreadCount] = useState(0);
  const [quickAnswers, setQuickAnswers] = useState<Record<string, Record<string, string>>>({}); // Quick cell answers
  const [submitting, setSubmitting] = useState<string | null>(null);     // Which task is being submitted

  // Fetch tasks and notifications from the server
  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksRes, notifsRes] = await Promise.allSettled([
        assignmentsAPI.getMyTasks(),
        assignmentsAPI.getNotifications(),
      ]);
      if (tasksRes.status === 'fulfilled') setTasks(tasksRes.value.tasks || []);
      if (notifsRes.status === 'fulfilled') {
        setNotifications(notifsRes.value.notifications || []);
        setUnreadCount(notifsRes.value.unreadCount || 0);
      }
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  // Load data once on mount
  useEffect(() => { loadData(); }, []);

  // Listen for real-time "task_assigned" events via Socket.io
  // When a new task is pushed to this engineer, auto-reload the dashboard
  useEffect(() => {
    if (!socket) return;
    const handler = () => { loadData(); toast('New task assigned!', { icon: '📋' }); };
    socket.on('task_assigned', handler);
    return () => { socket.off('task_assigned', handler); };  // Cleanup on unmount
  }, [socket]);

  const pendingTasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
  const completedTasks = tasks.filter(t => t.status === 'SUBMITTED' || t.status === 'APPROVED' || t.status === 'REJECTED');

  const getEditableCells = (task: Assignment): string[] => {
    const rows = task.sheet?.structure?.rows || 10;
    const cols = task.sheet?.structure?.cols || 8;
    if (task.assignmentType === 'ROW' && task.assignedRows?.length) {
      const cells: string[] = [];
      task.assignedRows.forEach(rowNum => {
        for (let c = 0; c < cols; c++) cells.push(String.fromCharCode(65 + c) + rowNum);
      });
      return cells;
    }
    if (task.assignmentType === 'COLUMN' && task.assignedColumns?.length) {
      const cells: string[] = [];
      task.assignedColumns.forEach(col => {
        for (let r = 1; r <= rows; r++) cells.push(col + r);
      });
      return cells;
    }
    if (task.assignmentType === 'CELL' && task.assignedCells?.length) return task.assignedCells;
    return [];
  };

  const handleQuickSubmit = async (task: Assignment) => {
    try {
      setSubmitting(task.id);
      const vals = quickAnswers[task.id] || {};
      const toSend: Record<string, string> = {};
      Object.entries(vals).forEach(([k, v]) => { if (v && v.trim()) toSend[k] = v; });

      if (Object.keys(toSend).length === 0) {
        toast.error('Please fill in at least one cell');
        setSubmitting(null);
        return;
      }

      await assignmentsAPI.submitResponse(task.id, toSend);
      toast.success('Response submitted! Values auto-filled into admin sheet.');
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit');
    } finally { setSubmitting(null); }
  };

  const StatCard = ({ title, value, icon, color = 'primary' }: any) => (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h4" color={color}>{value}</Typography>
            <Typography variant="h6" color="text.secondary">{title}</Typography>
          </Box>
          <Box sx={{ color: `${color}.main` }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );

  const menuItems = [
    { label: 'Dashboard', path: '/junior-engineer', icon: <SchoolIcon /> },
    { label: 'My Tasks', path: '/my-tasks', icon: <AssignmentIcon /> },
    { label: 'My Sheets', path: '/my-sheets', icon: <SendIcon /> },
  ];

  return (
    <DashboardLayout title="Site Engineer" menuItems={menuItems}>
      {loading ? (
        <Box display="flex" justifyContent="center" mt={4}><CircularProgress /><Typography sx={{ ml: 2 }}>Loading...</Typography></Box>
      ) : (
        <Box>
          {/* Stats */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={3}>
              <StatCard title="Pending" value={pendingTasks.length} icon={<PendingIcon fontSize="large" />} color="warning" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard title="Submitted" value={completedTasks.filter(t => t.status === 'SUBMITTED').length} icon={<SendIcon fontSize="large" />} color="info" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard title="Approved" value={completedTasks.filter(t => t.status === 'APPROVED').length} icon={<CheckIcon fontSize="large" />} color="success" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard title="Total" value={tasks.length} icon={<AssignmentIcon fontSize="large" />} color="primary" />
            </Grid>
          </Grid>

          {/* Notifications Banner */}
          {unreadCount > 0 && (
            <Alert severity="info" sx={{ mb: 2 }} action={
              <Button size="small" onClick={() => navigate('/my-tasks')}>View All</Button>
            }>
              <Badge badgeContent={unreadCount} color="error" sx={{ mr: 2 }}><NotifIcon /></Badge>
              You have {unreadCount} unread notification(s).
            </Alert>
          )}

          {/* Pending Tasks — Quick Response */}
          <Typography variant="h6" gutterBottom>
            <AssignmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Pending Tasks ({pendingTasks.length})
          </Typography>

          {pendingTasks.length === 0 ? (
            <Alert severity="success" sx={{ mb: 3 }}>All tasks completed! Great work.</Alert>
          ) : (
            pendingTasks.map(task => (
              <Card key={task.id} sx={{ mb: 2, border: task.priority === 'URGENT' ? '2px solid #d32f2f' : '1px solid #e0e0e0' }}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="subtitle1" fontWeight="bold">{task.sheet?.name || 'Sheet'}</Typography>
                      <Chip label={task.assignmentType} size="small" variant="outlined" />
                      <Chip label={task.priority} size="small" color={task.priority === 'URGENT' ? 'error' : task.priority === 'HIGH' ? 'warning' : 'default'} />
                    </Box>
                    <Button size="small" startIcon={<OpenIcon />} onClick={() => navigate(`/sheet/${task.sheetId}`)}>
                      Full Sheet
                    </Button>
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Project: {task.sheet?.project?.name || 'N/A'} | By: {task.assignedBy?.firstName} {task.assignedBy?.lastName} | {new Date(task.assignedAt).toLocaleDateString()}
                  </Typography>

                  {task.question && (
                    <Alert severity="info" sx={{ my: 1 }}><strong>Question:</strong> {task.question}</Alert>
                  )}

                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                    Fill in: {task.assignmentType === 'ROW' ? `Row(s) ${task.assignedRows?.join(', ')}` : task.assignmentType === 'COLUMN' ? `Column(s) ${task.assignedColumns?.join(', ')}` : `Cell(s) ${task.assignedCells?.join(', ')}`}
                  </Typography>

                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'bold', width: 60 }}>Cell</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>Your Answer</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {getEditableCells(task).slice(0, 20).map(cellId => (
                          <TableRow key={cellId}>
                            <TableCell><Chip label={cellId} size="small" /></TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                fullWidth
                                placeholder="Enter value..."
                                value={(quickAnswers[task.id] || {})[cellId] || ''}
                                onChange={(e) => setQuickAnswers(prev => ({
                                  ...prev,
                                  [task.id]: { ...(prev[task.id] || {}), [cellId]: e.target.value }
                                }))}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      startIcon={submitting === task.id ? <CircularProgress size={16} /> : <SendIcon />}
                      onClick={() => handleQuickSubmit(task)}
                      disabled={submitting === task.id}
                    >
                      Submit Response
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" gutterBottom>Completed ({completedTasks.length})</Typography>
              <List dense>
                {completedTasks.slice(0, 10).map(task => (
                  <ListItem key={task.id} divider>
                    <ListItemIcon>
                      {task.status === 'APPROVED' ? <CheckIcon color="success" /> : task.status === 'REJECTED' ? <CheckIcon color="error" /> : <PendingIcon color="info" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={`${task.sheet?.name} — ${task.assignmentType} ${task.assignmentType === 'ROW' ? task.assignedRows?.join(',') : task.assignedColumns?.join(',')}`}
                      secondary={`Status: ${task.status} | ${task.respondedAt ? new Date(task.respondedAt).toLocaleDateString() : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Box>
      )}
    </DashboardLayout>
  );
};

export default JuniorEngineerDashboard;
