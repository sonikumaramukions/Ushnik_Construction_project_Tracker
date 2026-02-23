// ================================================================
// ADMIN DASHBOARD (pages/dashboards/AdminDashboard.tsx)
// ================================================================
// PURPOSE: The main L1 Admin dashboard page.
//
// TABS:
//   1. Overview    — Stats cards (users, projects, sheets, activity)
//   2. Users       — User management table
//   3. Projects    — Project management table
//   4. Sheets      — Sheet management with create/edit
//   5. Collaboration — Push sheets to roles, manage assignments
//
// DATA: Calls multiple APIs (users, projects, sheets, analytics)
// LAYOUT: Uses DashboardLayout wrapper
// ROLE ACCESS: L1 Admin only
// ================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  Assessment as AssessmentIcon,
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Dashboard as DashboardIcon,
  TableChart as SheetIcon,
  Business as ProjectsIcon,
  Storage as DatabaseIcon,
  MonetizationOn as MoneyIcon,
} from '@mui/icons-material';

import DashboardLayout from '../../components/DashboardLayout';       // Page wrapper with sidebar
import { useLocation } from 'react-router-dom';                       // For reading URL state
import api from '../../services/api';                                  // Axios instance
import toast from 'react-hot-toast';                                   // Toast notifications
import SheetsManagement from './components/SheetsManagement';         // Tab component: sheet CRUD
import CollaborationManager from './components/CollaborationManager'; // Tab component: push sheets
import ProjectsManagement from './components/ProjectsManagement';     // Tab component: project CRUD
import ProjectNew from '../../pages/admin/ProjectNew';                 // Create new project form
import DatabaseManagement from './components/DatabaseManagement';      // Tab component: DB + user management
import FinanceTracker from './components/FinanceTracker';              // Tab component: finance tracking

// ─── TYPE: A user in the system ───
interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;                  // L1_ADMIN, L2_SENIOR_ENGINEER, etc.
  phone?: string;
  isActive: boolean;             // Can this user log in?
  createdAt: string;
  lastLoginAt?: string;
  mustChangePassword?: boolean;  // Force password reset on next login
}

// ─── TYPE: System-wide statistics for the stat cards ───
interface SystemStats {
  totalUsers: number;
  activeProjects: number;
  totalSheets: number;
  systemHealth: 'good' | 'warning' | 'critical';
}

// ─── TYPE: One audit log entry ───
interface AuditLog {
  id: string;
  user: string;
  action: string;      // e.g. "CREATE", "UPDATE", "DELETE"
  resource: string;    // e.g. "sheet", "user", "project"
  timestamp: string;
  details: string;
}

// ─── ADMIN DASHBOARD COMPONENT ───
// This is the main page for the Head Officer (L1 Admin).
// It has 5 tabs: Overview, Users, Projects, Sheets, Collaboration.
const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);           // All users in the system
  const [stats, setStats] = useState<SystemStats>({         // Dashboard stat cards
    totalUsers: 0,
    activeProjects: 0,
    totalSheets: 0,
    systemHealth: 'good'
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]); // Recent activity logs
  const [loading, setLoading] = useState(true);
  const [userDialog, setUserDialog] = useState(false);       // Create/edit user dialog open?
  const [selectedUser, setSelectedUser] = useState<User | null>(null); // User being edited
  const [userForm, setUserForm] = useState({                 // Form fields for user create/edit
    firstName: '',
    lastName: '',
    email: '',
    role: '',
    phone: '',
    isActive: true
  });
  const [tempPassword, setTempPassword] = useState('');      // Generated password for new users
  const [showPassword, setShowPassword] = useState(false);

  // Human-readable labels for each role code
  const roleLabels = {
    L1_ADMIN: 'Head Officer',
    L2_SENIOR_ENGINEER: 'Planning Manager',
    L3_JUNIOR_ENGINEER: 'Site Engineer',
    PROJECT_MANAGER: 'Project Manager',
    GROUND_MANAGER: 'Ground Manager',
    CEO: 'CEO'
  };

  // Load dashboard data on first render
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Fetch users, projects count, and sheets count from the backend
  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // 1. Load all users via GET /api/auth/users
      const usersResponse = await api.get('/auth/users');
      let loadedUsers: User[] = [];
      if (usersResponse.data && usersResponse.data.users) {
        loadedUsers = usersResponse.data.users;
        setUsers(loadedUsers);
      }

      // 2. Load project and sheet counts in parallel
      let projectCount = 0;
      let sheetCount = 0;
      try {
        const [projectsRes, sheetsRes] = await Promise.allSettled([
          api.get('/projects'),   // GET /api/projects
          api.get('/sheets'),     // GET /api/sheets
        ]);
        if (projectsRes.status === 'fulfilled') {
          projectCount = (projectsRes.value.data.projects || []).length;
        }
        if (sheetsRes.status === 'fulfilled') {
          const d = sheetsRes.value.data;
          sheetCount = (d.sheets || d || []).length;
        }
      } catch { /* ignore partial failures */ }

      // 3. Update the stat cards with real numbers
      setStats({
        totalUsers: loadedUsers.length,
        activeProjects: projectCount,
        totalSheets: sheetCount,
        systemHealth: 'good'
      });

      // 4. Create a simple audit log entry showing what was loaded
      setAuditLogs([
        { id: '1', user: 'System', action: 'Dashboard loaded', resource: 'dashboard', timestamp: new Date().toISOString(), details: `${loadedUsers.length} users, ${projectCount} projects, ${sheetCount} sheets` }
      ]);

    } catch (error) {
      toast.error('Failed to load dashboard data');
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserEdit = (user: User) => {
    setSelectedUser(user);
    setUserForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      isActive: user.isActive
    });
    setUserDialog(true);
  };

  const handleUserSave = async () => {
    try {
      if (selectedUser) {
        // Update existing user
        const response = await api.put(`/auth/users/${selectedUser.id}`, userForm);
        if (response.data) {
          toast.success('User updated successfully');
        }
      } else {
        // Create new user
        const response = await api.post('/auth/create-user', userForm);
        if (response.data) {
          setTempPassword(response.data.temporaryPassword);
          setShowPassword(true);
          toast.success('User created successfully');
        }
      }
      setUserDialog(false);
      loadDashboardData();
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to save user';
      toast.error(message);
    }
  };

  const handleUserDelete = async (userId: string) => {
    if (window.confirm('Are you sure you want to deactivate this user?')) {
      try {
        const response = await api.put(`/auth/users/${userId}`, { isActive: false });
        if (response.data) {
          toast.success('User deactivated successfully');
          loadDashboardData();
        }
      } catch (error: any) {
        const message = error.response?.data?.message || 'Failed to deactivate user';
        toast.error(message);
      }
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (window.confirm('Are you sure you want to reset this user\'s password?')) {
      try {
        const response = await api.post(`/auth/users/${userId}/reset-password`);
        if (response.data) {
          setTempPassword(response.data.temporaryPassword);
          setShowPassword(true);
          toast.success('Password reset successfully');
        }
      } catch (error: any) {
        const message = error.response?.data?.message || 'Failed to reset password';
        toast.error(message);
      }
    }
  };

  const StatCard = ({ title, value, icon, color = 'primary' }: any) => (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h4" color={color}>
              {value}
            </Typography>
            <Typography variant="h6" color="text.secondary">
              {title}
            </Typography>
          </Box>
          <Box sx={{ color: `${color}.main` }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  const renderOverview = () => (
    <Box>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            icon={<PeopleIcon fontSize="large" />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Projects"
            value={stats.activeProjects}
            icon={<BusinessIcon fontSize="large" />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Sheets"
            value={stats.totalSheets}
            icon={<AssessmentIcon fontSize="large" />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="System Health"
            value={stats.systemHealth.toUpperCase()}
            icon={<SecurityIcon fontSize="large" />}
            color={stats.systemHealth === 'good' ? 'success' : stats.systemHealth === 'warning' ? 'warning' : 'error'}
          />
        </Grid>
      </Grid>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="h6">System Controller Dashboard</Typography>
        <Typography variant="body2">
          You have full system access. Monitor users, manage permissions, and oversee all construction projects.
        </Typography>
      </Alert>
    </Box>
  );

  const renderUserManagement = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">User Management</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setSelectedUser(null);
            setUserForm({ firstName: '', lastName: '', email: '', role: '', phone: '', isActive: true });
            setUserDialog(true);
          }}
        >
          Add User
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Chip
                    label={roleLabels[user.role as keyof typeof roleLabels]}
                    color="primary"
                    variant="outlined"
                    size="small"
                  />
                </TableCell>
                <TableCell>{user.phone || 'N/A'}</TableCell>
                <TableCell>
                  <Chip
                    label={user.isActive ? 'Active' : 'Inactive'}
                    color={user.isActive ? 'success' : 'error'}
                    size="small"
                  />
                  {user.mustChangePassword && (
                    <Chip
                      label="Must Change PWD"
                      color="warning"
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  )}
                </TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleUserEdit(user)} size="small">
                    <EditIcon />
                  </IconButton>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={() => handleResetPassword(user.id)}
                    sx={{ mx: 1, minWidth: 'auto' }}
                  >
                    Reset PWD
                  </Button>
                  <IconButton onClick={() => handleUserDelete(user.id)} size="small" color="error">
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderAuditLogs = () => (
    <Box>
      <Typography variant="h5" gutterBottom>Audit Logs</Typography>
      <List>
        {auditLogs.map((log) => (
          <ListItem key={log.id} divider>
            <ListItemText
              primary={`${log.user} ${log.action} ${log.resource}`}
              secondary={`${log.details} • ${new Date(log.timestamp).toLocaleString()}`}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );

  const renderSystemSettings = () => (
    <Box>
      <Typography variant="h5" gutterBottom>System Settings</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <SettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                General Settings
              </Typography>
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Enable email notifications"
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Require approval for new sheets"
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Auto-backup data daily"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Security Settings
              </Typography>
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Two-factor authentication"
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Session timeout (30 min)"
                />
                <FormControlLabel
                  control={<Switch />}
                  label="IP restrictions"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );

  const location = useLocation();
  const path = location.pathname;
  const activeSection = path === '/admin' ? 'overview' : path.startsWith('/admin/users') ? 'users' : path.startsWith('/admin/sheets') ? 'sheets' : path.startsWith('/admin/collaboration') ? 'collab' : path.startsWith('/admin/audit') ? 'audit' : path.startsWith('/admin/database') ? 'database' : path.startsWith('/admin/finance') ? 'finance' : path.startsWith('/admin/settings') ? 'settings' : path.startsWith('/admin/projects') ? 'projects' : 'overview';

  return (
    <DashboardLayout
      title="Head Officer"
      menuItems={[
        { label: 'Overview', path: '/admin', icon: <DashboardIcon /> },
        { label: 'Projects', path: '/admin/projects', icon: <ProjectsIcon /> },
        { label: 'Sheets', path: '/admin/sheets', icon: <SheetIcon /> },
        { label: 'Collaboration', path: '/admin/collaboration', icon: <PeopleIcon /> },
        { label: 'Audit Logs', path: '/admin/audit', icon: <AssessmentIcon /> },
        { label: 'Database', path: '/admin/database', icon: <DatabaseIcon /> },
        { label: 'Finance', path: '/admin/finance', icon: <MoneyIcon /> },
        { label: 'System Settings', path: '/admin/settings', icon: <SettingsIcon /> },
      ]}
    >
      {loading ? (
        <Box display="flex" justifyContent="center" mt={4}>
          <Typography>Loading...</Typography>
        </Box>
      ) : (
        <>
          {activeSection === 'overview' && renderOverview()}
          {activeSection === 'users' && renderUserManagement()}
          {activeSection === 'projects' && <ProjectsManagement />}
          {activeSection === 'sheets' && <SheetsManagement />}
          {activeSection === 'collab' && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <CollaborationManager />
              </Grid>
            </Grid>
          )}
          {activeSection === 'audit' && renderAuditLogs()}
          {activeSection === 'database' && (
            <DatabaseManagement />
          )}
          {activeSection === 'finance' && <FinanceTracker />}
          {activeSection === 'settings' && renderSystemSettings()}
          {path === '/admin/projects/new' && (
            <Box sx={{ mt: 2 }}>
              <ProjectNew />
            </Box>
          )}
        </>
      )}

      {/* User Dialog */}
      <Dialog open={userDialog} onClose={() => setUserDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedUser ? 'Edit User' : 'Add User'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              label="First Name"
              fullWidth
              value={userForm.firstName}
              onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Last Name"
              fullWidth
              value={userForm.lastName}
              onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Email"
              fullWidth
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Phone (Optional)"
              fullWidth
              value={userForm.phone}
              onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Role</InputLabel>
              <Select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
              >
                <MenuItem value="L2_SENIOR_ENGINEER">Planning Manager</MenuItem>
                <MenuItem value="L3_JUNIOR_ENGINEER">Site Engineer</MenuItem>
                <MenuItem value="PROJECT_MANAGER">Project Manager</MenuItem>
                <MenuItem value="GROUND_MANAGER">Ground Manager</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={userForm.isActive}
                  onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                />
              }
              label="Active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialog(false)}>Cancel</Button>
          <Button onClick={handleUserSave} variant="contained">
            {selectedUser ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Password Display Dialog */}
      <Dialog open={showPassword} onClose={() => setShowPassword(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedUser ? 'Password Reset' : 'User Created Successfully'}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="h6">
              {selectedUser ? 'Password Reset Successful' : 'New User Created'}
            </Typography>
            <Typography variant="body2">
              Please provide the temporary password to the user. They will be required to change it on first login.
            </Typography>
          </Alert>
          <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Temporary Password:
            </Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', letterSpacing: 2 }}>
              {tempPassword}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            navigator.clipboard.writeText(tempPassword);
            toast.success('Password copied to clipboard');
          }} variant="outlined">
            Copy Password
          </Button>
          <Button onClick={() => setShowPassword(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminDashboard;