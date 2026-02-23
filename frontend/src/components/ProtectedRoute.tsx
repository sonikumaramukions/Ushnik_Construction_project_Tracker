// ================================================================
// PROTECTED ROUTE (components/ProtectedRoute.tsx)
// ================================================================
// PURPOSE: Guards routes so only logged-in users with the right
//          role can access certain pages.
//
// HOW IT WORKS:
//   1. Checks if user is logged in (has valid JWT token)
//   2. Checks if user's role matches the allowed roles
//   3. If not logged in → redirects to /login
//   4. If wrong role → redirects to their own dashboard
//
// PROPS:
//   allowedRoles (string[]) — Which roles can see this page
//   children (ReactNode)    — The page component to render
//
// EXAMPLE:
//   <ProtectedRoute allowedRoles={['L1_ADMIN']}>
//     <AdminDashboard />
//   </ProtectedRoute>
//
// USED BY: App.tsx route definitions
// ================================================================

import React from 'react';
import { Navigate } from 'react-router-dom';           // Redirect component from React Router
import { useAuth } from '../contexts/AuthContext';      // Get the logged-in user
import { UserRole } from '../types';                    // Type for role names
import { Box, Typography, Paper } from '@mui/material'; // MUI layout components
import { Lock as LockIcon } from '@mui/icons-material'; // Lock icon for "Access Denied" page

// ─── PROPS ───
// requiredRole  = ONE specific role that can access this page (e.g., 'L1_ADMIN')
// requiredRoles = MULTIPLE roles that can access this page (e.g., ['L1_ADMIN', 'CEO'])
// children      = The actual page component that will be shown if access is granted
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiredRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requiredRoles,
}) => {
  const { user, loading } = useAuth();  // Get the current user from AuthContext

  // ─── STEP 1: STILL LOADING? ───
  // While the app is checking the saved token, show a loading spinner.
  // This prevents a brief flash of the login page on refresh.
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <div className="loading-spinner" />
      </Box>
    );
  }

  // ─── STEP 2: NOT LOGGED IN? ───
  // If there's no user (not logged in), redirect to the login page.
  // `replace` means: don't add this redirect to browser history
  // (so pressing "Back" won't bring you back here)
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ─── STEP 3: CHECK SINGLE ROLE ───
  // If a specific role is required and the user doesn't have it,
  // show an "Access Denied" page instead of the requested page.
  if (requiredRole && user.role !== requiredRole) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        p={3}
      >
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            maxWidth: 400,
          }}
        >
          <LockIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Access Denied
          </Typography>
          <Typography variant="body1" color="text.secondary">
            You do not have permission to access this page.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Required role: {requiredRole.replace('_', ' ')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your role: {user.role.replace('_', ' ')}
          </Typography>
        </Paper>
      </Box>
    );
  }

  // ─── STEP 4: CHECK MULTIPLE ROLES ───
  // Same as above but checks if user's role is in a LIST of allowed roles.
  // Example: requiredRoles={['L1_ADMIN', 'PROJECT_MANAGER']}
  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        p={3}
      >
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            maxWidth: 400,
          }}
        >
          <LockIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Access Denied
          </Typography>
          <Typography variant="body1" color="text.secondary">
            You do not have permission to access this page.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Required roles: {requiredRoles.map(role => role.replace('_', ' ')).join(', ')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your role: {user.role.replace('_', ' ')}
          </Typography>
        </Paper>
      </Box>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;