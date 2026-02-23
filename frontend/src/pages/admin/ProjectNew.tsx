// ================================================================
// NEW PROJECT PAGE (pages/admin/ProjectNew.tsx)
// ================================================================
// PURPOSE: Form to create a new construction project.
//
// FIELDS:
//   - Project name, description, location
//   - Start date, expected end date
//   - Budget, status
//
// FLOW:
//   1. Admin fills in project details
//   2. On submit → POST /api/projects
//   3. Success → redirects to project list
//
// ROLE ACCESS: L1 Admin, Project Manager
// USED BY: App.tsx route at /admin/projects/new
// ================================================================

import React, { useState } from 'react';
import { Box, TextField, Button, Typography, Paper } from '@mui/material';
import toast from 'react-hot-toast';                // Toast notifications
import { useNavigate } from 'react-router-dom';     // For redirecting after create
import projectsAPI from '../../services/projectsAPI'; // Projects API service

// ─── NEW PROJECT PAGE ───────────────────────────────────────
// A simple form to create a new construction project.
// Admin fills in name/location/description, clicks Create,
// then gets redirected to the new project's detail page.
// ──────────────────────────────────────────────────────
const ProjectNew: React.FC = () => {
  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // Handle form submission — POST /api/projects
  const handleCreate = async () => {
    if (!name.trim()) return toast.error('Project name is required');
    try {
      setSaving(true);
      const project = await projectsAPI.create({ name, description, location });
      toast.success('Project created');
      navigate(`/project/${project.id}`);  // Redirect to the new project's detail page
    } catch (err: any) {
      console.error('Create project failed', err);
      toast.error(err?.response?.data?.message || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>Create New Project</Typography>
      <Box sx={{ display: 'grid', gap: 2 }}>
        {/* Project name (required) */}
        <TextField label="Project Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
        {/* Location (optional) */}
        <TextField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth />
        {/* Description (optional, multiline) */}
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={4} />
        {/* Cancel goes back to admin dashboard, Create submits the form */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button variant="text" onClick={() => navigate('/admin')}>Cancel</Button>
          <Button variant="contained" disabled={saving} onClick={handleCreate}>Create</Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default ProjectNew;
