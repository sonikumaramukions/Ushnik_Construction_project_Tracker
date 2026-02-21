import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { UserRole } from '../lib/api'
import { roleToSlug } from '../lib/api'

interface ProtectedRouteProps {
  allowedRoles: UserRole[]
  children: ReactNode
}

// Very small auth helper: in a real app you'd likely wrap this
// with React Context, but for this demo we keep it simple.
function getStoredUserRole(): UserRole | null {
  const raw = localStorage.getItem('user')
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as { role?: UserRole }
    return user.role ?? null
  } catch {
    return null
  }
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const location = useLocation()
  const role = getStoredUserRole()
  const token = localStorage.getItem('access_token')

  if (!token || !role) {
    // Not authenticated – send back to a generic login.
    return <Navigate to="/login/owner" state={{ from: location }} replace />
  }

  if (!allowedRoles.includes(role)) {
    // Authenticated but wrong role – block access.
    return <Navigate to={`/login/${roleToSlug(role)}`} replace />
  }

  return <>{children}</>
}

