import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, MEDIA_BASE_URL } from '../lib/api'
import { PageShell, PageHeader, KpiTile } from '../components/layout/Page'
import { Card } from '../components/ui/Card'
import { Building2, FileBarChart, MapPin, CalendarDays, Camera } from 'lucide-react'
import { DailySheetViewer } from '../components/DailySheetViewer'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface Project {
  id: number
  name: string
  city: string
  location: string
  progress_percent: number
}

interface DailyReport {
  id: number
  date: string
  project: number
  tasks_completed: number
  images_count: number
  material_requests_count: number
}

interface DashboardStats {
  total_projects: number
  by_city: { city: string, count: number, avg_progress: number }[]
  by_location: { location: string, count: number }[]
}

export function OwnerDashboard() {
  const navigate = useNavigate()

  const { data: projects } = useQuery({
    queryKey: ['owner-projects'],
    queryFn: async () => {
      const res = await api.get<any>('/projects/')
      // Handle paginated response (DRF returns { results: [...] }) or plain array
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
  })

  const { data: reports } = useQuery({
    queryKey: ['daily-reports'],
    queryFn: async () => {
      const res = await api.get<any>('/daily-reports/')
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
  })

  const { data: sitePhotos } = useQuery({
    queryKey: ['site-photos'],
    queryFn: async () => {
      const res = await api.get<any>('/site-photos/')
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
  })

  const displayProjects: Project[] = projects && projects.length > 0 ? projects : []
  const displayReports: DailyReport[] = reports && reports.length > 0 ? reports : []

  const byCityMap = displayProjects.reduce<Record<string, { count: number; totalProgress: number }>>((acc, p) => {
    const city = p.city || 'N/A'
    if (!acc[city]) acc[city] = { count: 0, totalProgress: 0 }
    acc[city].count += 1
    acc[city].totalProgress += p.progress_percent
    return acc
  }, {})
  const displayStats: DashboardStats = {
    total_projects: displayProjects.length,
    by_city: Object.entries(byCityMap).map(([city, v]) => ({
      city,
      count: v.count,
      avg_progress: v.count ? Math.round(v.totalProgress / v.count) : 0,
    })),
    by_location: displayProjects.map(p => ({ location: p.location || 'N/A', count: 1 })),
  }

  const chartData =
    displayReports.map((r) => ({
      date: r.date,
      tasks: r.tasks_completed,
      images: r.images_count,
      requests: r.material_requests_count,
    }))

  return (
    <PageShell>
      <PageHeader
        title="Experts Panel"
        subtitle="High-level visibility across projects, locations, and daily activity."
        badge="Experts Panel"
        kpisRight={
          <>
            <KpiTile
              label="Projects"
              value={displayProjects.length}
              icon={<Building2 size={20} />}
              trend="+2 this month"
            />
            <KpiTile
              label="Reports"
              value={displayReports.length}
              icon={<FileBarChart size={20} />}
            />
          </>
        }
      />

      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="flex flex-col justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-construction-muted mb-2">Total Projects</div>
          <div className="text-4xl font-bold text-construction-black font-header">{displayStats.total_projects}</div>
          <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-construction-muted font-medium flex items-center gap-1">
            <Building2 size={12} /> Active Sites
          </div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-construction-muted mb-2">Cities Covered</div>
          <div className="text-4xl font-bold text-construction-black font-header">{displayStats.by_city.length}</div>
          <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-construction-muted font-medium flex items-center gap-1">
            <MapPin size={12} /> Regional Spread
          </div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-construction-muted mb-2">Avg Progress</div>
          <div className="text-4xl font-bold text-construction-yellow font-header">
            {Math.round(
              displayProjects.reduce((acc, curr) => acc + curr.progress_percent, 0) /
              (displayProjects.length || 1)
            )}
            %
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-construction-muted font-medium flex items-center gap-1">
            <CalendarDays size={12} /> On Schedule
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Projects" subtitle="City & Location Breakdown">
          <div className="space-y-4">
            {displayProjects.length === 0 ? (
              <div className="text-center py-12 text-construction-muted border-2 border-dashed border-construction-border rounded-lg bg-gray-50">
                <Building2 size={32} className="mx-auto mb-2 opacity-50" />
                <p>No projects yet. Admin can create projects from the Admin Console.</p>
              </div>
            ) : displayProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/project/${p.id}`)}
                className="flex items-center justify-between p-4 rounded-lg border border-construction-border bg-gray-50 hover:bg-white hover:border-construction-yellow transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-construction-light flex items-center justify-center text-construction-grey font-bold">
                    {p.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-header font-bold text-construction-black hover:text-construction-yellow transition-colors">{p.name}</div>
                    <div className="text-xs text-construction-muted uppercase font-bold tracking-wider flex items-center gap-1 mt-0.5">
                      <MapPin size={10} /> {p.city || 'N/A'} · {p.location || 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="text-right min-w-[100px]">
                  <div className="text-sm font-bold text-construction-black font-header">{p.progress_percent}%</div>
                  <div className="mt-1 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-construction-yellow rounded-full"
                      style={{ width: `${p.progress_percent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Daily Activity" subtitle="Tasks, Images, Requests Trend">
          <div className="h-[300px] w-full mt-4">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-construction-muted border-2 border-dashed border-construction-border rounded-lg bg-gray-50">
                <p>No daily reports yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '12px', fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Line
                    type="monotone"
                    dataKey="tasks"
                    stroke="#F4D03F"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#F4D03F', strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    name="Tasks"
                  />
                  <Line
                    type="monotone"
                    dataKey="images"
                    stroke="#1e293b"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#1e293b', strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    name="Images"
                  />
                  <Line
                    type="monotone"
                    dataKey="requests"
                    stroke="#22c55e"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    name="Requests"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Daily Sheets Section */}
      <DailySheetViewer />

    </PageShell>
  )
}
