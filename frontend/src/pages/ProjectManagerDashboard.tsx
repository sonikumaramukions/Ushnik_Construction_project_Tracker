import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { MEDIA_BASE_URL } from '../lib/api'
import { PageShell, PageHeader, KpiTile } from '../components/layout/Page'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { CheckCircle2, AlertCircle, Clock, FileText, UserPlus, Camera } from 'lucide-react'
import { useState } from 'react'
import { TaskApprovalWorkflow } from '../components/TaskApprovalWorkflow'
import { DailySheetManager } from '../components/DailySheetManager'

interface Task {
  id: number
  title: string
  status: string
  progress_percent: number
}

interface MaterialRequest {
  id: number
  status: string
  project: number
}

interface Project {
  id: number
  name: string
}

interface ConstructionWorker {
  id: number
  project: number
  name: string
  role: string
}

interface SitePhoto {
  id: number
  project: number
  project_name: string
  image: string
  picture_name: string
  uploaded_by_username: string
  uploaded_at: string
}

function toArray<T>(data: T[] | { results: T[] } | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : (data.results || [])
}

export function ProjectManagerDashboard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [workerProjectId, setWorkerProjectId] = useState<number | ''>('')
  const [workerName, setWorkerName] = useState('')
  const [workerRole, setWorkerRole] = useState('')

  const { data: tasks, error: tasksError } = useQuery<Task[]>({
    queryKey: ['pm-tasks'],
    queryFn: async () => {
      const res = await api.get<any>('/tasks/')
      // Handle paginated response (DRF returns { results: [...] }) or plain array
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
    retry: 1,
  })

  const { data: requests, error: requestsError } = useQuery<MaterialRequest[]>({
    queryKey: ['pm-material-requests'],
    queryFn: async () => {
      const res = await api.get<any>('/material-requests/')
      return toArray(res.data)
    },
    retry: 1,
  })

  const { data: projects } = useQuery({
    queryKey: ['pm-projects'],
    queryFn: async () => {
      const res = await api.get<any>('/projects/')
      return toArray(res.data) as Project[]
    },
  })

  const { data: sitePhotos } = useQuery({
    queryKey: ['site-photos'],
    queryFn: async () => {
      const res = await api.get<any>('/site-photos/')
      return toArray(res.data) as SitePhoto[]
    },
  })

  const addWorkerMutation = useMutation({
    mutationFn: async () => {
      if (!workerProjectId || !workerName.trim()) throw new Error('Select project and enter worker name')
      await api.post('/construction-workers/', {
        project: Number(workerProjectId),
        name: workerName.trim(),
        role: workerRole.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-workers'] })
      setWorkerName('')
      setWorkerRole('')
      alert('Construction worker added. Site Engineer will see them in the Record Attendance section.')
    },
    onError: (e: any) => {
      alert(e.response?.data?.detail || e.message || 'Failed to add worker')
    },
  })

  if (tasksError || requestsError) {
    return (
      <PageShell>
        <PageHeader title="Project Manager" subtitle="Manage tasks, approve material requests, and track project progress effectively." badge="Workspace" />
        <div className="p-6 bg-red-50 border-l-4 border-red-500 rounded-md">
          <p className="text-red-700 font-semibold">Error loading data. Please check your connection and try again.</p>
          {(tasksError || requestsError) && (
            <p className="text-red-600 text-sm mt-2">{tasksError?.message || requestsError?.message}</p>
          )}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Project Manager"
        subtitle="Manage tasks, approve material requests, and track project progress effectively."
        badge="Workspace"
        kpisRight={
          <>
            <KpiTile
              label="Active Tasks"
              value={tasks?.length || 0}
              icon={<CheckCircle2 size={20} />}
              trend="Updated just now"
            />
            <KpiTile
              label="Pending Requests"
              value={requests?.filter(r => r.status === 'pending').length || 0}
              icon={<AlertCircle size={20} />}
            />
          </>
        }
      />

      {/* My Projects Section */}
      <Card title="My Projects" subtitle="Projects you manage">
        <div className="space-y-4">
          {!projects || projects.length === 0 ? (
            <div className="text-center py-12 text-construction-muted border-2 border-dashed border-construction-border rounded-lg bg-gray-50">
              <p>No projects assigned yet.</p>
            </div>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="flex items-center justify-between p-4 rounded-lg border border-construction-border bg-gray-50 hover:bg-white hover:border-construction-yellow transition-all cursor-pointer hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-construction-light flex items-center justify-center text-construction-grey font-bold">
                    {project.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-header font-bold text-construction-black hover:text-construction-yellow transition-colors">
                      {project.name}
                    </div>
                    <div className="text-xs text-construction-muted uppercase font-bold tracking-wider">
                      Click to view details
                    </div>
                  </div>
                </div>
                <div className="text-construction-muted">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Task Approval Workflow */}
      <TaskApprovalWorkflow userRole="project_manager" />

      <div className="grid gap-6 lg:grid-cols-2">

        {/* Material Requests Section */}
        <Card title="Material Requests" subtitle="Pending Approvals">
          <div className="space-y-4">
            {requests?.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-4 rounded-lg border border-construction-border bg-white hover:border-construction-yellow transition-all">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded bg-construction-light flex items-center justify-center text-construction-grey">
                    <FileText size={20} />
                  </div>
                  <div>
                    <div className="font-header font-bold text-construction-black">Request #{req.id}</div>
                    <div className="text-xs text-construction-muted uppercase tracking-wider font-bold">Project ID: {req.project}</div>
                  </div>
                </div>
                <Badge
                  variant={
                    req.status === 'approved' ? 'success' :
                      req.status === 'rejected' ? 'danger' :
                        'warning'
                  }
                >
                  {req.status}
                </Badge>
              </div>
            )) ?? (
                <div className="text-center py-12 text-construction-muted border-2 border-dashed border-construction-border rounded-lg bg-gray-50">
                  <p>No pending requests.</p>
                </div>
              )}
          </div>
        </Card>

        <Card title="Add Construction Workers" subtitle="Add workers for attendance (visible to Site Engineer)">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-construction-muted mb-1">Project</label>
              <select
                className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow"
                value={workerProjectId}
                onChange={(e) => setWorkerProjectId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Select project</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-construction-muted mb-1">Worker name</label>
              <input
                type="text"
                className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow"
                placeholder="e.g. John Doe"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-construction-muted mb-1">Role (optional)</label>
              <input
                type="text"
                className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow"
                placeholder="e.g. Mason, Electrician"
                value={workerRole}
                onChange={(e) => setWorkerRole(e.target.value)}
              />
            </div>
            <Button
              onClick={() => addWorkerMutation.mutate()}
              disabled={!workerProjectId || !workerName.trim() || addWorkerMutation.isPending}
              leftIcon={<UserPlus size={18} />}
            >
              {addWorkerMutation.isPending ? 'Adding…' : 'Add Worker'}
            </Button>
          </div>
        </Card>
      </div>

      {/* Daily Sheet Templates Section */}
      <DailySheetManager />
    </PageShell>
  )
}
