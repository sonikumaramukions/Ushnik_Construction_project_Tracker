import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { api, MEDIA_BASE_URL } from '../lib/api'
import { PageShell, PageHeader, KpiTile } from '../components/layout/Page'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ArrowLeft, Camera, CheckCircle2, Clock, AlertCircle, XCircle, Calendar } from 'lucide-react'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
    PieChart,
    Pie,
    Cell,
} from 'recharts'

interface SitePhoto {
    id: number
    project: number
    project_name: string
    image: string
    picture_name: string
    uploaded_by_username: string
    uploaded_at: string
}

interface TaskStats {
    total: number
    completed: number
    in_progress: number
    pending: number
    blocked: number
    completion_percentage: number
}

interface TaskTimeline {
    completion_date: string
    count: number
}

interface ProjectDetail {
    project: {
        id: number
        name: string
        description: string
        city: string
        location: string
        progress_percent: number
        client_name: string
        estimated_budget: string
        start_date: string
        end_date: string
    }
    photos: SitePhoto[]
    task_stats: TaskStats
    task_timeline: TaskTimeline[]
}

const COLORS = {
    completed: '#22c55e',
    in_progress: '#F4D03F',
    pending: '#94a3b8',
    blocked: '#ef4444',
}

export function ProjectDetailPage() {
    const { projectId } = useParams<{ projectId: string }>()
    const navigate = useNavigate()

    const { data, isLoading, error } = useQuery({
        queryKey: ['project-detail', projectId],
        queryFn: async () => {
            const res = await api.get<ProjectDetail>(`/projects/${projectId}/detail_stats/`)
            return res.data
        },
        enabled: !!projectId,
    })

    if (isLoading) {
        return (
            <PageShell>
                <div className="flex items-center justify-center h-64">
                    <div className="text-construction-muted">Loading project details...</div>
                </div>
            </PageShell>
        )
    }

    if (error || !data) {
        return (
            <PageShell>
                <div className="p-6 bg-red-50 border-l-4 border-red-500 rounded-md">
                    <p className="text-red-700 font-semibold">Failed to load project details.</p>
                </div>
            </PageShell>
        )
    }

    const { project, photos, task_stats, task_timeline } = data

    // Prepare pie chart data
    const pieData = [
        { name: 'Completed', value: task_stats.completed, color: COLORS.completed },
        { name: 'In Progress', value: task_stats.in_progress, color: COLORS.in_progress },
        { name: 'Pending', value: task_stats.pending, color: COLORS.pending },
        { name: 'Blocked', value: task_stats.blocked, color: COLORS.blocked },
    ].filter(item => item.value > 0)

    // Prepare timeline chart data
    const timelineData = task_timeline.map(item => ({
        date: new Date(item.completion_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        tasks: item.count,
    }))

    return (
        <PageShell>
            <div className="mb-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(-1)}
                    leftIcon={<ArrowLeft size={16} />}
                >
                    Back
                </Button>
            </div>

            <PageHeader
                title={project.name}
                subtitle={`${project.city || 'N/A'} · ${project.location || 'N/A'}`}
                badge={`${project.progress_percent}% Complete`}
                kpisRight={
                    <>
                        <KpiTile
                            label="Total Tasks"
                            value={task_stats.total}
                            icon={<CheckCircle2 size={20} />}
                        />
                        <KpiTile
                            label="Completed"
                            value={task_stats.completed}
                            icon={<CheckCircle2 size={20} />}
                            trend={`${task_stats.completion_percentage}%`}
                        />
                        <KpiTile
                            label="Photos"
                            value={photos.length}
                            icon={<Camera size={20} />}
                        />
                    </>
                }
            />

            {/* Project Information */}
            <Card title="Project Information" subtitle="Overview">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <div className="text-xs font-bold uppercase text-construction-muted mb-1">Client</div>
                        <div className="text-construction-black font-semibold">{project.client_name || '—'}</div>
                    </div>
                    <div>
                        <div className="text-xs font-bold uppercase text-construction-muted mb-1">Budget</div>
                        <div className="text-construction-black font-semibold">
                            {project.estimated_budget ? `₹${Number(project.estimated_budget).toLocaleString()}` : '—'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-bold uppercase text-construction-muted mb-1">Start Date</div>
                        <div className="text-construction-black font-semibold flex items-center gap-1">
                            <Calendar size={14} />
                            {project.start_date ? new Date(project.start_date).toLocaleDateString() : '—'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-bold uppercase text-construction-muted mb-1">End Date</div>
                        <div className="text-construction-black font-semibold flex items-center gap-1">
                            <Calendar size={14} />
                            {project.end_date ? new Date(project.end_date).toLocaleDateString() : '—'}
                        </div>
                    </div>
                </div>
                {project.description && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="text-xs font-bold uppercase text-construction-muted mb-2">Description</div>
                        <p className="text-construction-black text-sm">{project.description}</p>
                    </div>
                )}
            </Card>

            {/* Task Statistics */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Task Breakdown" subtitle="Current status distribution">
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                            <div className="flex items-center gap-2 mb-1">
                                <CheckCircle2 size={16} className="text-green-600" />
                                <span className="text-xs font-bold uppercase text-green-700">Completed</span>
                            </div>
                            <div className="text-2xl font-bold text-green-600 font-header">{task_stats.completed}</div>
                        </div>
                        <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock size={16} className="text-yellow-600" />
                                <span className="text-xs font-bold uppercase text-yellow-700">In Progress</span>
                            </div>
                            <div className="text-2xl font-bold text-yellow-600 font-header">{task_stats.in_progress}</div>
                        </div>
                        <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertCircle size={16} className="text-gray-600" />
                                <span className="text-xs font-bold uppercase text-gray-700">Pending</span>
                            </div>
                            <div className="text-2xl font-bold text-gray-600 font-header">{task_stats.pending}</div>
                        </div>
                        <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                            <div className="flex items-center gap-2 mb-1">
                                <XCircle size={16} className="text-red-600" />
                                <span className="text-xs font-bold uppercase text-red-700">Blocked</span>
                            </div>
                            <div className="text-2xl font-bold text-red-600 font-header">{task_stats.blocked}</div>
                        </div>
                    </div>

                    {pieData.length > 0 && (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={(entry) => `${entry.name}: ${((entry.percent ?? 0) * 100).toFixed(0)}%`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>

                <Card title="Task Completion Timeline" subtitle="Tasks completed over time">
                    <div className="h-80 w-full">
                        {timelineData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-construction-muted border-2 border-dashed border-construction-border rounded-lg bg-gray-50">
                                <p>No completed tasks yet.</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={timelineData}>
                                    <XAxis
                                        dataKey="date"
                                        stroke="#94a3b8"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#94a3b8"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#FFFFFF',
                                            borderColor: '#e2e8f0',
                                            borderRadius: '8px',
                                            color: '#1e293b',
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                        }}
                                        itemStyle={{ color: '#1e293b' }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                    <Bar
                                        dataKey="tasks"
                                        fill="#F4D03F"
                                        radius={[8, 8, 0, 0]}
                                        name="Tasks Completed"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </Card>
            </div>

            {/* Site Photos Gallery */}
            <Card title="Site Photos" subtitle={`${photos.length} photos uploaded by Site Engineers`}>
                <div className="space-y-4">
                    {photos.length === 0 ? (
                        <div className="text-center py-12 text-construction-muted border-2 border-dashed border-construction-border rounded-lg bg-gray-50">
                            <Camera size={32} className="mx-auto mb-2 opacity-50" />
                            <p>No site photos uploaded yet.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {photos.map((photo) => (
                                <div
                                    key={photo.id}
                                    className="rounded-lg border border-construction-border overflow-hidden bg-gray-50 hover:shadow-lg transition-shadow"
                                >
                                    <img
                                        src={photo.image.startsWith('http') ? photo.image : `${MEDIA_BASE_URL}${photo.image}`}
                                        alt={photo.picture_name || 'Site photo'}
                                        className="w-full h-48 object-cover"
                                    />
                                    <div className="p-3">
                                        <p className="font-header font-bold text-construction-black text-sm">
                                            {photo.picture_name || 'Untitled'}
                                        </p>
                                        <p className="text-xs text-construction-muted mt-1">
                                            {photo.uploaded_by_username} · {new Date(photo.uploaded_at).toLocaleDateString()}
                                        </p>
                                        <p className="text-xs text-construction-muted">
                                            {new Date(photo.uploaded_at).toLocaleTimeString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>
        </PageShell>
    )
}
