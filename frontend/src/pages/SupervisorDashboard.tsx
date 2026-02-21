import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageShell, PageHeader, KpiTile } from '../components/layout/Page'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ClipboardCheck, Users, Clock, HardHat, Camera, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { TaskApprovalWorkflow } from '../components/TaskApprovalWorkflow'
import { DailySheetFiller } from '../components/DailySheetFiller'

interface Task {
  id: number
  title: string
  status: string
  progress_percent: number
}

interface Attendance {
  id: number
  date: string
  total_workers: number
  present_workers: number
  project_name?: string
}

interface Project {
  id: number
  name: string
}

interface ConstructionWorker {
  id: number
  name: string
  role: string
  project: number
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

export function SupervisorDashboard() {
  const queryClient = useQueryClient()
  const [photoProjectId, setPhotoProjectId] = useState<number | ''>('')
  const [pictureName, setPictureName] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [attProjectId, setAttProjectId] = useState<number | ''>('')
  const [attDate, setAttDate] = useState(() => new Date().toISOString().split('T')[0])
  const [attEntries, setAttEntries] = useState<Record<number, boolean>>({})

  const { data: tasks, error: tasksError } = useQuery({
    queryKey: ['supervisor-tasks'],
    queryFn: async () => {
      const res = await api.get<any>('/tasks/')
      return toArray(res.data)
    },
    retry: 1,
  })

  const { data: attendance, error: attendanceError } = useQuery({
    queryKey: ['attendance'],
    queryFn: async () => {
      const res = await api.get<any>('/attendance/')
      return toArray(res.data)
    },
    retry: 1,
  })

  const { data: projects } = useQuery({
    queryKey: ['supervisor-projects'],
    queryFn: async () => {
      const res = await api.get<any>('/projects/')
      return toArray(res.data) as Project[]
    },
  })

  const { data: workers, refetch: refetchWorkers } = useQuery({
    queryKey: ['construction-workers', attProjectId],
    queryFn: async () => {
      if (!attProjectId) return []
      const res = await api.get<any>(`/construction-workers/?project=${attProjectId}`)
      return toArray(res.data) as ConstructionWorker[]
    },
    enabled: !!attProjectId,
    refetchInterval: 10000, // Sync: workers added by PM appear here within 10s or on Refresh
  })

  const uploadPhotoMutation = useMutation({
    mutationFn: async () => {
      if (!photoFile || !photoProjectId) throw new Error('Select project and image')
      const form = new FormData()
      form.append('project', String(photoProjectId))
      form.append('image', photoFile)
      if (pictureName.trim()) form.append('picture_name', pictureName.trim())
      await api.post('/site-photos/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-photos'] })
      setPhotoFile(null)
      setPictureName('')
      alert('Photo uploaded successfully.')
    },
    onError: (e: any) => {
      alert(e.response?.data?.detail || e.message || 'Upload failed')
    },
  })

  const submitAttendanceMutation = useMutation({
    mutationFn: async () => {
      if (!attProjectId || !workers?.length) throw new Error('Select project with workers')
      const entries = workers.map((w) => ({
        worker_id: w.id,
        present: attEntries[w.id] ?? true,
      }))
      await api.post('/attendance/submit-with-entries/', {
        project: Number(attProjectId),
        date: attDate,
        notes: '',
        entries,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setAttEntries({})
      alert('Attendance recorded successfully.')
    },
    onError: (e: any) => {
      const msg = e.response?.data?.date?.[0] || e.response?.data?.detail || e.message
      alert(msg || 'Failed to record attendance')
    },
  })

  if (tasksError || attendanceError) {
    return (
      <PageShell>
        <PageHeader title="Site Engineer" subtitle="Daily execution: tasks, photos, and attendance." badge="Site Engineer" />
        <div className="p-6 bg-red-50 border-l-4 border-red-500 rounded-md">
          <p className="text-red-700 font-semibold">Error loading data. Please check your connection and try again.</p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Site Engineer"
        subtitle="Daily execution: tasks, site photos, and worker attendance."
        badge="Site Engineer"
        kpisRight={
          <>
            <KpiTile label="Tasks" value={tasks?.length || 0} icon={<ClipboardCheck size={20} />} />
            <KpiTile label="Records" value={attendance?.length || 0} icon={<Users size={20} />} />
          </>
        }
      />

      {/* Task Approval Workflow */}
      <TaskApprovalWorkflow userRole="supervisor" />

      <div className="grid gap-8 lg:grid-cols-2">

        <Card title="Upload Site Photo" subtitle="Take or select a picture; it will appear on PM and Experts Panel">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-construction-muted mb-1">Project</label>
              <select
                className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow"
                value={photoProjectId}
                onChange={(e) => setPhotoProjectId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Select project</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-construction-muted mb-1">Picture name (optional)</label>
              <input
                type="text"
                className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow"
                placeholder="e.g. Foundation progress"
                value={pictureName}
                onChange={(e) => setPictureName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-construction-muted mb-1">Image</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="w-full text-sm text-construction-muted file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-construction-yellow file:text-construction-black file:font-bold file:uppercase"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              />
            </div>
            <Button
              onClick={() => uploadPhotoMutation.mutate()}
              disabled={!photoFile || !photoProjectId || uploadPhotoMutation.isPending}
              leftIcon={<Camera size={18} />}
            >
              {uploadPhotoMutation.isPending ? 'Uploading…' : 'Upload Photo'}
            </Button>
          </div>
        </Card>

        <Card title="Record Attendance" subtitle="Select project and date, then mark workers present/absent">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-construction-muted mb-1">Project</label>
              <select
                className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow"
                value={attProjectId}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : ''
                  setAttProjectId(v)
                  setAttEntries({})
                }}
              >
                <option value="">Select project</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-construction-muted mb-1">Date</label>
              <input
                type="date"
                className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow"
                value={attDate}
                onChange={(e) => setAttDate(e.target.value)}
              />
            </div>
            {attProjectId && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase text-construction-muted">
                  {workers && workers.length > 0 ? 'Mark present / absent' : 'Workers (add via PM dashboard; list syncs here)'}
                </p>
                <Button variant="ghost" size="sm" onClick={() => refetchWorkers()} disabled={!attProjectId}>
                  Refresh workers
                </Button>
              </div>
            )}
            {workers && workers.length > 0 && (
              <>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {workers.map((w) => (
                    <label key={w.id} className="flex items-center gap-3 p-2 rounded border border-construction-border hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={attEntries[w.id] ?? true}
                        onChange={(e) => setAttEntries((prev) => ({ ...prev, [w.id]: e.target.checked }))}
                        className="rounded border-construction-border text-construction-yellow focus:ring-construction-yellow"
                      />
                      <span className="font-semibold text-construction-black">{w.name}</span>
                      {w.role && <Badge variant="outline">{w.role}</Badge>}
                    </label>
                  ))}
                </div>
                <Button
                  onClick={() => submitAttendanceMutation.mutate()}
                  disabled={submitAttendanceMutation.isPending}
                  leftIcon={<UserPlus size={18} />}
                >
                  {submitAttendanceMutation.isPending ? 'Submitting…' : 'Submit Attendance'}
                </Button>
              </>
            )}
            {attProjectId && workers?.length === 0 && (
              <p className="text-sm text-construction-muted">No construction workers added for this project. Ask Project Manager to add workers.</p>
            )}
          </div>
        </Card>

        <Card title="Attendance History" subtitle="Immutable audit log">
          <div className="space-y-4">
            {attendance?.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-construction-border bg-white p-4 hover:border-construction-yellow transition-all shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    <HardHat size={20} />
                  </div>
                  <div>
                    <div className="text-construction-black font-bold font-header tracking-wide text-lg">{a.date}</div>
                    <div className="text-xs text-construction-muted uppercase font-bold">{a.project_name || `Project #${a.id}`}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-construction-black font-header">
                    <span className="text-green-600">{a.present_workers}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span>{a.total_workers}</span>
                  </div>
                  <div className="text-[10px] text-construction-muted uppercase font-bold tracking-wider">Present</div>
                </div>
              </div>
            ))}
            {(!attendance || attendance.length === 0) && (
              <div className="text-center py-12 text-construction-muted border-2 border-dashed border-construction-border rounded-lg bg-gray-50">
                <p>No attendance records.</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Daily Sheet Filling Section */}
      <DailySheetFiller />
    </PageShell>
  )
}
