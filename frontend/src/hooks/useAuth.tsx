// ================================================================
// USE AUTH HOOK (hooks/useAuth.tsx)
// ================================================================
// PURPOSE: Alternative authentication hook with permission support.
//
// This is a SEPARATE auth implementation from contexts/AuthContext.tsx.
// It adds a 'permissions' array to the user type for finer-grained
// access control.
//
// PROVIDES:
//   useAuth() hook  — Returns { user, login, logout, register, isLoading }
//   AuthProvider    — Wraps the app with auth state
//   AuthContext     — Raw context (rarely used directly)
//
// NOTE: The main app uses contexts/AuthContext.tsx. This file exists
// as an alternative implementation.
// ================================================================

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { User } from '../services/usersAPI';     // Base User type from the users API
import { apiClient } from '../services/api';     // Axios instance for API calls
import toast from 'react-hot-toast';             // Pop-up notifications

// ─── TYPES ───

// Extended User type that includes a permissions array.
// This is what makes this hook different from contexts/AuthContext.tsx:
// it supports fine-grained permissions like ["edit_sheets", "manage_users"].
export interface AuthUser extends User {
  permissions: string[];  // e.g., ["create_project", "approve_cells"]
}

// The shape of our authentication state
interface AuthState {
  user: AuthUser | null;      // Current logged-in user (null if not logged in)
  token: string | null;       // JWT token (null if not logged in)
  isLoading: boolean;         // Are we checking authentication?
  isAuthenticated: boolean;   // Is the user verified as logged in?
  error: string | null;       // Error message if login/auth failed
}

// Actions that can change the auth state (like "commands" for the reducer)
type AuthAction =
  | { type: 'AUTH_LOADING' }                                              // Start checking auth
  | { type: 'AUTH_SUCCESS'; payload: { user: AuthUser; token: string } }  // Auth successful
  | { type: 'AUTH_FAILURE'; payload: string }                             // Auth failed
  | { type: 'LOGOUT' }                                                    // User logged out
  | { type: 'UPDATE_USER'; payload: AuthUser }                            // Profile updated
  | { type: 'CLEAR_ERROR' };                                              // Clear error message

// What the useAuth() hook returns — state + action functions
interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<AuthUser>) => Promise<void>;
  hasPermission: (permission: string) => boolean;  // Check if user has a specific permission
  hasRole: (role: AuthUser['role']) => boolean;     // Check if user has a specific role
  clearError: () => void;
}

// ─── INITIAL STATE ───
// On app start: try to restore token from localStorage
const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('authToken'),  // May be null or a saved token
  isLoading: true,     // Start as loading (will verify token)
  isAuthenticated: false,
  error: null,
};

// ─── AUTH REDUCER ───
// Handles state transitions based on dispatched actions.
// Think of it as a state machine: current state + action = new state.
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'AUTH_LOADING':    // Start loading spinner
      return { ...state, isLoading: true, error: null };
    case 'AUTH_SUCCESS':    // Login/restore succeeded
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'AUTH_FAILURE':    // Login/restore failed
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    case 'LOGOUT':          // User logged out
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    case 'UPDATE_USER':     // Profile was updated
      return { ...state, user: action.payload };
    case 'CLEAR_ERROR':     // Dismiss error message
      return { ...state, error: null };
    default:
      return state;
  }
};

// ─── CONTEXT ───
// Create a React Context to make auth state available throughout the app.
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── AUTH PROVIDER ───
// Wraps the app and provides auth state + actions to all child components.
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // On first render: try to restore the user session from a saved token
  useEffect(() => {
    initializeAuth();
  }, []);

  // Check if we have a saved token and if it's still valid
  const initializeAuth = async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      // No token saved → user is not logged in
      dispatch({ type: 'AUTH_FAILURE', payload: 'No token found' });
      return;
    }

    try {
      dispatch({ type: 'AUTH_LOADING' });
      // Ask the server "who am I?" using the saved token
      const response = await apiClient.get('/auth/me');
      // Build the user object with permissions
      const user: AuthUser = {
        ...response.data.user,
        permissions: response.data.permissions || [],
      };
      
      dispatch({ type: 'AUTH_SUCCESS', payload: { user, token } });
    } catch (error: any) {
      // Token is invalid or expired → clear it
      localStorage.removeItem('authToken');
      dispatch({ 
        type: 'AUTH_FAILURE', 
        payload: error.response?.data?.message || 'Authentication failed' 
      });
    }
  };

  // Log in with email + password
  const login = async (email: string, password: string): Promise<void> => {
    try {
      dispatch({ type: 'AUTH_LOADING' });
      
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, token, permissions } = response.data;
      
      // Save token for next time
      localStorage.setItem('authToken', token);
      
      const authUser: AuthUser = {
        ...user,
        permissions: permissions || [],
      };
      
      dispatch({ type: 'AUTH_SUCCESS', payload: { user: authUser, token } });
      toast.success(`Welcome back, ${user.first_name}!`);
      
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed';
      dispatch({ type: 'AUTH_FAILURE', payload: message });
      toast.error(message);
      throw error;
    }
  };

  // Log out: clear token and reset state
  const logout = () => {
    localStorage.removeItem('authToken');
    dispatch({ type: 'LOGOUT' });
    toast.success('Logged out successfully');
  };

  // Update the user's profile info
  const updateProfile = async (data: Partial<AuthUser>): Promise<void> => {
    if (!state.user) return;

    try {
      const response = await apiClient.put(`/users/${state.user.id}/profile`, data);
      const updatedUser = { ...state.user, ...response.data };
      dispatch({ type: 'UPDATE_USER', payload: updatedUser });
      toast.success('Profile updated successfully');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Profile update failed';
      toast.error(message);
      throw error;
    }
  };

  // Check if the user has a specific permission (e.g., "approve_cells")
  // L1_ADMIN always has all permissions.
  const hasPermission = (permission: string): boolean => {
    if (!state.user) return false;
    return state.user.permissions.includes(permission) || state.user.role === 'L1_ADMIN';
  };

  // Check if the user has a specific role (e.g., "CEO")
  const hasRole = (role: AuthUser['role']): boolean => {
    return state.user?.role === role;
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  // Bundle everything into the context value
  const value: AuthContextType = {
    ...state,
    login,
    logout,
    updateProfile,
    hasPermission,
    hasRole,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ─── USE AUTH HOOK ───
// Usage: const { user, login, logout, hasPermission } = useAuth();
// Must be called inside an <AuthProvider>.
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;