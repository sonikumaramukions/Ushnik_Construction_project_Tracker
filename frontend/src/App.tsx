// ================================================================
// APP.TSX — Main Application Router
// ================================================================
// PURPOSE: Defines ALL the pages (routes) in the application.
//
// This is like a PHONE DIRECTORY for pages:
//   /login          → LoginPage
//   /dashboard/*    → Role-specific dashboard (Admin, CEO, Engineer, etc.)
//   /projects/:id   → Project detail view
//   /sheets/:id     → Sheet editor view
//   /my-tasks       → User's assigned tasks
//
// HOW ROUTING WORKS:
//   1. User visits a URL (e.g., /dashboard)
//   2. React Router matches it to a <Route> below
//   3. The matched component is rendered
//   4. ProtectedRoute checks if user is logged in + has the right role
//
// ROLE-BASED DASHBOARD ROUTING:
//   L1_ADMIN         → AdminDashboard
//   CEO              → CEODashboard
//   L2_SENIOR_ENGINEER → SeniorEngineerDashboard
//   L3_JUNIOR_ENGINEER → JuniorEngineerDashboard
//   PROJECT_MANAGER  → ProjectManagerDashboard
//   GROUND_MANAGER   → GroundManagerDashboard
// ================================================================

// ─── REACT AND ROUTING ───
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';  // React Router: maps URLs to pages
import { Box } from '@mui/material';  // MUI layout component (like a <div> with superpowers)

import { useAuth } from './contexts/AuthContext';   // Get logged-in user info
import ProtectedRoute from './components/ProtectedRoute';  // Guards pages based on login + role
import LoadingSpinner from './components/LoadingSpinner';  // Spinning circle shown while loading

// ─── AUTH PAGES (public — anyone can see) ───
import LoginPage from './pages/auth/LoginPage';  // The login form page

// ─── ROLE-BASED DASHBOARDS ───
// Each role gets their OWN dashboard with features specific to them
import AdminDashboard from './pages/dashboards/AdminDashboard';           // L1 Admin: full control
import SeniorEngineerDashboard from './pages/dashboards/SeniorEngineerDashboard'; // L2: manage junior engineers
import JuniorEngineerDashboard from './pages/dashboards/JuniorEngineerDashboard'; // L3: fill in data
import ProjectManagerDashboard from './pages/dashboards/ProjectManagerDashboard'; // PM: oversee projects
import GroundManagerDashboard from './pages/dashboards/GroundManagerDashboard';   // Site: field data entry
import CEODashboard from './pages/dashboards/CEODashboard';               // CEO: view-only reports

// ─── SHARED PAGES (any logged-in user can access) ───
import ProfilePage from './pages/shared/ProfilePage';           // View your profile
import ProjectDetailsPage from './pages/shared/ProjectDetailsPage'; // View a single project
import SheetViewPage from './pages/shared/SheetViewPage';       // View/edit a tracking sheet
import MySheets from './pages/MySheets';                         // List of sheets assigned to you
import SheetEditor from './pages/SheetEditor';                   // Full sheet editor page
import ProjectSheetEditor from './pages/shared/ProjectSheetEditor'; // Full sheet editor within project
import EngineerQuestionnaire from './components/EngineerQuestionnaire'; // Q&A form for engineers
import MyTasksPage from './pages/shared/MyTasksPage';           // Your pending tasks/assignments

function App() {
  // ─── GET USER STATE ───
  // useAuth() reads from AuthContext to get the current user
  // user = null if not logged in, or { id, name, role, ... } if logged in
  // loading = true while the app checks if there's a saved login token
  const { user, loading } = useAuth();

  // ─── LOADING STATE ───
  // While checking the saved token, show a spinner so the page doesn't flash
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"       // Full screen height
      >
        <LoadingSpinner />
      </Box>
    );
  }

  // ─── ROLE-BASED REDIRECT HELPER ───
  // Each role has their own dashboard URL.
  // When user visits "/" or an unknown page, they go to THEIR dashboard.
  const getDashboardRoute = () => {
    if (!user) return '/login';  // Not logged in? Go to login page

    // Based on the user's role, send them to the correct dashboard
    switch (user.role) {
      case 'L1_ADMIN':           return '/admin';            // Full admin panel
      case 'L2_SENIOR_ENGINEER': return '/senior-engineer';  // Senior engineer dashboard
      case 'L3_JUNIOR_ENGINEER': return '/junior-engineer';  // Junior engineer dashboard
      case 'PROJECT_MANAGER':    return '/project-manager';  // Project manager dashboard
      case 'GROUND_MANAGER':     return '/ground-manager';   // Ground/site manager dashboard
      case 'CEO':                return '/ceo';              // CEO executive dashboard
      default:                   return '/login';            // Unknown role? Go to login
    }
  };

  return (
    // ─── ALL PAGE ROUTES ───
    // <Routes> is like a switchboard: the URL decides which page to show.
    // <Route path="/login"> means: when user visits localhost:3000/login, show LoginPage.
    <Routes>
      {/* === PUBLIC ROUTE (no login needed) === */}
      {/* If user is already logged in, skip login page and go to their dashboard */}
      <Route
        path="/login"
        element={user ? <Navigate to={getDashboardRoute()} replace /> : <LoginPage />}
      />

      {/* === ADMIN DASHBOARD (L1_ADMIN only) === */}
      {/* ProtectedRoute checks: is user logged in? AND is their role L1_ADMIN? */}
      {/* The /* means this also matches /admin/users, /admin/projects, etc. */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute requiredRole="L1_ADMIN">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/senior-engineer/*"
        element={
          <ProtectedRoute requiredRole="L2_SENIOR_ENGINEER">
            <SeniorEngineerDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/junior-engineer/*"
        element={
          <ProtectedRoute requiredRole="L3_JUNIOR_ENGINEER">
            <JuniorEngineerDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/project-manager/*"
        element={
          <ProtectedRoute requiredRole="PROJECT_MANAGER">
            <ProjectManagerDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ground-manager/*"
        element={
          <ProtectedRoute requiredRole="GROUND_MANAGER">
            <GroundManagerDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ceo/*"
        element={
          <ProtectedRoute requiredRole="CEO">
            <CEODashboard />
          </ProtectedRoute>
        }
      />

      {/* === SHARED PROTECTED ROUTES (any logged-in user) === */}
      {/* These pages don't check for a specific role, just that you're logged in */}

      {/* Profile page: view your account info */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />

      {/* Project detail page: view a specific project by its ID */}
      {/* :id is a URL parameter — /project/5 means id=5 */}
      <Route
        path="/project/:id"
        element={
          <ProtectedRoute>
            <ProjectDetailsPage />
          </ProtectedRoute>
        }
      />

      {/* Project Sheet Editor: full DPR-style editor for a sheet within a project */}
      <Route
        path="/project/:projectId/sheet/:sheetId"
        element={
          <ProtectedRoute>
            <ProjectSheetEditor />
          </ProtectedRoute>
        }
      />

      {/* Sheet view page: view/edit a specific sheet by its ID */}
      <Route
        path="/sheet/:id"
        element={
          <ProtectedRoute>
            <SheetViewPage />
          </ProtectedRoute>
        }
      />

      {/* My Sheets: list of all sheets assigned to you */}
      <Route
        path="/my-sheets"
        element={
          <ProtectedRoute>
            <MySheets />
          </ProtectedRoute>
        }
      />

      {/* Sheet Editor: full-page editor for a specific sheet */}
      {/* :sheetId is a URL parameter — /my-sheets/3 means sheetId=3 */}
      <Route
        path="/my-sheets/:sheetId"
        element={
          <ProtectedRoute>
            <SheetEditor />
          </ProtectedRoute>
        }
      />

      {/* Engineer Questionnaire: Q&A form for answering questions about sheet data */}
      <Route
        path="/my-questions"
        element={
          <ProtectedRoute>
            <EngineerQuestionnaire />
          </ProtectedRoute>
        }
      />

      {/* My Tasks: pending assignments and task list */}
      <Route
        path="/my-tasks"
        element={
          <ProtectedRoute>
            <MyTasksPage />
          </ProtectedRoute>
        }
      />

      {/* === DEFAULT & 404 REDIRECTS === */}
      {/* If user goes to "/" (root), redirect to their dashboard */}
      <Route
        path="/"
        element={<Navigate to={getDashboardRoute()} replace />}
      />

      {/* If user goes to any unknown URL, redirect to their dashboard */}
      <Route
        path="*"
        element={<Navigate to={getDashboardRoute()} replace />}
      />
    </Routes>
  );
}

export default App;