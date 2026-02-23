// ================================================================
// SENIOR ENGINEER DASHBOARD (pages/dashboards/SeniorEngineerDashboard.tsx)
// ================================================================
// PURPOSE: Dashboard for L2 Senior Engineer/Manager role.
//
// SECTIONS:
//   - Active projects overview
//   - Sheet assignments (own + junior engineers')
//   - Q&A management (create questions, review answers)
//   - Team member status
//   - Notifications and approvals
//
// PERMISSIONS:
//   - Can edit cells assigned to them
//   - Can create Q&A items for junior engineers
//   - Can approve/reject junior engineer answers
//   - Cannot modify sheet structure (admin only)
//
// DATA: Calls user-sheets, assignments, collaboration APIs
// ROLE ACCESS: L2 Senior Engineer/Manager only
// ================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Badge,
} from '@mui/material';
import {
  Engineering as EngineeringIcon,
  Assignment as AssignmentIcon,
  CheckCircle as CheckIcon,
  Pending as PendingIcon,
  Send as SendIcon,
  Notifications as NotifIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';

import DashboardLayout from '../../components/DashboardLayout';    // Page wrapper with sidebar
import { useNavigate } from 'react-router-dom';                      // Navigation
import toast from 'react-hot-toast';                                 // Toast notifications
import api from '../../services/api';                                // Axios instance
import { assignmentsAPI, Assignment, AppNotification } from '../../services/assignmentsAPI'; // Task API

// ─── SENIOR ENGINEER DASHBOARD COMPONENT ───
const SeniorEngineerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);                   // Projects assigned to me
  const [tasks, setTasks] = useState<Assignment[]>([]);                  // My task assignments
  const [, setNotifications] = useState<AppNotification[]>([]); // My notifications
  const [unreadCount, setUnreadCount] = useState(0);                     // Unread notification count
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);   // Junior engineer submissions to review

  // Load all dashboard data in parallel using Promise.allSettled
  // (allSettled means one failure won't break the others)
  const loadData = async () => {
    try {
      setLoading(true);
      const [projectsRes, tasksRes, notifsRes, approvalsRes] = await Promise.allSettled([
        api.get('/projects'),
        assignmentsAPI.getMyTasks(),
        assignmentsAPI.getNotifications(),
        api.get('/data/pending-approvals'),
      ]);

      if (projectsRes.status === 'fulfilled') {
        setProjects(projectsRes.value.data.projects || []);
      }
      if (tasksRes.status === 'fulfilled') {
        setTasks(tasksRes.value.tasks || []);
      }
      if (notifsRes.status === 'fulfilled') {
        setNotifications(notifsRes.value.notifications || []);
        setUnreadCount(notifsRes.value.unreadCount || 0);
      }
      if (approvalsRes.status === 'fulfilled') {
        setPendingApprovals(approvalsRes.value.data.pendingApprovals || []);
      }
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const pendingTasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
  const completedTasks = tasks.filter(t => t.status === 'SUBMITTED' || t.status === 'APPROVED');

  const StatCard = ({ title, value, subtitle, icon, color = 'primary' }: any) => (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h4" color={color}>{value}</Typography>
            <Typography variant="h6" color="text.secondary">{title}</Typography>
            {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
          </Box>
          <Box sx={{ color: `${color}.main` }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );

  const renderOverview = () => (
    <Box>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="My Projects" value={projects.length} icon={<EngineeringIcon fontSize="large" />} color="primary" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Pending Tasks" value={pendingTasks.length} subtitle="Assigned to you" icon={<AssignmentIcon fontSize="large" />} color="warning" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Completed" value={completedTasks.length} icon={<CheckIcon fontSize="large" />} color="success" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Approvals" value={pendingApprovals.length} subtitle="Awaiting review" icon={<PendingIcon fontSize="large" />} color="info" />
        </Grid>
      </Grid>

      {/* Notifications */}
      {unreadCount > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Badge badgeContent={unreadCount} color="error" sx={{ mr: 2 }}><NotifIcon /></Badge>
          You have {unreadCount} unread notification(s).
          <Button size="small" onClick={() => navigate('/my-tasks')} sx={{ ml: 2 }}>View Tasks</Button>
        </Alert>
      )}

      {/* Pending Tasks */}
      <Typography variant="h6" gutterBottom>Pending Tasks</Typography>
      {pendingTasks.length === 0 ? (
        <Alert severity="success" sx={{ mb: 3 }}>No pending tasks!</Alert>
      ) : (
        <List>
          {pendingTasks.slice(0, 5).map(task => (
            <ListItem key={task.id} divider secondaryAction={
              <Button size="small" variant="outlined" startIcon={<OpenIcon />} onClick={() => navigate('/my-tasks')}>
                Respond
              </Button>
            }>
              <ListItemIcon><AssignmentIcon color="warning" /></ListItemIcon>
              <ListItemText
                primary={`${task.sheet?.name || 'Sheet'} — ${task.assignmentType} ${task.assignmentType === 'ROW' ? task.assignedRows?.join(',') : task.assignedColumns?.join(',')}`}
                secondary={`${task.question || 'No question'} • Priority: ${task.priority} • ${new Date(task.assignedAt).toLocaleDateString()}`}
              />
            </ListItem>
          ))}
        </List>
      )}

      {/* Recent Projects */}
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Projects</Typography>
      {projects.length === 0 ? (
        <Alert severity="info">No projects assigned yet.</Alert>
      ) : (
        <Grid container spacing={2}>
          {projects.slice(0, 6).map((p: any) => (
            <Grid item xs={12} sm={6} md={4} key={p.id}>
              <Card sx={{ cursor: 'pointer' }} onClick={() => navigate(`/project/${p.id}`)}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight="bold">{p.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{p.description || 'No description'}</Typography>
                  <Chip label={p.status || 'ACTIVE'} size="small" color="primary" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );

  const menuItems = [
    { label: 'Dashboard', path: '/senior-engineer', icon: <EngineeringIcon /> },
    { label: 'My Tasks', path: '/my-tasks', icon: <AssignmentIcon /> },
    { label: 'My Sheets', path: '/my-sheets', icon: <SendIcon /> },
  ];

  return (
    <DashboardLayout title="Planning Manager" menuItems={menuItems}>
      {loading ? (
        <Box display="flex" justifyContent="center" mt={4}><CircularProgress /><Typography sx={{ ml: 2 }}>Loading...</Typography></Box>
      ) : renderOverview()}
    </DashboardLayout>
  );
};

export default SeniorEngineerDashboard;
