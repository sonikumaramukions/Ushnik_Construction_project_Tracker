// ================================================================
// ANALYTICS API (services/analyticsAPI.ts)
// ================================================================
// PURPOSE: API calls for dashboard analytics and audit logs.
//
// PROVIDES:
//   analyticsAPI   — Analytics endpoints (executive summary, trends)
//   auditLogAPI    — Audit log endpoints (system activity)
//   dashboardAPI   — Dashboard-specific data
//   notificationsAPI — Notification endpoints (bell icon)
//
// USED BY: Admin dashboard, CEO dashboard
// ================================================================

import { apiClient } from './api';

// ─── AUDIT LOG TYPE ───
// A record of who did what in the system.
// Every important action creates an audit log entry.
export interface AuditLog {
  id: string;
  user_id: string;        // Who did it
  action: string;         // What they did (e.g., "UPDATE", "CREATE")
  resource: string;       // What they acted on (e.g., "Sheet", "User")
  resource_id: string;    // ID of the specific item
  old_values?: any;       // Previous values (for change tracking)
  new_values?: any;       // New values
  created_at: string;     // When the action happened
  user?: {                // User info (joined from DB)
    first_name: string;
    last_name: string;
    email: string;
  };
}

// ─── DASHBOARD STATS TYPE ───
// Everything the admin dashboard overview page needs in one object.
export interface DashboardStats {
  users: {
    total: number;                      // Total user accounts
    active: number;                     // Active users
    byRole: Record<string, number>;     // Users per role
  };
  projects: {
    total: number;                      // Total projects
    active: number;                     // Currently active
    completed: number;                  // Finished projects
    totalBudget: number;                // Sum of all budgets
    averageProgress: number;            // Average % completion
  };
  sheets: {
    total: number;                      // Total sheets
    active: number;                     // Active sheets
    pendingApprovals: number;           // Cells waiting for approval
  };
  systemHealth: {                       // Server health metrics
    status: 'GOOD' | 'WARNING' | 'CRITICAL';
    uptime: number;                     // Seconds since server started
    dbConnections: number;              // Active database connections
    memoryUsage: number;                // RAM usage in MB
    diskUsage: number;                  // Disk usage in MB
  };
}

// What a specific user has been doing recently
export interface UserActivity {
  userId: string;
  actionsToday: number;           // Actions performed today
  actionsThisWeek: number;        // Actions this week
  lastActive: string;             // Last activity timestamp
  mostUsedFeatures: string[];     // Top features used
}

// ─── ANALYTICS API SERVICE ───
// Dashboard statistics and system monitoring.
// USED BY: Admin dashboard overview tab
export const analyticsAPI = {

  // GET /api/analytics/dashboard → Get all dashboard stats in one call
  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await apiClient.get('/analytics/dashboard');
    return response.data;
  },

  // GET /api/analytics/user/:userId/activity → See what a specific user has been doing
  getUserActivity: async (userId: string): Promise<UserActivity> => {
    const response = await apiClient.get(`/analytics/user/${userId}/activity`);
    return response.data;
  },

  // GET /api/analytics/project/:projectId → Analytics for one project
  getProjectAnalytics: async (projectId: string): Promise<any> => {
    const response = await apiClient.get(`/analytics/project/${projectId}`);
    return response.data;
  },

  // GET /api/analytics/health → Server health check
  getSystemHealth: async (): Promise<DashboardStats['systemHealth']> => {
    const response = await apiClient.get('/analytics/health');
    return response.data;
  },

  // GET /api/analytics/usage?timeframe=week → Usage stats over time
  getUsageStats: async (timeframe: 'day' | 'week' | 'month'): Promise<any> => {
    const response = await apiClient.get(`/analytics/usage?timeframe=${timeframe}`);
    return response.data;
  },
};

// ─── AUDIT LOG API SERVICE ───
// Browse and filter the system's audit trail.
// USED BY: Admin dashboard activity/audit tab
export const auditAPI = {

  // GET /api/audit → List audit logs with optional filters
  // You can filter by: user, action type, resource type, date range
  getAll: async (params?: {
    limit?: number;      // How many to return (default: 50)
    offset?: number;     // Skip this many (for pagination)
    userId?: string;     // Filter by specific user
    action?: string;     // Filter by action ("CREATE", "UPDATE", etc.)
    resource?: string;   // Filter by resource ("Sheet", "User", etc.)
    dateFrom?: string;   // Start date
    dateTo?: string;     // End date
  }): Promise<{ logs: AuditLog[]; total: number }> => {
    // Build URL query parameters from the filter options
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    
    const response = await apiClient.get(`/audit${queryParams.toString() ? '?' + queryParams.toString() : ''}`);
    return response.data;
  },

  // GET /api/audit/user/:userId → Get all actions by a specific user
  getByUser: async (userId: string, limit = 100): Promise<AuditLog[]> => {
    const response = await apiClient.get(`/audit/user/${userId}?limit=${limit}`);
    return response.data;
  },

  // GET /api/audit/resource/:resource/:resourceId → Get all actions on a specific item
  // Example: "Show me everything that happened to Sheet abc123"
  getByResource: async (resource: string, resourceId: string): Promise<AuditLog[]> => {
    const response = await apiClient.get(`/audit/resource/${resource}/${resourceId}`);
    return response.data;
  },

  // GET /api/audit/system → Get system-level events (server restarts, etc.)
  getSystemEvents: async (limit = 50): Promise<AuditLog[]> => {
    const response = await apiClient.get(`/audit/system?limit=${limit}`);
    return response.data;
  },
};

export default { analyticsAPI, auditAPI };