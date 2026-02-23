// ================================================================
// USERS API (services/usersAPI.ts)
// ================================================================
// PURPOSE: User management API calls (admin only).
//
// METHODS:
//   getUsers()           — List all users (paginated)
//   getUser(id)          — Get user details
//   createUser(data)     — Create a new user
//   updateUser(id, data) — Update user info
//   deleteUser(id)       — Delete a user
//   getUsersByRole(role) — Get users filtered by role
//   getActiveUsers()     — Get all active users
//
// USED BY: Admin dashboard user management panel
// ================================================================

import { apiClient } from './api';

// ─── LOCAL TYPE DEFINITIONS ───
// A user account as stored in the database (snake_case column names)
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'L1_ADMIN' | 'L2_SENIOR_ENGINEER' | 'L3_JUNIOR_ENGINEER' | 'PROJECT_MANAGER' | 'GROUND_MANAGER' | 'CEO';
  first_name: string;
  last_name: string;
  is_active: boolean;       // false = account disabled (can't log in)
  created_at: string;
  updated_at: string;
}

// Summary stats about all users in the system
export interface UserStats {
  totalUsers: number;            // Total accounts
  activeUsers: number;           // Currently active accounts
  usersByRole: Record<string, number>;  // e.g., { "L1_ADMIN": 2, "CEO": 1 }
  recentRegistrations: number;   // New users in the last week
}

// ─── USERS API SERVICE ───
// Admin-only operations for managing user accounts.
// Regular users can only update their own profile.
export const usersAPI = {

  // GET /api/users → List all users (admin only)
  getAll: async (): Promise<User[]> => {
    const response = await apiClient.get('/users');
    return response.data;
  },

  // GET /api/users/:id → Get one user's details
  getById: async (id: string): Promise<User> => {
    const response = await apiClient.get(`/users/${id}`);
    return response.data;
  },

  // POST /api/users → Create a new user account (admin only)
  create: async (userData: Partial<User>): Promise<User> => {
    const response = await apiClient.post('/users', userData);
    return response.data;
  },

  // PUT /api/users/:id → Update user info (admin can update anyone)
  update: async (id: string, userData: Partial<User>): Promise<User> => {
    const response = await apiClient.put(`/users/${id}`, userData);
    return response.data;
  },

  // DELETE /api/users/:id → Delete a user account permanently
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },

  // GET /api/users/stats → Get user statistics for admin dashboard
  getStats: async (): Promise<UserStats> => {
    const response = await apiClient.get('/users/stats');
    return response.data;
  },

  // PATCH /api/users/:id/profile → Update profile (user can update their own)
  updateProfile: async (id: string, profileData: Partial<User>): Promise<User> => {
    const response = await apiClient.patch(`/users/${id}/profile`, profileData);
    return response.data;
  },

  // POST /api/users/:id/change-password → Change password (requires old password)
  changePassword: async (id: string, oldPassword: string, newPassword: string): Promise<void> => {
    await apiClient.post(`/users/${id}/change-password`, {
      oldPassword,
      newPassword,
    });
  },

  // PATCH /api/users/:id/toggle-active → Enable/disable an account
  // If active, deactivate. If inactive, activate.
  toggleActive: async (id: string): Promise<User> => {
    const response = await apiClient.patch(`/users/${id}/toggle-active`);
    return response.data;
  },
};

export default usersAPI;