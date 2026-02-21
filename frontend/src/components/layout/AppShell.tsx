import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Home, Folder, Users, ShoppingCart, BarChart2, Menu, X, Settings, Bell, BellOff } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

// Define nav items for the sidebar
const navItems = [
  { name: 'Admin Dashboard', href: '/admin', icon: Home, roles: ['admin'] },
  { name: 'Project Manager', href: '/project-manager', icon: Folder, roles: ['project_manager', 'admin'] },
  { name: 'Site Engineer', href: '/supervisor', icon: Users, roles: ['supervisor', 'admin', 'project_manager'] },
  { name: 'Contractor Portal', href: '/contractor', icon: ShoppingCart, roles: ['contractor', 'admin'] },
  { name: 'Experts Panel', href: '/owner', icon: BarChart2, roles: ['owner', 'admin'] },
]

function getCurrentUser() {
  const raw = localStorage.getItem('user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as { username: string; role: string; id: number }
  } catch {
    return null
  }
}

interface Notification {
  id: number
  message: string
  created_at: string
  is_read: boolean
}

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const notificationRef = useRef<HTMLDivElement>(null)

  const isLogin = location.pathname.startsWith('/login') || location.pathname.startsWith('/register')

  // Fetch notifications
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get<any>('/notifications/')
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
    enabled: !isLogin && !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (isLogin) {
    return <>{children}</>
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    navigate('/login/owner')
  }

  const currentPath = location.pathname

  // Filter nav items based on role (simple client-side check)
  const filteredNavItems = navItems.filter(item => {
    if (!user) return true // Show all for demo if not logged in (or handle redirect)
    // For this demo, let's allow "admin" to see everything, and others to see their specific dashboard
    if (user.role === 'admin') return true
    return item.roles.includes(user.role)
  })

  const unreadCount = notifications?.filter((n: Notification) => !n.is_read).length || 0

  // If no role matches (e.g. strict mode), maybe show nothing or a default
  // For now, we trust the filter.

  return (
    <div className="flex h-screen w-full overflow-hidden bg-construction-bg font-sans text-construction-text">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-construction-black text-white shadow-2xl transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-white/10 bg-construction-grey">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-construction-yellow text-construction-black font-bold font-header shadow-md">
              CT
            </div>
            <span className="text-lg font-bold tracking-wide uppercase font-header">
              Construct<span className="text-construction-yellow">Track</span>
            </span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden text-white hover:text-construction-yellow"
          >
            <X size={24} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-6 overflow-y-auto">
          <div className="px-3 mb-2 text-xs font-bold text-construction-muted uppercase tracking-widest">
            Menu
          </div>
          {filteredNavItems.map((item) => {
            const isActive = currentPath.startsWith(item.href)
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center px-3 py-3 text-sm font-bold uppercase tracking-wider rounded transition-all duration-200 ${isActive
                  ? 'bg-construction-yellow text-construction-black shadow-md translate-x-1'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white hover:translate-x-1'
                  }`}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${isActive ? 'text-construction-black' : 'text-gray-500 group-hover:text-white'
                    }`}
                />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* User Footer */}
        <div className="border-t border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-construction-yellow text-construction-black font-bold font-header border-2 border-white/10">
              {user?.username.charAt(0).toUpperCase() || 'G'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-bold text-white uppercase tracking-wide">
                {user?.username || 'Guest'}
              </p>
              <p className="truncate text-xs text-gray-400 capitalize">
                {user?.role?.replace('_', ' ') || 'Visitor'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-construction-danger hover:bg-white/5 rounded transition-colors"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Layout */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b border-construction-border bg-white px-6 shadow-sm z-50 relative">
          <div className="flex items-center gap-4">
            <button
              className="md:hidden text-construction-grey"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h1 className="hidden md:block text-xl font-header font-bold uppercase text-construction-black tracking-wide">
              Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Dropdown */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="p-2 text-construction-muted hover:text-construction-black transition-colors relative"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-construction-danger border border-white"></span>
                )}
              </button>

              {/* Dropdown */}
              {isNotificationOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-construction-border z-[100] max-h-96 overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-construction-border bg-gray-50">
                    <h3 className="font-header font-bold text-construction-black">Notifications</h3>
                    {unreadCount > 0 && (
                      <p className="text-xs text-construction-muted mt-0.5">{unreadCount} unread</p>
                    )}
                  </div>

                  <div className="overflow-y-auto flex-1">
                    {!notifications || notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <BellOff size={40} className="text-construction-muted opacity-50 mb-3" />
                        <p className="text-construction-muted font-semibold">No notifications yet</p>
                        <p className="text-xs text-construction-muted mt-1">You're all caught up!</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-construction-border">
                        {notifications.map((notification: Notification) => (
                          <div
                            key={notification.id}
                            className={`px-4 py-3 hover:bg-gray-50 transition-colors ${!notification.is_read ? 'bg-blue-50' : ''
                              }`}
                          >
                            <p className="text-sm text-construction-black">{notification.message}</p>
                            <p className="text-xs text-construction-muted mt-1">
                              {new Date(notification.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button className="p-2 text-construction-muted hover:text-construction-black transition-colors">
              <Settings size={20} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-construction-bg p-6 relative">
          <div className="mx-auto max-w-7xl animate-in fade-in duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
