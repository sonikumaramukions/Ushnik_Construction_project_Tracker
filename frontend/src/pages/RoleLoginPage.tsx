import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, saveTokens, slugToRole } from '../lib/api'
import type { AuthResponse } from '../lib/api'

const roleToDashboard: Record<string, string> = {
  admin: '/admin',
  project_manager: '/project-manager',
  supervisor: '/supervisor',
  contractor: '/contractor',
  owner: '/owner',
}

export function RoleLoginPage() {
  const { role: roleSlug = 'owner' } = useParams<{ role: string }>()
  const role = slugToRole(roleSlug) ?? 'owner'
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await api.post<AuthResponse>('/auth/token/', {
        username,
        password,
      })

      const data = response.data
      
      // Save tokens and user data
      saveTokens(data.access, data.refresh)
      localStorage.setItem('user', JSON.stringify(data.user))

      // Verify role matches
      if (data.user.role !== role) {
        setError(
          `This account is a ${data.user.role} and cannot log in via the ${roleSlug} portal.`
        )
        setLoading(false)
        return
      }

      // Navigate to dashboard
      const target = roleToDashboard[role] ?? '/owner'
      console.log('Navigating to:', target, 'for role:', role)
      navigate(target, { replace: true })
    } catch (err: any) {
      console.error('Login error:', err)
      const errorMessage = err.response?.data?.detail || 
                          err.response?.data?.message || 
                          err.message || 
                          'Invalid credentials or server unavailable.'
      setError(errorMessage)
      setLoading(false)
    }
  }

  const prettyRole = role === 'project_manager' ? 'Project Manager' : role.charAt(0).toUpperCase() + role.slice(1)
  const title = `${prettyRole} Login`

  const roleDescription: Record<string, string> = {
    admin:
      'Creates users, assigns roles, configures projects, and controls bids. Does not touch daily site data.',
    project_manager:
      'Owns project phases, tasks, approvals, and progress. Connects site execution with management.',
    supervisor:
      'Executes tasks, uploads site images, raises material and attendance. Cannot edit approvals or bids.',
    contractor:
      'Views published material requests and submits bids with price and delivery timeline.',
    owner:
      'Monitors projects across cities and locations with read-only dashboards and reports.',
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative font-sans text-construction-text bg-construction-bg">
      {/* Global background pattern from index.css is on body, but we can add an overlay here if needed. 
           For now we rely on the body background. */}

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 bg-white rounded-lg shadow-2xl overflow-hidden border-4 border-construction-border relative z-10">

        {/* Left Panel - Dark Info */}
        <div className="bg-gradient-to-br from-construction-black via-construction-grey to-construction-black p-8 md:p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-5 pointer-events-none"></div>

          <div className="relative z-10">
            <div className="inline-block px-4 py-1.5 rounded-md bg-construction-yellow text-construction-black text-xs font-bold uppercase tracking-widest mb-6 shadow-lg">
              Construction Tracker
            </div>
            <h1 className="text-4xl md:text-5xl font-bold font-header uppercase tracking-wide leading-tight mb-3 text-white drop-shadow-lg">
              {title}
            </h1>
            <p className="text-construction-yellow font-bold text-sm tracking-wide uppercase border-l-4 border-construction-yellow pl-4 mb-8 bg-white/5 py-2 rounded-r">
              {prettyRole} Portal
            </p>

            <p className="text-gray-200 text-sm leading-relaxed mb-8 font-medium">
              {roleDescription[role]}
            </p>

            <ul className="space-y-3 text-sm text-gray-300 mb-8">
              <li className="flex items-center gap-3">
                <div className="w-2 h-2 bg-construction-yellow rounded-full shadow-sm"></div>
                <span className="font-medium">Secure Role-Based Access</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-2 h-2 bg-construction-yellow rounded-full shadow-sm"></div>
                <span className="font-medium">Immutable Audit History</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-2 h-2 bg-construction-yellow rounded-full shadow-sm"></div>
                <span className="font-medium">Site Office Optimized</span>
              </li>
            </ul>
          </div>

          <div className="relative z-10 mt-12 bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-sm p-5 rounded-lg border border-white/20 shadow-xl">
            <div className="text-xs font-bold text-construction-yellow uppercase tracking-wider mb-3 flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-construction-yellow rounded-full"></div>
              Demo Credentials
            </div>
            {role === 'admin' && (
              <p className="text-xs font-mono text-gray-200 leading-relaxed">
                User: <span className="text-white font-bold">admin_demo</span><br />
                Pass: <span className="text-white font-bold">admin123!</span>
              </p>
            )}
            {role === 'project_manager' && (
              <p className="text-xs font-mono text-gray-200 leading-relaxed">
                User: <span className="text-white font-bold">pm_demo</span><br />
                Pass: <span className="text-white font-bold">pm123!</span>
              </p>
            )}
            {role === 'supervisor' && (
              <p className="text-xs font-mono text-gray-200 leading-relaxed">
                User: <span className="text-white font-bold">supervisor_demo</span><br />
                Pass: <span className="text-white font-bold">supervisor123!</span>
              </p>
            )}
            {role === 'contractor' && (
              <p className="text-xs font-mono text-gray-200 leading-relaxed">
                User: <span className="text-white font-bold">contractor_demo</span><br />
                Pass: <span className="text-white font-bold">contractor123!</span>
              </p>
            )}
            {role === 'owner' && (
              <p className="text-xs font-mono text-gray-200 leading-relaxed">
                User: <span className="text-white font-bold">owner_demo</span><br />
                Pass: <span className="text-white font-bold">owner123!</span>
              </p>
            )}
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="bg-gradient-to-br from-white to-gray-50 p-8 md:p-12 flex flex-col justify-center">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-sm mx-auto w-full">
            <div>
              <label htmlFor="username" className="block text-xs font-bold uppercase text-construction-black tracking-wider mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                className="w-full rounded-md border-2 border-construction-border bg-white px-4 py-3 text-sm text-construction-black font-semibold focus:border-construction-yellow focus:ring-2 focus:ring-construction-yellow/20 focus:outline-none transition-all placeholder-gray-400 shadow-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-bold uppercase text-construction-black tracking-wider mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border-2 border-construction-border bg-white px-4 py-3 text-sm text-construction-black font-semibold focus:border-construction-yellow focus:ring-2 focus:ring-construction-yellow/20 focus:outline-none transition-all placeholder-gray-400 shadow-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-md text-sm font-semibold text-red-700 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">⚠</span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-gradient-to-r from-construction-yellow to-construction-yellow-hover border-2 border-construction-black px-4 py-3 text-sm font-bold text-construction-black uppercase tracking-wider font-header shadow-[4px_4px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_#000]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Please wait…
                </span>
              ) : (
                'Sign In'
              )}
            </button>

            {role === 'contractor' && (
              <div className="pt-6 border-t-2 border-construction-border text-center">
                <span className="text-xs font-semibold text-construction-muted uppercase tracking-wide mr-2">New Contractor?</span>
                <a className="text-xs font-bold text-construction-black hover:text-construction-yellow hover:underline uppercase tracking-wide transition-colors" href="/register/contractor">
                  Create Account
                </a>
              </div>
            )}

            {/* Role Switcher Links */}
            <div className="pt-6 border-t-2 border-construction-border">
              <p className="text-xs font-bold text-construction-black uppercase tracking-wider mb-3 text-center">Switch Portal</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <a
                  href="/login/admin"
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all shadow-sm ${role === 'admin'
                      ? 'bg-construction-yellow text-construction-black border-2 border-construction-black shadow-md'
                      : 'bg-white text-construction-muted border-2 border-construction-border hover:bg-construction-yellow hover:text-construction-black hover:border-construction-black'
                    }`}
                >
                  Admin
                </a>
                <a
                  href="/login/project-manager"
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all shadow-sm ${role === 'project_manager'
                      ? 'bg-construction-yellow text-construction-black border-2 border-construction-black shadow-md'
                      : 'bg-white text-construction-muted border-2 border-construction-border hover:bg-construction-yellow hover:text-construction-black hover:border-construction-black'
                    }`}
                >
                  PM
                </a>
                <a
                  href="/login/supervisor"
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all shadow-sm ${role === 'supervisor'
                      ? 'bg-construction-yellow text-construction-black border-2 border-construction-black shadow-md'
                      : 'bg-white text-construction-muted border-2 border-construction-border hover:bg-construction-yellow hover:text-construction-black hover:border-construction-black'
                    }`}
                >
                  Site Engineer
                </a>
                <a
                  href="/login/contractor"
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all shadow-sm ${role === 'contractor'
                      ? 'bg-construction-yellow text-construction-black border-2 border-construction-black shadow-md'
                      : 'bg-white text-construction-muted border-2 border-construction-border hover:bg-construction-yellow hover:text-construction-black hover:border-construction-black'
                    }`}
                >
                  Contractor
                </a>
                <a
                  href="/login/owner"
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all shadow-sm ${role === 'owner'
                      ? 'bg-construction-yellow text-construction-black border-2 border-construction-black shadow-md'
                      : 'bg-white text-construction-muted border-2 border-construction-border hover:bg-construction-yellow hover:text-construction-black hover:border-construction-black'
                    }`}
                >
                  Experts Panel
                </a>
              </div>
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}
