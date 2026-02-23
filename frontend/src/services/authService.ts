// ================================================================
// AUTH SERVICE (services/authService.ts)
// ================================================================
// PURPOSE: Handles all authentication-related API calls.
//
// METHODS:
//   login(email, password)  — POST /api/auth/login
//   register(data)          — POST /api/auth/register
//   getProfile()            — GET /api/auth/me
//   updateProfile(data)     — PUT /api/auth/profile
//   changePassword(data)    — PUT /api/auth/change-password
//   getAllUsers()           — GET /api/auth/all-users (admin only)
//
// ROLE HELPERS:
//   isAdmin(), isCEO(), isEngineer(), canManageSheets(), etc.
//
// TOKEN MANAGEMENT:
//   Stores JWT in localStorage, attaches to every API request
//
// USED BY: contexts/AuthContext.tsx, admin dashboard
// ================================================================

import { apiClient } from './api';                            // The HTTP client (see api.ts)
import { User, LoginForm, ApiResponse } from '../types';       // TypeScript types

// ─── AUTH SERVICE CLASS ───
// This class handles all login/logout/profile API calls.
// It's a "service" — it doesn't render anything, just talks to the backend.
// Used by AuthContext.tsx to perform auth operations.
class AuthService {
  private token: string = '';  // In-memory copy of the JWT token

  // ─── TOKEN MANAGEMENT ───
  // JWT token is stored in TWO places:
  //   1. localStorage (survives page refresh)
  //   2. this.token (fast in-memory access)
  setToken(token: string) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);    // Save for page refresh
    } else {
      localStorage.removeItem('token');         // Clear on logout
    }
  }

  getToken(): string {
    return this.token || localStorage.getItem('token') || '';  // Check both places
  }

  // ─── LOGIN ───
  // Sends email + password to POST /api/auth/login
  // If successful, returns { user, token }
  // If failed, throws an error (caught by AuthContext)
  async login(credentials: LoginForm): Promise<ApiResponse<{ user: User; token: string }>> {
    try {
      const response = await apiClient.post('/auth/login', credentials);
      
      // The backend returns: { message: "Login successful", user: {...}, token: "jwt..." }
      if (response.data && response.data.user && response.data.token) {
        return {
          success: true,
          data: {
            user: response.data.user,    // The user object (id, name, role, etc.)
            token: response.data.token   // The JWT token for future API calls
          },
          message: response.data.message || 'Login successful'
        };
      } else {
        return {
          success: false,
          message: 'Invalid response format'  // Server returned unexpected data
        };
      }
    } catch (error: any) {
      throw error;  // Let AuthContext handle the error
    }
  }

  async register(userData: any): Promise<ApiResponse<{ user: User; token: string }>> {
    try {
      const response = await apiClient.post<ApiResponse<{ user: User; token: string }>>(
        '/auth/register',
        userData
      );
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  // ─── GET CURRENT USER ───
  // Calls GET /api/auth/me to get the profile of whoever owns the current token.
  // Used on page load to restore the login session from a saved token.
  async getCurrentUser(): Promise<ApiResponse<{ user: User }>> {
    try {
      const response = await apiClient.get('/auth/me');
      
      // Backend returns: { user: { id, firstName, lastName, role, ... } }
      if (response.data && response.data.user) {
        return {
          success: true,
          data: { user: response.data.user }
        };
      } else {
        return {
          success: false,
          message: 'Invalid response format'
        };
      }
    } catch (error: any) {
      throw error;
    }
  }

  async updateProfile(userData: Partial<User>): Promise<ApiResponse<{ user: User }>> {
    try {
      const response = await apiClient.put<ApiResponse<{ user: User }>>(
        '/auth/profile',
        userData
      );
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  async changePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<ApiResponse> {
    try {
      const response = await apiClient.put<ApiResponse>('/auth/change-password', data);
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  async logout(): Promise<ApiResponse> {
    try {
      const response = await apiClient.post<ApiResponse>('/auth/logout');
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    try {
      const response = await apiClient.post<ApiResponse<{ token: string }>>('/auth/refresh');
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // ─── ROLE-BASED ACCESS CONTROL HELPERS ───
  // These helper methods check what a user is allowed to do.
  // They're used throughout the UI to show/hide buttons and features.
  //
  // Example: if (authService.canEditSheets(user)) { show edit button }

  // Does this user have EXACTLY this role?
  hasRole(user: User | null, role: string): boolean {
    return user?.role === role;
  }

  // Does this user have ANY of these roles?
  hasAnyRole(user: User | null, roles: string[]): boolean {
    return user ? roles.includes(user.role) : false;
  }

  // ADMIN-ONLY features (user management, system settings)
  canAccessAdminFeatures(user: User | null): boolean {
    return this.hasRole(user, 'L1_ADMIN');
  }

  // Who can CREATE new sheets? Only admin.
  canCreateSheets(user: User | null): boolean {
    return this.hasRole(user, 'L1_ADMIN');
  }

  // Who can EDIT cells in sheets? Admin + engineers + ground manager
  canEditSheets(user: User | null): boolean {
    return this.hasAnyRole(user, ['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'GROUND_MANAGER']);
  }

  // Who can see ALL projects? Admin + PM + CEO
  canViewAllProjects(user: User | null): boolean {
    return this.hasAnyRole(user, ['L1_ADMIN', 'PROJECT_MANAGER', 'CEO']);
  }

  // Who can create/delete users? Admin + PM
  canManageUsers(user: User | null): boolean {
    return this.hasAnyRole(user, ['L1_ADMIN', 'PROJECT_MANAGER']);
  }

  // Who can approve submitted data? Admin + senior engineer
  canApproveData(user: User | null): boolean {
    return this.hasAnyRole(user, ['L1_ADMIN', 'L2_SENIOR_ENGINEER']);
  }

  // Who can lock/unlock sheets? Only admin.
  canLockSheets(user: User | null): boolean {
    return this.hasRole(user, 'L1_ADMIN');
  }

  // ─── ROLE DISPLAY HELPERS ───
  // Convert internal role codes to human-readable names for the UI.
  // Example: 'L1_ADMIN' → 'Head Officer' (shown in the sidebar/profile)
  getRoleName(role: string): string {
    const roleNames: Record<string, string> = {
      'L1_ADMIN': 'Head Officer',              // System admin
      'L2_SENIOR_ENGINEER': 'Planning Manager', // Senior engineer
      'L3_JUNIOR_ENGINEER': 'Site Engineer',     // Junior engineer
      'PROJECT_MANAGER': 'Project Manager',
      'GROUND_MANAGER': 'Ground Manager',        // Site supervisor
      'CEO': 'CEO',                              // Executive (view-only)
    };
    return roleNames[role] || role;  // Return raw code if not found
  }

  // Color for each role (used in badges, chips, and status indicators)
  getRoleColor(role: string): string {
    const roleColors: Record<string, string> = {
      'L1_ADMIN': '#f44336',            // Red — most power, stands out
      'L2_SENIOR_ENGINEER': '#1976d2',  // Blue — engineering blue
      'L3_JUNIOR_ENGINEER': '#4caf50',  // Green — growing/learning
      'PROJECT_MANAGER': '#ff9800',     // Orange — management
      'GROUND_MANAGER': '#9c27b0',      // Purple — site/field
      'CEO': '#212121',                 // Dark — executive
    };
    return roleColors[role] || '#757575';  // Grey fallback
  }

  // Dashboard URL for each role (used for redirects after login)
  getDashboardRoute(role: string): string {
    const routes: Record<string, string> = {
      'L1_ADMIN': '/admin',
      'L2_SENIOR_ENGINEER': '/senior-engineer',
      'L3_JUNIOR_ENGINEER': '/junior-engineer',
      'PROJECT_MANAGER': '/project-manager',
      'GROUND_MANAGER': '/ground-manager',
      'CEO': '/ceo',
    };
    return routes[role] || '/';  // Fallback to home page
  }
}

export const authService = new AuthService();