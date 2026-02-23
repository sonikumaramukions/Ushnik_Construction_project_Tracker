// ================================================================
// AUTH CONTEXT (contexts/AuthContext.tsx)
// ================================================================
// PURPOSE: Manages login/logout state for the ENTIRE application.
//
// React Context is like a "global variable" that any component can read.
// Instead of passing user info through 20 levels of props, any component
// can just call: const { user, login, logout } = useAuth();
//
// STATE:
//   user     — The currently logged-in user object (or null)
//   token    — The JWT token (stored in localStorage)
//   loading  — True while checking if user is already logged in
//
// ACTIONS:
//   login(email, password) — Calls /api/auth/login, saves token
//   logout()               — Removes token, clears user
//   register(data)         — Creates new account
//   updateProfile(data)    — Updates user's profile
//
// AUTO-RESTORE: On page load, checks localStorage for a saved token
//   and fetches the user profile from /api/auth/me
//
// USED BY: Every component that needs to know who's logged in
// ================================================================

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { User, LoginForm } from '../types';      // TypeScript type definitions
import { authService } from '../services/authService';        // API calls for login/logout
// apiClient imported via authService
import toast from 'react-hot-toast';                          // Popup notifications

// ─── AUTH STATE SHAPE ───
// This is what the auth state looks like at any given time.
// Think of it as a snapshot: { who's logged in?, what's the token?, is it loading?, any errors? }
interface AuthState {
  user: User | null;     // The logged-in user object (null if not logged in)
  token: string | null;  // JWT token string (null if not logged in)
  loading: boolean;      // True while checking saved token on page load
  error: string | null;  // Error message if login failed
}

// ─── AUTH ACTIONS ───
// These are the ONLY ways the auth state can change.
// Think of them as "commands" you send to the reducer:
//   AUTH_START   = "I'm about to try logging in" (show loading spinner)
//   AUTH_SUCCESS = "Login worked!" (save user + token)
//   AUTH_FAILURE = "Login failed" (clear user, show error)
//   LOGOUT       = "User clicked logout" (clear everything)
//   UPDATE_USER  = "User updated their profile" (update user data)
//   CLEAR_ERROR  = "Dismiss the error message"
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'CLEAR_ERROR' };

// ─── INITIAL STATE ───
// When the app first loads, check if there's a saved token in localStorage.
// If there is, the useEffect below will try to restore the login session.
const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),  // Check for saved token
  loading: true,   // Start loading (will check if token is still valid)
  error: null,
};

// ─── AUTH REDUCER ───
// A "reducer" is a function that takes the current state + an action,
// and returns the NEW state. It's like a state machine:
//   Current State + Action = New State
//
// WHY USE useReducer INSTEAD OF useState?
//   When you have complex state with many possible changes (login, logout,
//   error, loading...), a reducer keeps the logic organized in one place
//   instead of having 4 separate useState calls.
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'AUTH_START':       // Starting login attempt
      return {
        ...state,            // Keep existing state
        loading: true,       // Show loading spinner
        error: null,         // Clear any previous errors
      };
    case 'AUTH_SUCCESS':     // Login succeeded!
      return {
        ...state,
        user: action.payload.user,   // Save the user object
        token: action.payload.token, // Save the JWT token
        loading: false,              // Stop loading
        error: null,                 // Clear errors
      };
    case 'AUTH_FAILURE':     // Login failed
      return {
        ...state,
        user: null,                  // No user logged in
        token: null,                 // No valid token
        loading: false,              // Stop loading
        error: action.payload,       // Store error message (e.g., "Invalid password")
      };
    case 'LOGOUT':           // User clicked logout
      return {
        ...state,
        user: null,          // Clear user
        token: null,         // Clear token
        loading: false,
        error: null,         // Clear errors
      };
    case 'UPDATE_USER':      // Profile was updated
      return {
        ...state,
        user: action.payload,  // Replace user object with updated data
      };
    case 'CLEAR_ERROR':      // Dismiss error message
      return {
        ...state,
        error: null,
      };
    default:
      return state;          // Unknown action → no change
  }
};

// ─── CONTEXT TYPE ───
// This defines what useAuth() gives you when you call it.
// It includes the state (user, token, loading, error) PLUS the action functions.
interface AuthContextType extends AuthState {
  login: (credentials: LoginForm) => Promise<boolean>;   // Try to log in
  logout: () => void;                                     // Log out
  updateProfile: (data: Partial<User>) => Promise<boolean>; // Update profile
  clearError: () => void;                                 // Dismiss error
}

// ─── CREATE THE CONTEXT ───
// React Context is like a "global variable" that any component can read.
// We create it here with undefined as default (will be filled by AuthProvider).
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── useAuth() HOOK ───
// This is the main way components access auth state.
// Example usage in any component:
//   const { user, login, logout } = useAuth();
//   if (user) { show dashboard } else { show login }
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // This error means you forgot to wrap your app in <AuthProvider>
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

// ─── AUTH PROVIDER COMPONENT ───
// This wraps the entire app (in index.tsx) and provides auth state to all children.
// It contains all the auth logic: login, logout, token restoration.
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // useReducer is like useState but for complex state.
  // state = current auth state, dispatch = function to send actions to the reducer
  const [state, dispatch] = useReducer(authReducer, initialState);

  // ─── AUTO-RESTORE SESSION ON APP LOAD ───
  // When the page loads (or refreshes), this runs ONCE.
  // It checks: "Is there a saved token in localStorage?"
  // If yes → call /api/auth/me to get the user profile
  // If the token is expired/invalid → clear it and go to login
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          dispatch({ type: 'AUTH_START' });  // Show loading spinner
          authService.setToken(token);       // Set token for API calls
          
          // Call the backend: "Who am I?" → returns user profile
          const response = await authService.getCurrentUser();
          
          if (response.success && response.data) {
            // Token is valid! Restore the session.
            dispatch({
              type: 'AUTH_SUCCESS',
              payload: { user: response.data.user, token },
            });
          } else {
            // Token is invalid or expired → clear it
            localStorage.removeItem('token');
            dispatch({ type: 'AUTH_FAILURE', payload: 'Invalid token' });
          }
        } catch (error) {
          // Network error or server down → clear token
          localStorage.removeItem('token');
          dispatch({ type: 'AUTH_FAILURE', payload: 'Authentication failed' });
        }
      } else {
        // No saved token → user needs to log in
        dispatch({ type: 'AUTH_FAILURE', payload: '' });
      }
    };

    initializeAuth();
  }, []);  // Empty [] means: run only ONCE when component mounts

  // ─── LOGIN FUNCTION ───
  // Called when user submits the login form.
  // Flow: send credentials to server → get back user + token → save them.
  // Returns true if login succeeded, false if it failed.
  const login = async (credentials: LoginForm): Promise<boolean> => {
    try {
      dispatch({ type: 'AUTH_START' });  // Show loading spinner
      
      // Call POST /api/auth/login with email + password
      const response = await authService.login(credentials);
      
      if (response.success && response.data) {
        const { user, token } = response.data;
        
        // Save token to browser storage so it survives page refresh
        localStorage.setItem('token', token);
        authService.setToken(token);  // Set token for future API calls
        
        // Update state: user is now logged in!
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: { user, token },
        });
        
        toast.success(`Welcome back, ${user.firstName}!`);  // Show welcome message
        return true;  // Login succeeded
      } else {
        // Server said login failed (wrong password, etc.)
        dispatch({
          type: 'AUTH_FAILURE',
          payload: response.message || 'Login failed',
        });
        toast.error(response.message || 'Login failed');
        return false;  // Login failed
      }
    } catch (error: any) {
      // Network error or server error
      const message = error?.response?.data?.message || 'Login failed';
      dispatch({ type: 'AUTH_FAILURE', payload: message });
      toast.error(message);
      return false;
    }
  };

  // ─── LOGOUT FUNCTION ───
  // Called when user clicks the logout button.
  // Clears the token from browser storage and resets auth state.
  const logout = async () => {
    try {
      // Tell the server we're logging out (for audit logging)
      if (state.token) {
        await authService.logout();
      }
    } catch (error) {
      // If the API call fails, still logout locally
      // (server might be down, but user should still be able to "logout")
      console.error('Logout API call failed:', error);
    }
    
    localStorage.removeItem('token');  // Remove saved token
    authService.setToken('');          // Clear token from API client
    dispatch({ type: 'LOGOUT' });      // Reset auth state to logged-out
    toast.success('Logged out successfully');
  };

  // ─── UPDATE PROFILE FUNCTION ───
  // Called when user edits their profile (name, phone, etc.)
  const updateProfile = async (data: Partial<User>): Promise<boolean> => {
    try {
      // Call PUT /api/auth/profile with the updated fields
      const response = await authService.updateProfile(data);
      
      if (response.success && response.data) {
        // Update the user object in state with the new data
        dispatch({ type: 'UPDATE_USER', payload: response.data.user });
        toast.success('Profile updated successfully');
        return true;
      } else {
        toast.error(response.message || 'Profile update failed');
        return false;
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Profile update failed';
      toast.error(message);
      return false;
    }
  };

  // ─── CLEAR ERROR FUNCTION ───
  // Dismiss the error message (e.g., when user starts typing again)
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  // ─── BUNDLE EVERYTHING TOGETHER ───
  // This is what useAuth() returns to any component that calls it.
  // It includes both the state (user, token, loading, error)
  // AND the functions (login, logout, updateProfile, clearError).
  const value: AuthContextType = {
    ...state,        // Spread the state: user, token, loading, error
    login,           // The login function
    logout,          // The logout function
    updateProfile,   // The profile update function
    clearError,      // The error dismissal function
  };

  // ─── RENDER THE PROVIDER ───
  // Wrap all children (the entire app) with this context.
  // Now ANY component inside can call useAuth() to get auth state.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};