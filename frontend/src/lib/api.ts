import axios, { AxiosError } from 'axios'

export type UserRole =
  | 'admin'
  | 'project_manager'
  | 'supervisor'
  | 'contractor'
  | 'owner'

export type RoleSlug = 'admin' | 'project-manager' | 'supervisor' | 'contractor' | 'owner'

export function roleToSlug(role: UserRole): RoleSlug {
  if (role === 'project_manager') return 'project-manager'
  return role
}

export function slugToRole(slug: string): UserRole | null {
  const normalized = slug.trim().toLowerCase()
  if (normalized === 'project-manager') return 'project_manager'
  if (
    normalized === 'admin' ||
    normalized === 'supervisor' ||
    normalized === 'contractor' ||
    normalized === 'owner'
  ) {
    return normalized
  }
  return null
}

export interface AuthUser {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  role: UserRole
}

export interface AuthResponse {
  access: string
  refresh: string
  user: AuthUser
}

const API_BASE_URL = 'http://127.0.0.1:8000/api'
/** Base URL for media files (e.g. uploaded site photos). */
export const MEDIA_BASE_URL = 'http://127.0.0.1:8000'

export const api = axios.create({
  baseURL: API_BASE_URL,
})

// Attach JWT token automatically if present.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// --- Token helpers ---

export function saveTokens(access: string, refresh: string) {
  localStorage.setItem('access_token', access)
  localStorage.setItem('refresh_token', refresh)
}

export function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

// --- Error handling & token refresh ---

let isRefreshing = false
let refreshQueue: Array<() => void> = []

function enqueueRefresh(callback: () => void) {
  refreshQueue.push(callback)
}

function flushRefreshQueue() {
  refreshQueue.forEach((cb) => cb())
  refreshQueue = []
}

async function refreshAccessToken() {
  if (isRefreshing) {
    return new Promise<void>((resolve) => enqueueRefresh(resolve))
  }

  isRefreshing = true
  try {
    const refresh = localStorage.getItem('refresh_token')
    if (!refresh) {
      throw new Error('No refresh token available')
    }

    // Django REST Framework SimpleJWT expects { refresh: "token" }
    const response = await axios.post<{ access: string }>(
      `${API_BASE_URL.replace(/\/$/, '')}/auth/token/refresh/`,
      { refresh },
    )

    const data = response.data
    // Only access token is returned from refresh endpoint; keep existing refresh token.
    saveTokens(data.access, refresh)
    flushRefreshQueue()
  } catch (error) {
    // If refresh fails, clear everything
    clearTokens()
    localStorage.removeItem('user')
    throw error
  } finally {
    isRefreshing = false
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest: any = error.config

    // If unauthorized due to expired access token, try a one-time refresh.
    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      localStorage.getItem('refresh_token')
    ) {
      originalRequest._retry = true
      try {
        await refreshAccessToken()
        const token = localStorage.getItem('access_token')
        if (token && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`
        }
        return api(originalRequest)
      } catch {
        // Refresh failed – fall through to logout handling below.
      }
    }

    // For 401/403 or failed refresh, clear tokens + user and let ProtectedRoute
    // bounce the user back to the correct login screen.
    if (error.response?.status === 401 || error.response?.status === 403) {
      clearTokens()
      localStorage.removeItem('user')
    }

    return Promise.reject(error)
  },
)

// --- Daily Sheet Types ---

export interface DailySheetTemplate {
  id: number
  project: number
  project_name: string
  name: string
  description: string
  row_headings: string[]
  column_headings: string[]
  created_by: number
  created_by_username: string
  created_at: string
  updated_at: string
}

export interface DailySheetCellData {
  id?: number
  entry?: number
  row_index: number
  column_index: number
  value: string
}

export interface DailySheetEntry {
  id: number
  template: number
  template_name: string
  project: number
  project_name: string
  date: string
  filled_by: number
  filled_by_username: string
  notes: string
  submitted_at: string
  updated_at: string
  cell_data: DailySheetCellData[]
}

export interface DailySheetEntryCreate {
  template: number
  date: string
  notes?: string
  cell_data: Array<{
    row_index: number
    column_index: number
    value: string
  }>
}


