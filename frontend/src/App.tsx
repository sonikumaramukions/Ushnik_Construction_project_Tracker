import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminDashboard } from './pages/AdminDashboard'
import { ProjectManagerDashboard } from './pages/ProjectManagerDashboard'
import { SupervisorDashboard } from './pages/SupervisorDashboard'
import { ContractorDashboard } from './pages/ContractorDashboard'
import { OwnerDashboard } from './pages/OwnerDashboard'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { RoleLoginPage } from './pages/RoleLoginPage'
import { ContractorRegisterPage } from './pages/ContractorRegisterPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppShell>
            <Routes>
              {/* Role-specific login pages */}
              <Route path="/login/:role" element={<RoleLoginPage />} />
              <Route path="/register/contractor" element={<ContractorRegisterPage />} />

              {/* Dashboards guarded by role-aware route wrapper */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/project-manager"
                element={
                  <ProtectedRoute allowedRoles={['project_manager']}>
                    <ProjectManagerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/supervisor"
                element={
                  <ProtectedRoute allowedRoles={['supervisor']}>
                    <SupervisorDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contractor"
                element={
                  <ProtectedRoute allowedRoles={['contractor']}>
                    <ContractorDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/owner"
                element={
                  <ProtectedRoute allowedRoles={['owner']}>
                    <OwnerDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Project Detail Page - accessible by PM and Owner */}
              <Route
                path="/project/:projectId"
                element={
                  <ProtectedRoute allowedRoles={['project_manager', 'owner', 'admin']}>
                    <ProjectDetailPage />
                  </ProtectedRoute>
                }
              />

              {/* Default: redirect to owner login (can be adjusted) */}
              <Route path="*" element={<Navigate to="/login/owner" replace />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
