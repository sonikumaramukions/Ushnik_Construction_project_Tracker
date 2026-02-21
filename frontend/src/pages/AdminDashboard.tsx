import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type AuthUser, type UserRole } from '../lib/api'
import { useState } from 'react'
import { PageShell, PageHeader } from '../components/layout/Page'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Users, FolderPlus, Gavel, Trash2, Plus, Building, UserPlus, FileSpreadsheet } from 'lucide-react'

interface ProjectSummary {
  id: number
  name: string
  city: string
  progress_percent: number
}

interface CreateUserParams {
  username: string
  password: string
  role: UserRole
  email?: string
}

interface CreateProjectParams {
  name: string
  city?: string
  location?: string
  area_size?: string
  area_unit?: string
  client_name?: string
  estimated_budget?: string
  project_manager_id: number | null
  owner_ids: number[]
  supervisor_ids: number[]
  phases?: { name: string; description: string; order: number }[]
}

interface CreateAuctionParams {
  project: number | null
  description: string
  needed_by?: string
}

export function AdminDashboard() {
  const queryClient = useQueryClient()
  const [newUser, setNewUser] = useState<CreateUserParams>({ username: '', password: '', role: 'supervisor' })
  const [activeTab, setActiveTab] = useState<'users' | 'projects' | 'auctions'>('users')
  const [newProject, setNewProject] = useState<CreateProjectParams>({
    name: '',
    city: '',
    location: '',
    area_size: '',
    area_unit: 'sqft',
    client_name: '',
    estimated_budget: '',
    project_manager_id: null,
    owner_ids: [],
    supervisor_ids: [],
    phases: [],
  })
  const [phaseInput, setPhaseInput] = useState({ name: '', description: '' })
  const [newAuction, setNewAuction] = useState<CreateAuctionParams>({
    project: null,
    description: '',
    needed_by: '',
  })

  const { data: projects, error: projectsError } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get<any>('/projects/')
      // Handle paginated response (DRF returns { results: [...] }) or plain array
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
    retry: 1,
    onError: (error) => {
      console.error('Failed to fetch projects:', error)
    },
  })

  const { data: users, error: usersError } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get<any>('/users/')
      // Handle paginated response (DRF returns { results: [...] }) or plain array
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
    retry: 1,
    onError: (error) => {
      console.error('Failed to fetch users:', error)
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await api.delete(`/users/${userId}/`)
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      alert('User deleted successfully.')
    },
    onError: (err: any) => {
      console.error(err)
      const msg = err.response?.data?.detail || err.message || 'Failed to delete user'
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  const createUserMutation = useMutation({
    mutationFn: async (userData: CreateUserParams) => {
      return api.post('/users/', {
        username: userData.username,
        password: userData.password,
        role: userData.role,
        email: userData.email || '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setNewUser({ username: '', password: '', role: 'supervisor', email: '' })
      alert('User created successfully. They can log in at their role\'s login page.')
    },
    onError: (err: any) => {
      console.error(err)
      const msg = err.response?.data?.detail || err.response?.data || err.message
      alert(`Failed to create user: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`)
    },
  })

  const createProjectMutation = useMutation({
    mutationFn: async (payload: CreateProjectParams) => {
      const projectRes = await api.post('/projects/', {
        name: payload.name,
        city: payload.city || '',
        location: payload.location || '',
        area_size: payload.area_size ? Number(payload.area_size) : null,
        area_unit: payload.area_unit || 'sqft',
        client_name: payload.client_name || '',
        estimated_budget: payload.estimated_budget ? Number(payload.estimated_budget) : null,
        project_manager_id: payload.project_manager_id,
        owner_ids: payload.owner_ids || [],
        supervisor_ids: payload.supervisor_ids || [],
        progress_percent: 0,
        phases_data: payload.phases || [],  // Send phases with project creation
      })

      return projectRes
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setNewProject({
        name: '',
        city: '',
        location: '',
        area_size: '',
        area_unit: 'sqft',
        client_name: '',
        estimated_budget: '',
        project_manager_id: null,
        owner_ids: [],
        supervisor_ids: [],
        phases: [],
      })
      setPhaseInput({ name: '', description: '' })
      alert('Project created. Assigned Project Manager and Site Engineers have been notified.')
    },
    onError: (err: any) => {
      console.error(err)
      const msg = err.response?.data?.detail || err.response?.data?.project_manager_id?.[0] || err.message
      alert(`Failed to create project: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`)
    },
  })

  const createAuctionMutation = useMutation({
    mutationFn: async (payload: CreateAuctionParams) => {
      return api.post('/material-requests/', {
        project: payload.project,
        description: payload.description,
        status: 'published',
        needed_by: payload.needed_by || null,
      })
    },
    onSuccess: () => {
      setNewAuction({ project: null, description: '', needed_by: '' })
      alert('Auction published to contractors.')
    },
    onError: (err) => {
      console.error(err)
      alert('Failed to publish auction.')
    },
  })

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate(newUser)
  }

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProject.project_manager_id) {
      alert('Please assign a Project Manager before creating a project.')
      return
    }
    createProjectMutation.mutate(newProject)
  }

  const handleCreateAuction = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAuction.project || !newAuction.description.trim()) {
      alert('Select a project and enter a requirement description.')
      return
    }
    createAuctionMutation.mutate(newAuction)
  }

  const handleDeleteUser = (userId: number) => {
    if (confirm('Are you sure you want to delete this user? This cannot be undone.')) {
      deleteUserMutation.mutate(userId)
    }
  }

  // Ensure users is always an array before filtering
  const usersArray = Array.isArray(users) ? users : []
  const managers = usersArray.filter((u) => u.role === 'project_manager')
  const supervisors = usersArray.filter((u) => u.role === 'supervisor')
  const owners = usersArray.filter((u) => u.role === 'owner')

  if (usersError || projectsError) {
    return (
      <PageShell>
        <PageHeader title="Admin Console" subtitle="Manage system users, projects, and procurement." badge="System Administrator" />
        <div className="p-6 bg-red-50 border-l-4 border-red-500 rounded-md">
          <p className="text-red-700 font-semibold">Error loading data. Please check your connection and try again.</p>
          {(usersError || projectsError) && (
            <p className="text-red-600 text-sm mt-2">{usersError?.message || projectsError?.message}</p>
          )}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Admin Console"
        subtitle="Manage system users, projects, and procurement."
        badge="System Administrator"
      />

      <div className="flex flex-col lg:flex-row gap-6 mt-4 h-full overflow-hidden">
        {/* Sidebar Tabs */}
        <nav className="lg:w-64 flex-shrink-0 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-wider rounded-lg transition-all border-l-4 shadow-sm min-w-[160px] lg:w-full ${activeTab === 'users'
              ? 'bg-construction-yellow text-construction-black border-construction-black'
              : 'bg-white text-construction-muted hover:bg-gray-50 hover:text-construction-black border-transparent'
              }`}
          >
            <Users size={18} />
            Users
          </button>

          <button
            onClick={() => setActiveTab('projects')}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-wider rounded-lg transition-all border-l-4 shadow-sm min-w-[160px] lg:w-full ${activeTab === 'projects'
              ? 'bg-construction-yellow text-construction-black border-construction-black'
              : 'bg-white text-construction-muted hover:bg-gray-50 hover:text-construction-black border-transparent'
              }`}
          >
            <FolderPlus size={18} />
            Projects
          </button>

          <button
            onClick={() => setActiveTab('auctions')}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-wider rounded-lg transition-all border-l-4 shadow-sm min-w-[160px] lg:w-full ${activeTab === 'auctions'
              ? 'bg-construction-yellow text-construction-black border-construction-black'
              : 'bg-white text-construction-muted hover:bg-gray-50 hover:text-construction-black border-transparent'
              }`}
          >
            <Gavel size={18} />
            Auctions
          </button>
        </nav>

        {/* Dynamic Content Area */}
        <div className="flex-1 overflow-y-auto">

          {/* USER MANAGEMENT TAB */}
          {activeTab === 'users' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card title="Register New Account" subtitle="Create Users">
                <form onSubmit={handleCreateUser} className="grid gap-6 md:grid-cols-4 items-end">
                  <div>
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Username</label>
                    <input
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      placeholder="jdoe"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Role Assignment</label>
                    <select
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                    >
                      <option value="project_manager">Project Manager</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="contractor">Contractor</option>
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Password</label>
                    <input
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      type="password"
                      placeholder="••••••••"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Email <span className="opacity-50 lowercase tracking-normal">(opt)</span></label>
                    <input
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      placeholder="user@corp.com"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-4 mt-2 flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      isLoading={createUserMutation.isPending}
                      leftIcon={<UserPlus size={16} />}
                    >
                      Create Account
                    </Button>
                  </div>
                </form>
              </Card>

              <Card title="User Directory" subtitle="Manage registered users">
                <div className="w-full text-left text-sm">
                  <div className="flex bg-gray-50 border-b border-construction-border px-6 py-3 font-bold text-construction-muted uppercase tracking-wider text-xs rounded-t-lg">
                    <div className="flex-1">User Identity</div>
                    <div className="flex-1">System Role</div>
                    <div className="flex-1">Contact</div>
                    <div className="w-24 text-right">Actions</div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {users?.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center px-6 py-4 hover:bg-gray-50 transition-colors group"
                      >
                        <div className="flex-1 flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-construction-light flex items-center justify-center text-xs font-bold text-construction-grey font-header">
                            {u.username.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="text-construction-black font-bold">{u.username}</span>
                        </div>
                        <div className="flex-1">
                          <Badge variant={
                            u.role === 'admin' ? 'danger' :
                              u.role === 'project_manager' ? 'primary' :
                                u.role === 'contractor' ? 'default' :
                                  'warning' // supervisor/owner
                          }>
                            {u.role.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="flex-1 text-construction-muted font-medium text-xs">
                          {u.email || '—'}
                        </div>
                        <div className="w-24 text-right">
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={deleteUserMutation.isPending}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete User"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(!users || users.length === 0) && (
                    <div className="p-8 text-center text-construction-muted font-bold">No users registered.</div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* PROJECT CREATION TAB */}
          {activeTab === 'projects' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card title="Create New Project" subtitle="Setup project details & assignments">
                <form onSubmit={handleCreateProject} className="grid gap-6 md:grid-cols-6 items-end">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Project Name</label>
                    <input
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      value={newProject.name}
                      onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Assign Manager</label>
                    <select
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      value={newProject.project_manager_id ?? ''}
                      onChange={(e) =>
                        setNewProject({
                          ...newProject,
                          project_manager_id: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      required
                    >
                      <option value="">Select manager…</option>
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">City</label>
                    <input
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      value={newProject.city || ''}
                      onChange={(e) => setNewProject({ ...newProject, city: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Location</label>
                    <input
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      value={newProject.location || ''}
                      onChange={(e) => setNewProject({ ...newProject, location: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Size</label>
                    <div className="flex gap-2">
                      <input
                        className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                        placeholder="2500"
                        value={newProject.area_size || ''}
                        onChange={(e) => setNewProject({ ...newProject, area_size: e.target.value })}
                      />
                      <select
                        className="rounded border border-construction-border bg-white px-2 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none"
                        value={newProject.area_unit || 'sqft'}
                        onChange={(e) => setNewProject({ ...newProject, area_unit: e.target.value })}
                      >
                        <option value="sqft">sqft</option>
                        <option value="sqm">sqm</option>
                      </select>
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Client</label>
                    <input
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      value={newProject.client_name || ''}
                      onChange={(e) => setNewProject({ ...newProject, client_name: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Budget</label>
                    <input
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      placeholder="0.00"
                      value={newProject.estimated_budget || ''}
                      onChange={(e) => setNewProject({ ...newProject, estimated_budget: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-6 border-t border-gray-100 pt-6 mt-2">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-bold text-construction-muted uppercase mb-3 ml-1 flex items-center gap-2">
                          <Users size={14} /> Assign Supervisors
                        </div>
                        <div className="p-3 rounded border border-construction-border bg-gray-50 h-32 overflow-y-auto">
                          <div className="flex flex-wrap gap-2">
                            {supervisors.map((s) => {
                              const checked = newProject.supervisor_ids.includes(s.id)
                              return (
                                <button
                                  type="button"
                                  key={s.id}
                                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${checked
                                    ? 'bg-construction-yellow text-construction-black border-yellow-500 shadow-sm'
                                    : 'bg-white text-construction-muted border-construction-border hover:border-construction-yellow hover:text-construction-black'
                                    }`}
                                  onClick={() => {
                                    setNewProject({
                                      ...newProject,
                                      supervisor_ids: checked
                                        ? newProject.supervisor_ids.filter((id) => id !== s.id)
                                        : [...newProject.supervisor_ids, s.id],
                                    })
                                  }}
                                >
                                  {s.username}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-construction-muted uppercase mb-3 ml-1 flex items-center gap-2">
                          <Building size={14} /> Assign Owners
                        </div>
                        <div className="p-3 rounded border border-construction-border bg-gray-50 h-32 overflow-y-auto">
                          <div className="flex flex-wrap gap-2">
                            {owners.map((o) => {
                              const checked = newProject.owner_ids.includes(o.id)
                              return (
                                <button
                                  type="button"
                                  key={o.id}
                                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${checked
                                    ? 'bg-construction-black text-white border-black shadow-sm'
                                    : 'bg-white text-construction-muted border-construction-border hover:border-construction-black hover:text-construction-black'
                                    }`}
                                  onClick={() => {
                                    setNewProject({
                                      ...newProject,
                                      owner_ids: checked
                                        ? newProject.owner_ids.filter((id) => id !== o.id)
                                        : [...newProject.owner_ids, o.id],
                                    })
                                  }}
                                >
                                  {o.username}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Phase Management Section */}
                  <div className="md:col-span-6 border-t border-gray-100 pt-6 mt-2">
                    <div className="text-xs font-bold text-construction-muted uppercase mb-3 ml-1 flex items-center gap-2">
                      <FileSpreadsheet size={14} /> Project Phases
                    </div>

                    {/* Add Phase Input */}
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        className="flex-1 rounded border border-construction-border bg-white px-3 py-2 text-sm"
                        placeholder="Phase name (e.g., Foundation)"
                        value={phaseInput.name}
                        onChange={(e) => setPhaseInput({ ...phaseInput, name: e.target.value })}
                      />
                      <input
                        type="text"
                        className="flex-1 rounded border border-construction-border bg-white px-3 py-2 text-sm"
                        placeholder="Description (optional)"
                        value={phaseInput.description}
                        onChange={(e) => setPhaseInput({ ...phaseInput, description: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (phaseInput.name.trim()) {
                            setNewProject({
                              ...newProject,
                              phases: [
                                ...(newProject.phases || []),
                                {
                                  name: phaseInput.name.trim(),
                                  description: phaseInput.description.trim(),
                                  order: (newProject.phases?.length || 0) + 1,
                                },
                              ],
                            })
                            setPhaseInput({ name: '', description: '' })
                          }
                        }}
                        leftIcon={<Plus size={14} />}
                      >
                        Add
                      </Button>
                    </div>

                    {/* Phase List */}
                    <div className="p-3 rounded border border-construction-border bg-gray-50 min-h-[80px]">
                      {!newProject.phases || newProject.phases.length === 0 ? (
                        <p className="text-xs text-construction-muted text-center py-4">
                          No phases added yet. Add phases to organize project tasks.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {newProject.phases.map((phase, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 bg-white rounded border border-construction-border"
                            >
                              <div className="flex-1">
                                <div className="font-bold text-sm text-construction-black">
                                  {index + 1}. {phase.name}
                                </div>
                                {phase.description && (
                                  <div className="text-xs text-construction-muted">{phase.description}</div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewProject({
                                    ...newProject,
                                    phases: newProject.phases?.filter((_, i) => i !== index).map((p, i) => ({
                                      ...p,
                                      order: i + 1,
                                    })),
                                  })
                                }}
                                className="text-construction-danger hover:text-red-700 p-1"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-6 flex justify-end mt-4">
                    <Button
                      type="submit"
                      variant="primary"
                      isLoading={createProjectMutation.isPending}
                      leftIcon={<Plus size={16} />}
                    >
                      Create Project
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          )}

          {/* MATERIAL AUCTION TAB */}
          {activeTab === 'auctions' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card title="Publish Material Auction" subtitle="Create Request for Quotation (RFQ)">
                <form onSubmit={handleCreateAuction} className="grid gap-6 md:grid-cols-6 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Project</label>
                    <select
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      value={newAuction.project ?? ''}
                      onChange={(e) => setNewAuction({ ...newAuction, project: e.target.value ? Number(e.target.value) : null })}
                      required
                    >
                      <option value="">Select project…</option>
                      {projects?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Requirement</label>
                    <input
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      placeholder="e.g. Cement 500 bags"
                      value={newAuction.description}
                      onChange={(e) => setNewAuction({ ...newAuction, description: e.target.value })}
                      required
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1.5 ml-1">Deadline</label>
                    <input
                      type="date"
                      className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                      value={newAuction.needed_by || ''}
                      onChange={(e) => setNewAuction({ ...newAuction, needed_by: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-6 flex justify-end mt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      isLoading={createAuctionMutation.isPending}
                      leftIcon={<Gavel size={16} />}
                    >
                      Publish Auction
                    </Button>
                  </div>
                </form>
                <p className="mt-6 text-xs text-construction-muted font-bold tracking-wide uppercase border-t border-gray-100 pt-4 flex items-center gap-2">
                  <FileSpreadsheet size={14} />
                  Published auctions appear instantly in the Contractor portal.
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
