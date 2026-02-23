// ================================================================
// ADMIN OVERVIEW (pages/dashboards/components/AdminOverview.tsx)
// ================================================================
// PURPOSE: The "Overview" tab of the Admin Dashboard.
//
// DISPLAYS:
//   - Total counts: users, projects, sheets, active sessions
//   - Recent activity feed (last 10 actions)
//   - System health indicators
//   - Quick action buttons (create user, create project)
//
// DATA: Calls analyticsAPI for dashboard stats
// PARENT: AdminDashboard.tsx (rendered in "Overview" tab)
// ================================================================

import React, { useEffect, useState } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
} from '@mui/material';
import {
  TrendingUp,
  Assessment,
  People,
  Business,
  Add as AddIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { Project, DashboardStats } from '../../../types';
import LoadingSpinner from '../../../components/LoadingSpinner';
import { apiClient } from '../../../services/api';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  trend?: string;
}

// ─── Helper: A stat card with value, title, icon, and optional trend ───
const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, color, trend }) => (
  <Card elevation={2}>
    <CardContent>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box>
          {/* Large number (e.g. "12") */}
          <Typography variant="h4" component="div" fontWeight="bold">
            {value}
          </Typography>
          {/* Label text (e.g. "Active Projects") */}
          <Typography color="text.secondary" variant="body2">
            {title}
          </Typography>
          {/* Optional trend chip (e.g. "+15%") */}
          {trend && (
            <Chip 
              label={trend} 
              size="small" 
              color="success" 
              sx={{ mt: 1 }}
            />
          )}
        </Box>
        {/* Colored icon circle */}
        <Box
          sx={{
            backgroundColor: `${color}20`,  // 20 = semi-transparent
            borderRadius: 2,
            p: 1.5,
            color: color,
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

// ─── ADMIN OVERVIEW COMPONENT ───
// Shows stat cards + recent projects table on the "Overview" tab.
const AdminOverview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);              // Recent projects
  const [stats, setStats] = useState<DashboardStats | null>(null);      // Summary stats
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch projects
      const projectsResponse = await apiClient.get('/projects?limit=5');
      if (projectsResponse.data.projects) {
        setProjects(projectsResponse.data.projects);
      }

      // Mock stats for now (would be from API in real app)
      setStats({
        totalProjects: 15,
        activeProjects: 8,
        completedProjects: 5,
        totalSheets: 45,
        pendingApprovals: 12,
        recentActivity: [],
      });

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return 'primary';
      case 'COMPLETED':
        return 'success';
      case 'ON_HOLD':
        return 'warning';
      case 'CANCELLED':
        return 'error';
      default:
        return 'default';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return '#f44336';
      case 'HIGH':
        return '#ff9800';
      case 'MEDIUM':
        return '#2196f3';
      case 'LOW':
        return '#4caf50';
      default:
        return '#757575';
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          Dashboard Overview
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/admin/projects/new')}
          size="large"
        >
          New Project
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Projects"
            value={stats?.totalProjects || 0}
            icon={<Business />}
            color="#1976d2"
            trend="+2 this month"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Active Projects"
            value={stats?.activeProjects || 0}
            icon={<TrendingUp />}
            color="#4caf50"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Sheets"
            value={stats?.totalSheets || 0}
            icon={<Assessment />}
            color="#ff9800"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Pending Approvals"
            value={stats?.pendingApprovals || 0}
            icon={<People />}
            color="#f44336"
          />
        </Grid>
      </Grid>

      {/* Recent Projects */}
      <Card elevation={2}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight="bold">
              Recent Projects
            </Typography>
            <Button
              variant="text"
              onClick={() => navigate('/admin/projects')}
              size="small"
            >
              View All
            </Button>
          </Box>
          
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Project Name</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Priority</strong></TableCell>
                  <TableCell><strong>Progress</strong></TableCell>
                  <TableCell><strong>Budget</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id} hover>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {project.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {project.location}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={project.status.replace('_', ' ')}
                        color={getStatusColor(project.status) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={project.priority}
                        size="small"
                        sx={{
                          bgcolor: `${getPriorityColor(project.priority)}20`,
                          color: getPriorityColor(project.priority),
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ width: '100px' }}>
                        <LinearProgress
                          variant="determinate"
                          value={project.progressPercentage}
                          sx={{ mb: 0.5 }}
                        />
                        <Typography variant="caption">
                          {project.progressPercentage}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        ${(project.budget || 0).toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Spent: ${project.actualCost.toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/project/${project.id}`)}
                      >
                        <ViewIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default AdminOverview;