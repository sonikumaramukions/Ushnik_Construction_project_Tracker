// ================================================================
// DATABASE MANAGEMENT (pages/dashboards/components/DatabaseManagement.tsx)
// ================================================================
// PURPOSE: Full React admin page for managing users and database.
//
// FEATURES:
//   - User Management: Add, edit, deactivate users with role assignment
//   - Password Reset: Generate temporary passwords
//   - Workflow Management: View active sessions, sheet assignments
//   - Database Browser: Browse all tables, view data, run queries
//   - Activity Log: Recent user actions
//
// DATA: Calls /api/auth/users, /api/admin/db/* endpoints
// PARENT: AdminDashboard.tsx (rendered in "Database" tab)
// ACCESS: L1_ADMIN only
// ================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Grid, Alert, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem,
  Switch, FormControlLabel, Tabs, Tab, CircularProgress,
  Tooltip, Card, CardContent, InputAdornment, Badge,
} from '@mui/material';
import {
  Edit as EditIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  PersonAdd as PersonAddIcon,
  Lock as LockIcon,
  Storage as StorageIcon,
  People as PeopleIcon,
  ContentCopy as CopyIcon,
  Visibility as ViewIcon,
  VisibilityOff as HideIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
  AccountTree as WorkflowIcon,
  TableChart as TableIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../../services/api';

// ─── TYPE: User from the system ───
interface SystemUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
  mustChangePassword?: boolean;
}

// ─── TYPE: Database table info ───
interface TableInfo {
  name: string;
  rowCount: number;
}

// ─── TYPE: Sheet assignment ───
interface SheetAssignment {
  id: string;
  userId: string;
  sheetId: string;
  status: string;
  progress: number;
  user?: { firstName: string; lastName: string; role: string };
  sheet?: { name: string };
}

// Role configuration with labels, colors, and icons
const ROLE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  L1_ADMIN: { label: 'Head Officer', color: '#d32f2f', bgColor: '#ffebee' },
  L2_SENIOR_ENGINEER: { label: 'Planning Manager', color: '#1565c0', bgColor: '#e3f2fd' },
  L3_JUNIOR_ENGINEER: { label: 'Site Engineer', color: '#2e7d32', bgColor: '#e8f5e9' },
  PROJECT_MANAGER: { label: 'Project Manager', color: '#e65100', bgColor: '#fff3e0' },
  GROUND_MANAGER: { label: 'Ground Manager', color: '#6a1b9a', bgColor: '#f3e5f5' },
  CEO: { label: 'CEO', color: '#37474f', bgColor: '#eceff1' },
};

// ─── DATABASE MANAGEMENT COMPONENT ───
const DatabaseManagement: React.FC = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  // Users state
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<SystemUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // User dialog
  const [userDialog, setUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [userForm, setUserForm] = useState({
    firstName: '', lastName: '', email: '', role: '', phone: '', isActive: true,
  });

  // Password dialog
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [showTempPassword, setShowTempPassword] = useState(false);

  // Database browser state
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [tablePage, setTablePage] = useState(1);
  const [tableTotal, setTableTotal] = useState(0);

  // Workflow state
  const [assignments, setAssignments] = useState<SheetAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // ─── LOAD USERS ───
  const loadUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const response = await api.get('/auth/users');
      if (response.data?.users) {
        setUsers(response.data.users);
        setFilteredUsers(response.data.users);
      }
    } catch (error) {
      toast.error('Failed to load users');
      console.error('Load users error:', error);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // ─── FILTER USERS ───
  useEffect(() => {
    let filtered = [...users];
    if (userSearch) {
      const search = userSearch.toLowerCase();
      filtered = filtered.filter(u =>
        u.firstName.toLowerCase().includes(search) ||
        u.lastName.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        (ROLE_CONFIG[u.role]?.label || u.role).toLowerCase().includes(search)
      );
    }
    if (roleFilter !== 'ALL') {
      filtered = filtered.filter(u => u.role === roleFilter);
    }
    setFilteredUsers(filtered);
  }, [users, userSearch, roleFilter]);

  // ─── LOAD TABLES ───
  const loadTables = useCallback(async () => {
    try {
      setLoadingTables(true);
      const response = await api.get('/admin/db/tables');
      if (response.data?.tables) {
        setTables(response.data.tables);
      }
    } catch (error) {
      toast.error('Failed to load database tables');
    } finally {
      setLoadingTables(false);
    }
  }, []);

  // ─── LOAD TABLE DATA ───
  const loadTableData = useCallback(async (tableName: string, page = 1) => {
    try {
      const response = await api.get(`/admin/db/table/${tableName}`, {
        params: { page, limit: 50 },
      });
      if (response.data) {
        setTableData(response.data.rows || []);
        setTableColumns(response.data.columns || []);
        setTableTotal(response.data.pagination?.total || 0);
        setTablePage(page);
      }
    } catch (error) {
      toast.error(`Failed to load table: ${tableName}`);
    }
  }, []);

  // ─── LOAD SHEET ASSIGNMENTS (Workflow) ───
  const loadAssignments = useCallback(async () => {
    try {
      setLoadingAssignments(true);
      const response = await api.get('/sheets');
      // Get sheet assignments from all sheets
      const allAssignments: SheetAssignment[] = [];
      const sheetsData = response.data?.sheets || response.data || [];

      for (const sheet of sheetsData.slice(0, 10)) {
        try {
          const detailRes = await api.get(`/sheets/${sheet.id}`);
          const assignments = detailRes.data?.sheet?.userSheets || [];
          assignments.forEach((a: any) => {
            allAssignments.push({
              ...a,
              sheet: { name: sheet.name },
            });
          });
        } catch { /* skip */ }
      }
      setAssignments(allAssignments);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    } finally {
      setLoadingAssignments(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Load tab-specific data
  useEffect(() => {
    if (activeTab === 1) loadTables();
    if (activeTab === 2) loadAssignments();
  }, [activeTab, loadTables, loadAssignments]);

  // ─── CREATE / EDIT USER ───
  const handleOpenUserDialog = (user?: SystemUser) => {
    if (user) {
      setEditingUser(user);
      setUserForm({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        phone: user.phone || '',
        isActive: user.isActive,
      });
    } else {
      setEditingUser(null);
      setUserForm({
        firstName: '', lastName: '', email: '', role: '', phone: '', isActive: true,
      });
    }
    setUserDialog(true);
  };

  const handleSaveUser = async () => {
    // Validation
    if (!userForm.firstName.trim()) return toast.error('First name is required');
    if (!userForm.lastName.trim()) return toast.error('Last name is required');
    if (!userForm.email.trim()) return toast.error('Email is required');
    if (!userForm.role) return toast.error('Role is required');

    try {
      if (editingUser) {
        await api.put(`/auth/users/${editingUser.id}`, userForm);
        toast.success(`User ${userForm.firstName} ${userForm.lastName} updated`);
      } else {
        const response = await api.post('/auth/create-user', userForm);
        if (response.data?.temporaryPassword) {
          setTempPassword(response.data.temporaryPassword);
          setPasswordDialog(true);
        }
        toast.success(`User ${userForm.firstName} ${userForm.lastName} created`);
      }
      setUserDialog(false);
      loadUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save user');
    }
  };

  // ─── DEACTIVATE USER ───
  const handleToggleActive = async (user: SystemUser) => {
    const newStatus = !user.isActive;
    const action = newStatus ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} ${user.firstName} ${user.lastName}?`)) return;

    try {
      await api.put(`/auth/users/${user.id}`, { isActive: newStatus });
      toast.success(`User ${action}d successfully`);
      loadUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Failed to ${action} user`);
    }
  };

  // ─── RESET PASSWORD ───
  const handleResetPassword = async (user: SystemUser) => {
    if (!window.confirm(`Reset password for ${user.firstName} ${user.lastName}?`)) return;

    try {
      const response = await api.post(`/auth/users/${user.id}/reset-password`);
      if (response.data?.temporaryPassword) {
        setTempPassword(response.data.temporaryPassword);
        setPasswordDialog(true);
        toast.success('Password reset successfully');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to reset password');
    }
  };

  // ─── COPY TO CLIPBOARD ───
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // ─── STATS ───
  const activeUsers = users.filter(u => u.isActive).length;
  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  // ════════════════════════════════════════════════
  // TAB 0: USER MANAGEMENT
  // ════════════════════════════════════════════════
  const renderUserManagement = () => (
    <Box>
      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: '#e3f2fd' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="h4" color="primary" fontWeight="bold">{users.length}</Typography>
              <Typography variant="body2" color="text.secondary">Total Users</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: '#e8f5e9' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="h4" color="success.main" fontWeight="bold">{activeUsers}</Typography>
              <Typography variant="body2" color="text.secondary">Active</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: '#fff3e0' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="h4" color="warning.main" fontWeight="bold">{users.length - activeUsers}</Typography>
              <Typography variant="body2" color="text.secondary">Inactive</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: '#f3e5f5' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="h4" color="secondary" fontWeight="bold">{Object.keys(roleCounts).length}</Typography>
              <Typography variant="body2" color="text.secondary">Roles in Use</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Role Distribution */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>Role Distribution</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {Object.entries(ROLE_CONFIG).map(([role, config]) => (
            <Chip
              key={role}
              label={`${config.label}: ${roleCounts[role] || 0}`}
              sx={{
                bgcolor: config.bgColor,
                color: config.color,
                fontWeight: 'bold',
                border: `1px solid ${config.color}30`,
              }}
              onClick={() => setRoleFilter(roleFilter === role ? 'ALL' : role)}
              variant={roleFilter === role ? 'filled' : 'outlined'}
            />
          ))}
          {roleFilter !== 'ALL' && (
            <Chip label="Clear Filter" onDelete={() => setRoleFilter('ALL')} size="small" />
          )}
        </Box>
      </Paper>

      {/* Search + Actions Bar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search users..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          sx={{ minWidth: 250 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
          }}
        />
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => handleOpenUserDialog()}
          sx={{ fontWeight: 'bold' }}
        >
          Add New User
        </Button>
        <IconButton onClick={loadUsers} title="Refresh users">
          <RefreshIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          Showing {filteredUsers.length} of {users.length} users
        </Typography>
      </Box>

      {/* Users Table */}
      {loadingUsers ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 480px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Phone</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="center">Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Last Login</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user) => {
                const roleConfig = ROLE_CONFIG[user.role] || { label: user.role, color: '#757575', bgColor: '#f5f5f5' };
                return (
                  <TableRow
                    key={user.id}
                    hover
                    sx={{
                      opacity: user.isActive ? 1 : 0.6,
                      bgcolor: user.isActive ? 'inherit' : '#fafafa',
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 32, height: 32, borderRadius: '50%',
                            bgcolor: roleConfig.color, color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 'bold',
                          }}
                        >
                          {user.firstName[0]}{user.lastName[0]}
                        </Box>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {user.firstName} {user.lastName}
                          </Typography>
                          {user.mustChangePassword && (
                            <Typography variant="caption" color="warning.main">Must change password</Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{user.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={roleConfig.label}
                        size="small"
                        sx={{
                          bgcolor: roleConfig.bgColor,
                          color: roleConfig.color,
                          fontWeight: 'bold',
                          border: `1px solid ${roleConfig.color}40`,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{user.phone || '—'}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      {user.isActive ? (
                        <Chip icon={<ActiveIcon />} label="Active" size="small" color="success" variant="outlined" />
                      ) : (
                        <Chip icon={<InactiveIcon />} label="Inactive" size="small" color="error" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="Edit user">
                          <IconButton size="small" onClick={() => handleOpenUserDialog(user)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reset password">
                          <IconButton size="small" onClick={() => handleResetPassword(user)} color="warning">
                            <LockIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={user.isActive ? 'Deactivate' : 'Activate'}>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleActive(user)}
                            color={user.isActive ? 'error' : 'success'}
                          >
                            {user.isActive ? <InactiveIcon fontSize="small" /> : <ActiveIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {userSearch ? 'No users match your search' : 'No users found'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  // ════════════════════════════════════════════════
  // TAB 1: DATABASE BROWSER
  // ════════════════════════════════════════════════
  const renderDatabaseBrowser = () => (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
        <Typography variant="h6">Database Tables</Typography>
        <IconButton onClick={loadTables} title="Refresh tables" size="small">
          <RefreshIcon />
        </IconButton>
      </Box>

      {loadingTables ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2}>
          {/* Table List */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 1 }}>
              <Typography variant="subtitle2" sx={{ px: 1, py: 0.5, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                Tables ({tables.length})
              </Typography>
              <Box sx={{ maxHeight: 'calc(100vh - 380px)', overflow: 'auto' }}>
                {tables.map((table) => (
                  <Box
                    key={table.name}
                    onClick={() => {
                      setSelectedTable(table.name);
                      loadTableData(table.name);
                    }}
                    sx={{
                      px: 1.5, py: 1, cursor: 'pointer', borderRadius: 1,
                      bgcolor: selectedTable === table.name ? 'primary.light' : 'transparent',
                      color: selectedTable === table.name ? 'white' : 'text.primary',
                      '&:hover': {
                        bgcolor: selectedTable === table.name ? 'primary.light' : '#f5f5f5',
                      },
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TableIcon sx={{ fontSize: 16 }} />
                      <Typography variant="body2" fontWeight={selectedTable === table.name ? 'bold' : 'normal'}>
                        {table.name}
                      </Typography>
                    </Box>
                    <Badge badgeContent={table.rowCount} color="primary" max={999} />
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>

          {/* Table Data */}
          <Grid item xs={12} md={9}>
            {selectedTable ? (
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    {selectedTable}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      ({tableTotal} rows)
                    </Typography>
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {tablePage > 1 && (
                      <Button size="small" onClick={() => loadTableData(selectedTable, tablePage - 1)}>
                        ← Prev
                      </Button>
                    )}
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                      Page {tablePage} of {Math.ceil(tableTotal / 50)}
                    </Typography>
                    {tablePage < Math.ceil(tableTotal / 50) && (
                      <Button size="small" onClick={() => loadTableData(selectedTable, tablePage + 1)}>
                        Next →
                      </Button>
                    )}
                  </Box>
                </Box>

                <TableContainer sx={{ maxHeight: 'calc(100vh - 440px)', overflow: 'auto' }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        {tableColumns.map((col) => (
                          <TableCell key={col} sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', whiteSpace: 'nowrap' }}>
                            {col}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableData.map((row, idx) => (
                        <TableRow key={idx} hover>
                          {tableColumns.map((col) => (
                            <TableCell key={col} sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <Tooltip title={String(row[col] ?? '')} placement="top">
                                <Typography variant="caption">
                                  {row[col] !== null && row[col] !== undefined
                                    ? String(row[col]).length > 50
                                      ? String(row[col]).substring(0, 50) + '...'
                                      : String(row[col])
                                    : '—'}
                                </Typography>
                              </Tooltip>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {tableData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={tableColumns.length} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">No data in this table</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            ) : (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <StorageIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography variant="body1" color="text.secondary">
                  Select a table from the sidebar to view its data
                </Typography>
              </Paper>
            )}
          </Grid>
        </Grid>
      )}
    </Box>
  );

  // ════════════════════════════════════════════════
  // TAB 2: WORKFLOW
  // ════════════════════════════════════════════════
  const renderWorkflow = () => (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
        <Typography variant="h6">Workflow — Sheet Assignments</Typography>
        <IconButton onClick={loadAssignments} title="Refresh" size="small">
          <RefreshIcon />
        </IconButton>
      </Box>

      {loadingAssignments ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : assignments.length === 0 ? (
        <Alert severity="info">
          No sheet assignments found. Push sheets to users from the Sheets tab to create workflow entries.
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Sheet</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Assigned To</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">Progress</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assignments.map((a) => {
                const statusColor = a.status === 'completed' ? 'success'
                  : a.status === 'submitted' ? 'info'
                  : a.status === 'in_progress' ? 'warning'
                  : 'default';
                return (
                  <TableRow key={a.id} hover>
                    <TableCell>{a.sheet?.name || a.sheetId}</TableCell>
                    <TableCell>
                      {a.user ? `${a.user.firstName} ${a.user.lastName}` : a.userId}
                    </TableCell>
                    <TableCell>
                      {a.user?.role && ROLE_CONFIG[a.user.role] ? (
                        <Chip
                          label={ROLE_CONFIG[a.user.role].label}
                          size="small"
                          sx={{
                            bgcolor: ROLE_CONFIG[a.user.role].bgColor,
                            color: ROLE_CONFIG[a.user.role].color,
                            fontWeight: 'bold',
                          }}
                        />
                      ) : '—'}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={a.status?.toUpperCase().replace('_', ' ')}
                        size="small"
                        color={statusColor as any}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">{a.progress || 0}%</Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  // ════════════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════════════
  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
        Database & User Management
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage system users, browse database tables, and monitor workflow assignments.
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newVal) => setActiveTab(newVal)}
          variant="fullWidth"
          sx={{
            '& .MuiTab-root': { fontWeight: 'bold', textTransform: 'none' },
          }}
        >
          <Tab icon={<PeopleIcon />} label="User Management" iconPosition="start" />
          <Tab icon={<StorageIcon />} label="Database Browser" iconPosition="start" />
          <Tab icon={<WorkflowIcon />} label="Workflow" iconPosition="start" />
        </Tabs>
      </Paper>

      {activeTab === 0 && renderUserManagement()}
      {activeTab === 1 && renderDatabaseBrowser()}
      {activeTab === 2 && renderWorkflow()}

      {/* ═══ CREATE/EDIT USER DIALOG ═══ */}
      <Dialog open={userDialog} onClose={() => setUserDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {editingUser ? <EditIcon color="primary" /> : <PersonAddIcon color="primary" />}
            <Typography variant="h6">{editingUser ? 'Edit User' : 'Create New User'}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={6}>
              <TextField
                label="First Name"
                fullWidth
                required
                value={userForm.firstName}
                onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Last Name"
                fullWidth
                required
                value={userForm.lastName}
                onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Email"
                fullWidth
                required
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Phone (Optional)"
                fullWidth
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth required>
                <InputLabel>Role</InputLabel>
                <Select
                  value={userForm.role}
                  label="Role"
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                >
                  {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                    <MenuItem key={role} value={role}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: config.color }} />
                        {config.label}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={userForm.isActive}
                    onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                  />
                }
                label={userForm.isActive ? 'Active — User can log in' : 'Inactive — User cannot log in'}
              />
            </Grid>
          </Grid>
          {!editingUser && (
            <Alert severity="info" sx={{ mt: 2 }}>
              A temporary password will be generated. Share it with the user securely.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, bgcolor: '#f5f5f5', borderTop: '1px solid #e0e0e0' }}>
          <Button onClick={() => setUserDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveUser} startIcon={editingUser ? <EditIcon /> : <PersonAddIcon />}>
            {editingUser ? 'Update User' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ TEMPORARY PASSWORD DIALOG ═══ */}
      <Dialog open={passwordDialog} onClose={() => setPasswordDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#fff3e0', borderBottom: '1px solid #ffe0b2' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockIcon color="warning" />
            <Typography variant="h6">Temporary Password</Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="warning" sx={{ mb: 3 }}>
            Share this password securely with the user. They will be required to change it on first login.
          </Alert>
          <Paper
            sx={{
              p: 3, bgcolor: '#f5f5f5', borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
            }}
          >
            <Typography
              variant="h4"
              sx={{ fontFamily: 'monospace', letterSpacing: 3, fontWeight: 'bold' }}
            >
              {showTempPassword ? tempPassword : '••••••••'}
            </Typography>
            <IconButton onClick={() => setShowTempPassword(!showTempPassword)} size="small">
              {showTempPassword ? <HideIcon /> : <ViewIcon />}
            </IconButton>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, bgcolor: '#f5f5f5' }}>
          <Button
            variant="outlined"
            startIcon={<CopyIcon />}
            onClick={() => copyToClipboard(tempPassword)}
          >
            Copy Password
          </Button>
          <Button
            variant="contained"
            onClick={() => { setPasswordDialog(false); setShowTempPassword(false); }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DatabaseManagement;
