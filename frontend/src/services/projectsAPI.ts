// ================================================================
// PROJECTS API (services/projectsAPI.ts)
// ================================================================
// PURPOSE: All project-related API calls (CRUD).
//
// METHODS:
//   getProjects()          — List all projects (paginated)
//   getProject(id)         — Get project details + sheets
//   createProject(data)    — Create a new project
//   updateProject(id, data) — Update project info
//   deleteProject(id)      — Delete a project
//   getProjectSheets(id)   — Get sheets for a project
//   getProjectTeam(id)     — Get team members
//   addTeamMember(id, data) — Add user to project team
//
// USED BY: Project detail page, admin dashboard, project manager dashboard
// ================================================================

import { apiClient } from './api';

// ─── LOCAL TYPE DEFINITIONS ───
// These types match backend database column names (snake_case).

// A construction project (e.g., "Highway Bridge Phase 2")
export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  start_date: string;       // When construction begins
  end_date: string;         // Expected completion date
  location?: string;        // Physical site location
  budget: number;           // Total budget amount
  created_by_id: string;    // User who created this project
  created_at: string;
  updated_at: string;
}

// Summary statistics across all projects (shown on dashboard cards)
export interface ProjectStats {
  totalProjects: number;           // Total count of all projects
  activeProjects: number;          // Projects with status IN_PROGRESS
  completedProjects: number;       // Finished projects
  totalBudget: number;             // Sum of all project budgets
  averageProgress: number;         // Average completion % across projects
  projectsByStatus: Record<string, number>;    // e.g., { "PLANNING": 3, "IN_PROGRESS": 5 }
  projectsByPriority: Record<string, number>;  // e.g., { "HIGH": 2, "MEDIUM": 4 }
}

// Progress details for a single project
export interface ProjectProgress {
  projectId: string;
  percentage: number;        // 0-100% completion
  tasksCompleted: number;    // Tasks done
  totalTasks: number;        // Total tasks
  milestonesReached: number; // Milestones achieved
  totalMilestones: number;   // Total milestones
}

// ─── PROJECTS API SERVICE ───
// All these methods call the backend REST API for project operations.
export const projectsAPI = {

  // ---- PROJECT CRUD ----

  // GET /api/projects → List all projects the user has access to
  getAll: async (): Promise<Project[]> => {
    const response = await apiClient.get('/projects');
    return response.data;
  },

  // GET /api/projects/:id → Get one project with all its details
  getById: async (id: string): Promise<Project> => {
    const response = await apiClient.get(`/projects/${id}`);
    return response.data;
  },

  // POST /api/projects → Create a new project (Admin/PM only)
  create: async (projectData: Partial<Project>): Promise<Project> => {
    const response = await apiClient.post('/projects', projectData);
    return response.data;
  },

  // PUT /api/projects/:id → Update project info (name, dates, budget, etc.)
  update: async (id: string, projectData: Partial<Project>): Promise<Project> => {
    const response = await apiClient.put(`/projects/${id}`, projectData);
    return response.data;
  },

  // DELETE /api/projects/:id → Delete a project permanently
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/projects/${id}`);
  },

  // ---- STATS & PROGRESS ----

  // GET /api/projects/stats → Get summary statistics (for dashboard cards)
  getStats: async (): Promise<ProjectStats> => {
    const response = await apiClient.get('/projects/stats');
    return response.data;
  },

  // GET /api/projects/user/:userId → Get projects assigned to a specific user
  getUserProjects: async (userId: string): Promise<Project[]> => {
    const response = await apiClient.get(`/projects/user/${userId}`);
    return response.data;
  },

  // GET /api/projects/:projectId/progress → Get completion % and milestones
  getProgress: async (projectId: string): Promise<ProjectProgress> => {
    const response = await apiClient.get(`/projects/${projectId}/progress`);
    return response.data;
  },

  // ---- QUICK UPDATE METHODS ----
  // These update just one field without sending the whole project object.

  // PATCH /api/projects/:id/status → Change only the status
  updateStatus: async (id: string, status: Project['status']): Promise<Project> => {
    const response = await apiClient.patch(`/projects/${id}/status`, { status });
    return response.data;
  },

  // PATCH /api/projects/:id/priority → Change only the priority
  updatePriority: async (id: string, priority: Project['priority']): Promise<Project> => {
    const response = await apiClient.patch(`/projects/${id}/priority`, { priority });
    return response.data;
  },

  // ---- TEAM MANAGEMENT ----
  // Projects have team members (users assigned to work on them).

  // GET /api/projects/:projectId/team → List all team members
  getTeamMembers: async (projectId: string): Promise<any[]> => {
    const response = await apiClient.get(`/projects/${projectId}/team`);
    return response.data;
  },

  // POST /api/projects/:projectId/team → Add a user to the project team
  assignTeamMember: async (projectId: string, userId: string, role?: string): Promise<void> => {
    await apiClient.post(`/projects/${projectId}/team`, { userId, role });
  },

  // DELETE /api/projects/:projectId/team/:userId → Remove user from team
  removeTeamMember: async (projectId: string, userId: string): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}/team/${userId}`);
  },
};

export default projectsAPI;