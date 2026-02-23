// ================================================================
// ADMIN DASHBOARD REAL (components/AdminDashboardReal.tsx)
// ================================================================
// PURPOSE: The full-featured admin dashboard for L1 Admin role.
//
// TABS / SECTIONS:
//   1. Overview   — Stats cards, recent activity, system health
//   2. Users      — Create/edit/delete users, assign roles
//   3. Projects   — Create/edit projects, manage teams
//   4. Sheets     — Create/edit tracking sheets, manage columns
//   5. Collaboration — Push sheets to roles/users, manage assignments
//
// STATE MANAGEMENT: Local useState + API calls on tab change
// DATA FLOW: Calls usersAPI, projectsAPI, sheetsAPI, analyticsAPI
//
// ROLE ACCESS: L1 Admin only (enforced by ProtectedRoute)
// ================================================================

import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent,
  Tabs, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, Dialog,
  DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem,
  Chip, IconButton, Alert, Switch, FormControlLabel, Pagination,
} from '@mui/material';
import {
  Add as AddIcon,              // "+" icon for creating new items
  Edit as EditIcon,            // Pencil icon for editing
  Delete as DeleteIcon,        // Trash icon for deleting
  Refresh as RefreshIcon,      // Refresh/reload icon
  Person as PersonIcon,        // User/people icon
  Assessment as AssessmentIcon,// Chart/analytics icon
  Security as SecurityIcon,    // Shield icon
  Settings as SettingsIcon,    // Gear icon
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';                     // Current user + permissions
import { usersAPI, User, UserStats } from '../services/usersAPI'; // User CRUD API
import { analyticsAPI, auditAPI, DashboardStats, AuditLog } from '../services/analyticsAPI'; // Stats + audit
import toast from 'react-hot-toast';

// ─── Helper component: only renders children when the active tab matches ───
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;    // Which tab this panel belongs to
  value: number;    // Currently selected tab
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}                     // Hidden unless this tab is selected
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

// ─── ADMIN DASHBOARD COMPONENT ───────────────────────────────────
// The full dashboard for Head Officer (L1 Admin).
// Has 4 stat cards at the top, then 3 tabs:
//   Tab 0: User Management (CRUD table of all users)
//   Tab 1: System Settings (toggle switches)
//   Tab 2: Audit Logs (paginated table of who did what)
// ────────────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
  const { user, hasPermission } = useAuth();          // Check if user has admin access
  const [currentTab, setCurrentTab] = useState(0);    // Which tab is active (0/1/2)
  const [loading, setLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null); // Stat cards data
  const [users, setUsers] = useState<User[]>([]);               // All users in the system
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);   // Recent audit log entries
  const [userDialogOpen, setUserDialogOpen] = useState(false);  // Create/edit user dialog
  const [selectedUser, setSelectedUser] = useState<User | null>(null); // User being edited (null = creating new)
  const [userForm, setUserForm] = useState({
    email: '',
    username: '',
    first_name: '',
    last_name: '',
    role: 'L3_JUNIOR_ENGINEER' as User['role'],
    is_active: true,
  });
  const [auditPage, setAuditPage] = useState(1);        // Current page of audit logs
  const [auditTotal, setAuditTotal] = useState(0);       // Total audit log count (for pagination)

  // Fetch all dashboard data when component mounts (if user has permission)
  useEffect(() => {
    if (hasPermission('admin.dashboard.view')) {
      fetchDashboardData();
    }
  }, [hasPermission]);

  // Load stats, users, and audit logs in parallel using Promise.all
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, usersRes, auditRes] = await Promise.all([
        analyticsAPI.getDashboardStats(),               // GET /api/analytics/dashboard
        usersAPI.getAll(),                               // GET /api/users
        auditAPI.getAll({ limit: 10, offset: 0 }),      // GET /api/audit (first page)
      ]);
      
      setDashboardStats(statsRes);    // Stats for the 4 cards at the top
      setUsers(usersRes);              // All users for the User Management table
      setAuditLogs(auditRes.logs);     // Recent audit logs
      setAuditTotal(auditRes.total);   // Total count for pagination
    } catch (error: any) {
      toast.error('Failed to fetch dashboard data');
      console.error('Dashboard data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- USER MANAGEMENT FUNCTIONS ---

  // Create a new user via POST /api/users
  const handleUserCreate = async () => {
    try {
      await usersAPI.create(userForm);
      toast.success('User created successfully');
      setUserDialogOpen(false);
      fetchDashboardData();
      resetUserForm();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create user');
    }
  };

  // Update an existing user via PUT /api/users/:id
  const handleUserUpdate = async () => {
    if (!selectedUser) return;
    
    try {
      await usersAPI.update(selectedUser.id, userForm);
      toast.success('User updated successfully');
      setUserDialogOpen(false);
      fetchDashboardData();  // Refresh the table
      resetUserForm();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update user');
    }
  };

  // Toggle a user's active/inactive status (enables/disables their login)
  const handleUserToggleActive = async (userId: string) => {
    try {
      await usersAPI.toggleActive(userId);   // PUT /api/users/:id/toggle-active
      toast.success('User status updated');
      fetchDashboardData();
    } catch (error: any) {
      toast.error('Failed to update user status');
    }
  };

  // Delete a user (with confirmation prompt)
  const handleUserDelete = async (userId: string, userName: string) => {
    if (window.confirm(`Are you sure you want to delete user "${userName}"?`)) {
      try {
        await usersAPI.delete(userId);        // DELETE /api/users/:id
        toast.success('User deleted successfully');
        fetchDashboardData();
      } catch (error: any) {
        toast.error('Failed to delete user');
      }
    }
  };

  // Open the user dialog — either to create (no user) or edit (with user data)
  const openUserDialog = (user?: User) => {
    if (user) {
      setSelectedUser(user);
      setUserForm({
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_active: user.is_active,
      });
    } else {
      setSelectedUser(null);
      resetUserForm();
    }
    setUserDialogOpen(true);
  };

  // Reset form fields to defaults (for creating a new user)
  const resetUserForm = () => {
    setUserForm({
      email: '',
      username: '',
      first_name: '',
      last_name: '',
      role: 'L3_JUNIOR_ENGINEER',  // Default role for new users
      is_active: true,
    });
  };

  // Load a different page of audit logs (10 per page)
  const handleAuditPageChange = async (page: number) => {
    try {
      const response = await auditAPI.getAll({ limit: 10, offset: (page - 1) * 10 });
      setAuditLogs(response.logs);
      setAuditPage(page);
    } catch (error) {
      toast.error('Failed to fetch audit logs');
    }
  };

  // --- PERMISSION CHECK ---
  // If user doesn't have admin dashboard permission, show error
  if (!hasPermission('admin.dashboard.view')) {
    return (
      <Alert severity="error">
        You don't have permission to access the admin dashboard.
      </Alert>
    );
  }

  // Show loading text while data is being fetched
  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Loading dashboard data...</Typography>
      </Box>
    );
  }

  // ─── MAIN RENDER ───
  return (
    <Box sx={{ p: 3 }}>
      {/* Dashboard title + refresh button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          🔧 Head Officer Dashboard
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchDashboardData}
        >
          Refresh
        </Button>
      </Box>

      {/* Statistics Cards */}
      {dashboardStats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Users</Typography>
                </Box>
                <Typography variant="h4" color="primary.main">
                  {dashboardStats.users.total}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {dashboardStats.users.active} active
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <AssessmentIcon sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="h6">Projects</Typography>
                </Box>
                <Typography variant="h4" color="success.main">
                  {dashboardStats.projects.total}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {dashboardStats.projects.active} active
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SecurityIcon sx={{ mr: 1, color: 'info.main' }} />
                  <Typography variant="h6">Sheets</Typography>
                </Box>
                <Typography variant="h4" color="info.main">
                  {dashboardStats.sheets.total}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {dashboardStats.sheets.pendingApprovals} pending approvals
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SettingsIcon sx={{ mr: 1, color: dashboardStats.systemHealth.status === 'GOOD' ? 'success.main' : 'error.main' }} />
                  <Typography variant="h6">System Health</Typography>
                </Box>
                <Typography 
                  variant="h4" 
                  color={dashboardStats.systemHealth.status === 'GOOD' ? 'success.main' : 'error.main'}
                >
                  {dashboardStats.systemHealth.status}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {Math.round(dashboardStats.systemHealth.uptime / 3600)}h uptime
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={currentTab} onChange={(_, value) => setCurrentTab(value)}>
          <Tab label="User Management" />
          <Tab label="System Settings" />
          <Tab label="Audit Logs" />
        </Tabs>

        {/* User Management Tab */}
        <TabPanel value={currentTab} index={0}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">User Management</Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => openUserDialog()}
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
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      {user.first_name} {user.last_name}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Chip 
                        label={user.role} 
                        size="small" 
                        color={user.role === 'L1_ADMIN' ? 'error' : 'primary'}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={user.is_active}
                        onChange={() => handleUserToggleActive(user.id)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => openUserDialog(user)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleUserDelete(user.id, `${user.first_name} ${user.last_name}`)}
                        disabled={user.role === 'L1_ADMIN'}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* System Settings Tab */}
        <TabPanel value={currentTab} index={1}>
          <Typography variant="h6" sx={{ mb: 2 }}>System Settings</Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>System Configuration</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <FormControlLabel
                      control={<Switch defaultChecked />}
                      label="Enable real-time notifications"
                    />
                    <FormControlLabel
                      control={<Switch defaultChecked />}
                      label="Auto-backup enabled"
                    />
                    <FormControlLabel
                      control={<Switch />}
                      label="Maintenance mode"
                    />
                    <FormControlLabel
                      control={<Switch defaultChecked />}
                      label="Audit logging enabled"
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>Performance Metrics</Typography>
                  {dashboardStats && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="body2">
                        <strong>Memory Usage:</strong> {dashboardStats.systemHealth.memoryUsage}%
                      </Typography>
                      <Typography variant="body2">
                        <strong>Disk Usage:</strong> {dashboardStats.systemHealth.diskUsage}%
                      </Typography>
                      <Typography variant="body2">
                        <strong>DB Connections:</strong> {dashboardStats.systemHealth.dbConnections}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Uptime:</strong> {Math.round(dashboardStats.systemHealth.uptime / 3600)} hours
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Audit Logs Tab */}
        <TabPanel value={currentTab} index={2}>
          <Typography variant="h6" sx={{ mb: 2 }}>Audit Logs</Typography>
          
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {new Date(log.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {log.user ? `${log.user.first_name} ${log.user.last_name}` : 'System'}
                    </TableCell>
                    <TableCell>
                      <Chip label={log.action} size="small" />
                    </TableCell>
                    <TableCell>{log.resource}</TableCell>
                    <TableCell>
                      {log.resource_id && (
                        <Typography variant="caption">
                          ID: {log.resource_id}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination
              count={Math.ceil(auditTotal / 10)}
              page={auditPage}
              onChange={(_, page) => handleAuditPageChange(page)}
            />
          </Box>
        </TabPanel>
      </Paper>

      {/* User Dialog */}
      <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedUser ? 'Edit User' : 'Create User'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                value={userForm.first_name}
                onChange={(e) => setUserForm({ ...userForm, first_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={userForm.last_name}
                onChange={(e) => setUserForm({ ...userForm, last_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={userForm.role}
                  label="Role"
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value as User['role'] })}
                >
                  <MenuItem value="L1_ADMIN">Head Officer</MenuItem>
                  <MenuItem value="L2_SENIOR_ENGINEER">Planning Manager</MenuItem>
                  <MenuItem value="L3_JUNIOR_ENGINEER">Site Engineer</MenuItem>
                  <MenuItem value="PROJECT_MANAGER">Project Manager</MenuItem>
                  <MenuItem value="GROUND_MANAGER">Ground Manager</MenuItem>
                  <MenuItem value="CEO">CEO</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={userForm.is_active}
                    onChange={(e) => setUserForm({ ...userForm, is_active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={selectedUser ? handleUserUpdate : handleUserCreate}
          >
            {selectedUser ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminDashboard;