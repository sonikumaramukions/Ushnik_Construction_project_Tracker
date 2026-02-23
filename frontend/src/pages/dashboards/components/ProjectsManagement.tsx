// ================================================================
// PROJECTS MANAGEMENT (pages/dashboards/components/ProjectsManagement.tsx)
// ================================================================
// PURPOSE: Admin panel for creating, editing, and deleting projects.
//
// FEATURES:
//   - Projects table with name, status, dates, team count
//   - Create project dialog (name, description, dates)
//   - Edit project dialog
//   - Delete project with confirmation
//   - Search and filter projects
//   - Team member management per project
//
// DATA: Calls projectsAPI (CRUD operations)
// PARENT: AdminDashboard.tsx (rendered in "Projects" tab)
// ================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography, Box, Paper, Button, Grid, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, FormControl,
  InputLabel, Select, MenuItem, CircularProgress, Alert, LinearProgress,
  Card, CardContent
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  OpenInNew as OpenIcon,
  Refresh as RefreshIcon,
  Business as BusinessIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../../services/api';

// ─── TYPE: A project with its details ───
interface Project {
  id: string;
  name: string;
  description?: string;
  location?: string;
  status: string;              // PLANNING, ACTIVE, ON_HOLD, COMPLETED
  priority: string;            // LOW, MEDIUM, HIGH, CRITICAL
  budget?: number;
  progressPercentage: number;  // 0-100
  startDate?: string;
  endDate?: string;
  createdAt: string;
  creator?: { id: string; firstName: string; lastName: string };
  sheets?: any[];              // Sheets belonging to this project
}

// ─── PROJECTS MANAGEMENT COMPONENT ───
// CRUD table for construction projects.
const ProjectsManagement: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);   // All projects
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create/Edit dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null); // null = creating new
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({     // Form fields
    name: '',
    description: '',
    location: '',
    status: 'PLANNING',
    priority: 'MEDIUM',
    budget: '',
    startDate: '',
    endDate: '',
  });

  // Fetch all projects from GET /api/projects
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/projects');
      setProjects(response.data.projects || []);
    } catch (err: any) {
      console.error('Failed to load projects:', err);
      setError(err.response?.data?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const openCreateDialog = () => {
    setEditingProject(null);
    setForm({ name: '', description: '', location: '', status: 'PLANNING', priority: 'MEDIUM', budget: '', startDate: '', endDate: '' });
    setShowDialog(true);
  };

  const openEditDialog = (project: Project) => {
    setEditingProject(project);
    setForm({
      name: project.name,
      description: project.description || '',
      location: project.location || '',
      status: project.status,
      priority: project.priority,
      budget: project.budget ? String(project.budget) : '',
      startDate: project.startDate ? project.startDate.split('T')[0] : '',
      endDate: project.endDate ? project.endDate.split('T')[0] : '',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Project name is required');
    try {
      setSaving(true);
      const payload = {
        ...form,
        budget: form.budget ? Number(form.budget) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      };

      if (editingProject) {
        await api.put(`/projects/${editingProject.id}`, payload);
        toast.success('Project updated');
      } else {
        await api.post('/projects', payload);
        toast.success('Project created');
      }
      setShowDialog(false);
      loadProjects();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!window.confirm('Are you sure you want to delete this project? This will also delete all associated sheets.')) return;
    try {
      await api.delete(`/projects/${projectId}`);
      toast.success('Project deleted');
      loadProjects();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete project');
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
      PLANNING: 'default', IN_PROGRESS: 'primary', ON_HOLD: 'warning',
      COMPLETED: 'success', CANCELLED: 'error',
    };
    return map[status] || 'default';
  };

  const priorityColor = (priority: string) => {
    const map: Record<string, 'default' | 'warning' | 'error' | 'info'> = {
      LOW: 'info', MEDIUM: 'default', HIGH: 'warning', CRITICAL: 'error',
    };
    return map[priority] || 'default';
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          <BusinessIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Projects Management
        </Typography>
        <Box display="flex" gap={1}>
          <IconButton onClick={loadProjects} title="Refresh">
            <RefreshIcon />
          </IconButton>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
            Create Project
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="primary">{projects.length}</Typography>
              <Typography variant="body2" color="text.secondary">Total Projects</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="success.main">
                {projects.filter(p => p.status === 'IN_PROGRESS').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">In Progress</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="info.main">
                {projects.filter(p => p.status === 'PLANNING').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">Planning</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="success.dark">
                {projects.filter(p => p.status === 'COMPLETED').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">Completed</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : projects.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <BusinessIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No projects yet</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Create your first construction project to get started
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
            Create Project
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Project Name</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Sheets</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id} hover>
                  <TableCell>
                    <Typography fontWeight="bold">{project.name}</Typography>
                    {project.description && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {project.description.substring(0, 50)}{project.description.length > 50 ? '...' : ''}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{project.location || '-'}</TableCell>
                  <TableCell>
                    <Chip label={project.status.replace(/_/g, ' ')} color={statusColor(project.status)} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip label={project.priority} color={priorityColor(project.priority)} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={project.progressPercentage}
                        sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                      />
                      <Typography variant="caption">{project.progressPercentage}%</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{project.sheets?.length || 0}</TableCell>
                  <TableCell>{new Date(project.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <IconButton color="primary" onClick={() => navigate(`/project/${project.id}`)} title="Open Project">
                      <OpenIcon />
                    </IconButton>
                    <IconButton onClick={() => openEditDialog(project)} title="Edit">
                      <EditIcon />
                    </IconButton>
                    <IconButton color="error" onClick={() => handleDelete(project.id)} title="Delete">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingProject ? 'Edit Project' : 'Create New Project'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'grid', gap: 2 }}>
            <TextField
              label="Project Name"
              fullWidth required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            <TextField
              label="Description"
              fullWidth multiline rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <TextField
              label="Location"
              fullWidth
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <MenuItem value="PLANNING">Planning</MenuItem>
                    <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                    <MenuItem value="ON_HOLD">On Hold</MenuItem>
                    <MenuItem value="COMPLETED">Completed</MenuItem>
                    <MenuItem value="CANCELLED">Cancelled</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Priority</InputLabel>
                  <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <MenuItem value="LOW">Low</MenuItem>
                    <MenuItem value="MEDIUM">Medium</MenuItem>
                    <MenuItem value="HIGH">High</MenuItem>
                    <MenuItem value="CRITICAL">Critical</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <TextField
              label="Budget"
              fullWidth type="number"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Start Date"
                  fullWidth type="date"
                  InputLabelProps={{ shrink: true }}
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="End Date"
                  fullWidth type="date"
                  InputLabelProps={{ shrink: true }}
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editingProject ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectsManagement;