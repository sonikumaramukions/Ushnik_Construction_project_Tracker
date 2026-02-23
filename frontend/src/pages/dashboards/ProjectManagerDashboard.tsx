// ================================================================
// PROJECT MANAGER DASHBOARD (pages/dashboards/ProjectManagerDashboard.tsx)
// ================================================================
// PURPOSE: Dashboard for the Project Manager role.
//
// SECTIONS:
//   - Project overview cards (active, completed, pending)
//   - Team management table
//   - Sheet assignment management
//   - Progress tracking with charts
//   - Task delegation and approval queue
//
// PERMISSIONS:
//   - Can create and manage projects
//   - Can assign sheets to engineers
//   - Can view all project data
//   - Can approve/reject submissions
//
// DATA: Calls projects, sheets, users, assignments APIs
// ROLE ACCESS: Project Manager only
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
  Alert,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  LinearProgress,
  Avatar,
  AvatarGroup
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Business as BusinessIcon,
  BusinessCenter as ProjectIcon,
  Group as TeamIcon,
  AccountBalance as BudgetIcon,
  Schedule as TimelineIcon,
  Assessment as ReportsIcon,
  TrendingUp as ProgressIcon,
  Assignment as TaskIcon,
  CalendarToday as CalendarIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  Add as AddIcon
} from '@mui/icons-material';

import DashboardLayout from '../../components/DashboardLayout';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

// ─── TYPE: A project with budget, timeline, team, risks, milestones ───
interface Project {
  id: string;
  name: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed';
  progress: number;         // 0-100%
  budget: {
    allocated: number;      // Total budget
    spent: number;          // Money spent so far
    remaining: number;      // Budget left
  };
  timeline: {
    startDate: string;
    endDate: string;
    daysRemaining: number;
  };
  team: {
    id: string;
    name: string;
    role: string;
    avatar?: string;
  }[];
  risks: {
    level: 'low' | 'medium' | 'high' | 'critical';
    count: number;
  };
  milestones: {
    id: string;
    title: string;
    dueDate: string;
    status: 'pending' | 'completed' | 'overdue';
  }[];
}

// ─── TYPE: A resource (equipment, material, or personnel) ───
interface Resource {
  id: string;
  name: string;
  type: 'equipment' | 'material' | 'personnel';
  status: 'available' | 'allocated' | 'maintenance';
  currentProject?: string;
  cost: number;
  utilization: number;  // 0-100% usage
}

// ─── PROJECT MANAGER DASHBOARD COMPONENT ───
// Tabs: Project Overview, Resource Management.
// Uses mock data for demonstration (replace with API calls for production).
const ProjectManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);                 // Active tab
  const [projects, setProjects] = useState<Project[]>([]);     // All projects
  const [resources, setResources] = useState<Resource[]>([]);  // All resources
  const [loading, setLoading] = useState(true);
  // Removed unused selectedProject and projectDialog state

  // Load dashboard data on mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Load real projects from API + populate with mock details
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load real projects from the API
      let realProjects: any[] = [];
      try {
        const response = await api.get('/projects');
        realProjects = response.data.projects || response.data || [];
      } catch { /* use mock data if API fails */ }

      // Transform real projects into the PM dashboard format
      const transformedProjects: Project[] = realProjects.length > 0 
        ? realProjects.map((p: any): Project => ({
            id: p.id,
            name: p.name,
            status: (p.status === 'IN_PROGRESS' ? 'active' : 
                    p.status === 'PLANNING' ? 'planning' : 
                    p.status === 'ON_HOLD' ? 'on_hold' : 
                    p.status === 'COMPLETED' ? 'completed' : 'planning') as Project['status'],
            progress: p.progressPercentage || 0,
            budget: {
              allocated: p.budget || 0,
              spent: Math.round((p.budget || 0) * (p.progressPercentage || 0) / 100),
              remaining: Math.round((p.budget || 0) * (1 - (p.progressPercentage || 0) / 100)),
            },
            timeline: {
              startDate: p.startDate || new Date().toISOString(),
              endDate: p.endDate || new Date(Date.now() + 180 * 86400000).toISOString(),
              daysRemaining: p.endDate ? Math.max(0, Math.ceil((new Date(p.endDate).getTime() - Date.now()) / 86400000)) : 180,
            },
            team: (p.sheets || []).length > 0 
              ? [{ id: '1', name: p.creator ? `${p.creator.firstName} ${p.creator.lastName}` : 'Admin', role: 'Creator' }]
              : [],
            risks: { level: (p.progressPercentage < 30 ? 'low' : p.progressPercentage < 70 ? 'medium' : 'high') as 'low' | 'medium' | 'high' | 'critical', count: 1 },
            milestones: [
              { id: `${p.id}-m1`, title: `${p.name} - Phase 1`, dueDate: p.endDate || new Date(Date.now() + 90*86400000).toISOString(), status: (p.progressPercentage >= 50 ? 'completed' : 'pending') as 'pending' | 'completed' | 'overdue' },
            ],
          }))
        : [
        {
          id: '1',
          name: 'Office Complex Alpha',
          status: 'active' as const,
          progress: 65,
          budget: {
            allocated: 2500000,
            spent: 1625000,
            remaining: 875000
          },
          timeline: {
            startDate: '2024-01-15',
            endDate: '2024-08-30',
            daysRemaining: 145
          },
          team: [
            { id: '1', name: 'John Senior', role: 'L2 Senior Engineer' },
            { id: '2', name: 'Mike Ground', role: 'Ground Manager' },
            { id: '3', name: 'Sarah Junior', role: 'L3 Junior Engineer' }
          ],
          risks: { level: 'medium' as const, count: 3 },
          milestones: [
            { id: '1', title: 'Foundation Complete', dueDate: '2024-03-01', status: 'completed' as const },
            { id: '2', title: 'Structural Framework', dueDate: '2024-05-15', status: 'pending' as const },
            { id: '3', title: 'Interior Fit-out', dueDate: '2024-07-30', status: 'pending' as const }
          ]
        },
        {
          id: '2',
          name: 'Residential Tower Beta',
          status: 'planning' as const,
          progress: 15,
          budget: {
            allocated: 4200000,
            spent: 630000,
            remaining: 3570000
          },
          timeline: {
            startDate: '2024-03-01',
            endDate: '2024-12-31',
            daysRemaining: 298
          },
          team: [
            { id: '4', name: 'Lisa Tech', role: 'L2 Senior Engineer' },
            { id: '5', name: 'Tom Field', role: 'Ground Manager' }
          ],
          risks: { level: 'low' as const, count: 1 },
          milestones: [
            { id: '4', title: 'Planning Phase Complete', dueDate: '2024-02-28', status: 'pending' as const },
            { id: '5', title: 'Permits Approved', dueDate: '2024-04-15', status: 'pending' as const }
          ]
        }
      ];

      setProjects(transformedProjects);

      setResources([
        { id: '1', name: 'Tower Crane #1', type: 'equipment', status: 'allocated', currentProject: 'Office Complex Alpha', cost: 1200, utilization: 85 },
        { id: '2', name: 'Concrete Mixer', type: 'equipment', status: 'available', cost: 800, utilization: 0 },
        { id: '3', name: 'Steel Beams (Grade A)', type: 'material', status: 'allocated', currentProject: 'Office Complex Alpha', cost: 45000, utilization: 70 },
        { id: '4', name: 'Welding Team', type: 'personnel', status: 'allocated', currentProject: 'Office Complex Alpha', cost: 2400, utilization: 90 }
      ]);
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'planning': return 'primary';
      case 'on_hold': return 'warning';
      case 'completed': return 'info';
      default: return 'default';
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'primary';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const StatCard = ({ title, value, subtitle, icon, color = 'primary' }: any) => (
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
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box sx={{ color: `${color}.main` }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  const renderOverview = () => {
    const totalBudget = projects.reduce((sum, p) => sum + p.budget.allocated, 0);
    const totalSpent = projects.reduce((sum, p) => sum + p.budget.spent, 0);
    const activeProjects = projects.filter(p => p.status === 'active').length;
    const avgProgress = Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / projects.length);

    return (
      <Box>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Active Projects"
              value={activeProjects}
              subtitle={`${projects.length} total projects`}
              icon={<ProjectIcon fontSize="large" />}
              color="primary"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Budget"
              value={`$${(totalBudget / 1000000).toFixed(1)}M`}
              subtitle={`$${(totalSpent / 1000000).toFixed(1)}M spent`}
              icon={<BudgetIcon fontSize="large" />}
              color="success"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Avg Progress"
              value={`${avgProgress}%`}
              subtitle="Across all projects"
              icon={<ProgressIcon fontSize="large" />}
              color="info"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Team Members"
              value={projects.reduce((sum, p) => sum + p.team.length, 0)}
              subtitle="Across all projects"
              icon={<TeamIcon fontSize="large" />}
              color="warning"
            />
          </Grid>
        </Grid>

        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="h6">Project Manager Dashboard</Typography>
          <Typography variant="body2">
            Oversee project timelines, manage resources, coordinate teams, and ensure successful project delivery.
          </Typography>
        </Alert>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <ProjectIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Project Status Overview
                </Typography>
                {projects.map((project) => (
                  <Box key={project.id} sx={{ mb: 3 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle1">{project.name}</Typography>
                      <Chip
                        label={project.status.replace('_', ' ').toUpperCase()}
                        color={getStatusColor(project.status) as any}
                        size="small"
                      />
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={project.progress} 
                      sx={{ mb: 1 }}
                      color={getStatusColor(project.status) as any}
                    />
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={4}>
                        <Typography variant="body2" color="text.secondary">
                          Progress: {project.progress}%
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Typography variant="body2" color="text.secondary">
                          Budget: ${(project.budget.spent / 1000).toFixed(0)}K / ${(project.budget.allocated / 1000).toFixed(0)}K
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Typography variant="body2" color="text.secondary">
                          Days remaining: {project.timeline.daysRemaining}
                        </Typography>
                      </Grid>
                    </Grid>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
                      <AvatarGroup max={4}>
                        {project.team.map((member) => (
                          <Avatar key={member.id} sx={{ width: 24, height: 24 }}>
                            {member.name.charAt(0)}
                          </Avatar>
                        ))}
                      </AvatarGroup>
                      <Chip
                        label={`${project.risks.count} ${project.risks.level.toUpperCase()} RISK(S)`}
                        color={getRiskColor(project.risks.level) as any}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} lg={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <TimelineIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Upcoming Milestones
                </Typography>
                <List>
                  {projects.flatMap(p => p.milestones.filter(m => m.status === 'pending')).slice(0, 5).map((milestone) => (
                    <ListItem key={milestone.id} divider>
                      <ListItemIcon>
                        <CalendarIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary={milestone.title}
                        secondary={`Due: ${new Date(milestone.dueDate).toLocaleDateString()}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    );
  };

  const renderProjects = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Project Management</Typography>
        <Button variant="contained" startIcon={<AddIcon />}>
          New Project
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Project Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Progress</TableCell>
              <TableCell>Budget</TableCell>
              <TableCell>Timeline</TableCell>
              <TableCell>Team</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Typography variant="subtitle2">{project.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {project.risks.count} risks • {project.milestones.length} milestones
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={project.status.replace('_', ' ').toUpperCase()}
                    color={getStatusColor(project.status) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <LinearProgress 
                      variant="determinate" 
                      value={project.progress} 
                      sx={{ flexGrow: 1, height: 8 }}
                    />
                    <Typography variant="body2">{project.progress}%</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    ${(project.budget.spent / 1000).toFixed(0)}K / ${(project.budget.allocated / 1000).toFixed(0)}K
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {Math.round((project.budget.spent / project.budget.allocated) * 100)}% used
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {project.timeline.daysRemaining} days left
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Due: {new Date(project.timeline.endDate).toLocaleDateString()}
                  </Typography>
                </TableCell>
                <TableCell>
                  <AvatarGroup max={3}>
                    {project.team.map((member) => (
                      <Avatar key={member.id} sx={{ width: 32, height: 32 }}>
                        {member.name.charAt(0)}
                      </Avatar>
                    ))}
                  </AvatarGroup>
                </TableCell>
                <TableCell>
                  <IconButton size="small" color="primary" onClick={() => navigate(`/project/${project.id}`)} title="View Project Details">
                    <ViewIcon />
                  </IconButton>
                  <IconButton size="small">
                    <EditIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderResources = () => (
    <Box>
      <Typography variant="h5" gutterBottom>Resource Management</Typography>
      <Grid container spacing={3}>
        {resources.map((resource) => (
          <Grid item xs={12} sm={6} md={4} key={resource.id}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>{resource.name}</Typography>
                <Chip
                  label={resource.type.toUpperCase()}
                  color="primary"
                  variant="outlined"
                  size="small"
                  sx={{ mb: 1 }}
                />
                <Chip
                  label={resource.status.replace('_', ' ').toUpperCase()}
                  color={resource.status === 'available' ? 'success' : resource.status === 'allocated' ? 'primary' : 'warning'}
                  size="small"
                  sx={{ mb: 2, ml: 1 }}
                />
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Cost: ${resource.cost}/day
                </Typography>
                {resource.currentProject && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Assigned to: {resource.currentProject}
                  </Typography>
                )}
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Utilization: {resource.utilization}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={resource.utilization}
                    sx={{ mt: 1 }}
                    color={resource.utilization >= 80 ? 'success' : resource.utilization >= 50 ? 'primary' : 'warning'}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );

  return (
    <DashboardLayout 
      title="Project Manager"
      menuItems={[
        { label: 'Dashboard', path: '/project-manager', icon: <DashboardIcon /> },
        { label: 'Projects', path: '/project-manager/projects', icon: <BusinessIcon /> },
        { label: 'My Sheets', path: '/my-sheets', icon: <TaskIcon /> },
        { label: 'My Tasks', path: '/my-tasks', icon: <ReportsIcon /> },
      ]}
    >
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="Overview" />
          <Tab label="Projects" />
          <Tab label="Resources" />
        </Tabs>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" mt={4}>
          <Typography>Loading...</Typography>
        </Box>
      ) : (
        <>
          {tabValue === 0 && renderOverview()}
          {tabValue === 1 && renderProjects()}
          {tabValue === 2 && renderResources()}
        </>
      )}
    </DashboardLayout>
  );
};

export default ProjectManagerDashboard;