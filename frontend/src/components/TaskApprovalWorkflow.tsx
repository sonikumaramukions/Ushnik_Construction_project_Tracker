import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'

interface Task {
    id: number
    title: string
    description: string
    status: string
    approval_status: string
    supervisor: number | null
    phase: number
    progress_percent: number
}

interface Phase {
    id: number
    name: string
    project: number
}

interface Project {
    id: number
    name: string
}

interface User {
    id: number
    username: string
    role: string
}

interface TaskApprovalWorkflowProps {
    userRole: 'project_manager' | 'supervisor'
}

export function TaskApprovalWorkflow({ userRole }: TaskApprovalWorkflowProps) {
    const queryClient = useQueryClient()
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [taskTitle, setTaskTitle] = useState('')
    const [taskDescription, setTaskDescription] = useState('')
    const [selectedProject, setSelectedProject] = useState<number | ''>('')
    const [selectedPhase, setSelectedPhase] = useState<number | ''>('')
    const [selectedSupervisor, setSelectedSupervisor] = useState<number | ''>('')

    // Fetch projects
    const { data: projects } = useQuery<Project[]>({
        queryKey: ['projects'],
        queryFn: async () => {
            const res = await api.get<any>('/projects/')
            return Array.isArray(res.data) ? res.data : (res.data.results || [])
        },
        enabled: userRole === 'project_manager',
    })

    // Fetch phases filtered by selected project
    const { data: phases } = useQuery<Phase[]>({
        queryKey: ['phases', selectedProject],
        queryFn: async () => {
            const res = await api.get<any>('/phases/')
            const allPhases = Array.isArray(res.data) ? res.data : (res.data.results || [])
            // Filter phases by selected project
            return selectedProject ? allPhases.filter((p: Phase) => p.project === selectedProject) : []
        },
        enabled: !!selectedProject,
    })

    // Fetch supervisors
    const { data: supervisors } = useQuery<User[]>({
        queryKey: ['supervisors'],
        queryFn: async () => {
            const res = await api.get<any>('/users/?role=supervisor')
            return Array.isArray(res.data) ? res.data : (res.data.results || [])
        },
        enabled: userRole === 'project_manager',
    })

    // Fetch tasks
    const { data: tasks } = useQuery<Task[]>({
        queryKey: ['approval-tasks'],
        queryFn: async () => {
            const res = await api.get<any>('/tasks/')
            return Array.isArray(res.data) ? res.data : (res.data.results || [])
        },
    })

    // Create task mutation
    const createTaskMutation = useMutation({
        mutationFn: async () => {
            if (!selectedProject || !selectedPhase || !taskTitle.trim() || !selectedSupervisor) {
                throw new Error('Please fill all required fields')
            }

            const res = await api.post('/tasks/', {
                phase: selectedPhase,
                title: taskTitle.trim(),
                description: taskDescription.trim(),
                supervisor: selectedSupervisor,
                approval_status: 'pending_acceptance',
            })

            // Send notification to supervisor
            await api.post(`/tasks/${res.data.id}/assign_supervisor/`, {
                supervisor_id: selectedSupervisor
            })

            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['approval-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['pm-tasks'] })
            setTaskTitle('')
            setTaskDescription('')
            setSelectedProject('')
            setSelectedPhase('')
            setSelectedSupervisor('')
            setShowCreateForm(false)
            alert('Task created and assigned successfully!')
        },
        onError: (e: any) => {
            alert(e.response?.data?.detail || e.message || 'Failed to create task')
        },
    })

    // Accept task mutation
    const acceptTaskMutation = useMutation({
        mutationFn: async (taskId: number) => {
            return await api.post(`/tasks/${taskId}/accept_task/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['approval-tasks'] })
            alert('Task accepted successfully!')
        },
    })

    // Reject task mutation
    const rejectTaskMutation = useMutation({
        mutationFn: async (taskId: number) => {
            return await api.post(`/tasks/${taskId}/reject_task/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['approval-tasks'] })
            alert('Task rejected')
        },
    })

    // Mark done mutation
    const markDoneMutation = useMutation({
        mutationFn: async (taskId: number) => {
            return await api.post(`/tasks/${taskId}/mark_done/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['approval-tasks'] })
            alert('Task marked as done, awaiting PM approval')
        },
    })

    // Approve completion mutation
    const approveCompletionMutation = useMutation({
        mutationFn: async (taskId: number) => {
            return await api.post(`/tasks/${taskId}/approve_completion/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['approval-tasks'] })
            alert('Task completion approved!')
        },
    })

    const getApprovalStatusBadge = (approvalStatus: string) => {
        switch (approvalStatus) {
            case 'pending_acceptance':
                return <Badge variant="warning">Pending Acceptance</Badge>
            case 'accepted':
                return <Badge variant="success">Accepted</Badge>
            case 'rejected':
                return <Badge variant="danger">Rejected</Badge>
            case 'pending_completion':
                return <Badge variant="warning">Pending Approval</Badge>
            case 'approved':
                return <Badge variant="success">Approved</Badge>
            default:
                return <Badge>{approvalStatus}</Badge>
        }
    }

    // Filter tasks based on user role
    const filteredTasks = tasks?.filter(task => {
        if (userRole === 'project_manager') {
            return task.approval_status === 'pending_completion' || task.approval_status === 'pending_acceptance'
        } else {
            return task.approval_status === 'pending_acceptance' || task.approval_status === 'accepted'
        }
    }) || []

    return (
        <Card
            title={userRole === 'project_manager' ? 'Task Management' : 'My Tasks'}
            subtitle={userRole === 'project_manager' ? 'Create and approve tasks' : 'Accept and complete tasks'}
        >
            <div className="space-y-4">
                {/* Create Task Form (PM only) */}
                {userRole === 'project_manager' && (
                    <div>
                        {!showCreateForm ? (
                            <Button onClick={() => setShowCreateForm(true)}>
                                + Create New Task
                            </Button>
                        ) : (
                            <div className="space-y-4 p-4 border border-construction-border rounded-lg bg-gray-50">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1">
                                        Project *
                                    </label>
                                    <select
                                        className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm"
                                        value={selectedProject}
                                        onChange={(e) => {
                                            setSelectedProject(e.target.value ? Number(e.target.value) : '')
                                            setSelectedPhase('') // Reset phase when project changes
                                        }}
                                    >
                                        <option value="">Select project</option>
                                        {projects?.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1">
                                        Phase *
                                    </label>
                                    <select
                                        className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm"
                                        value={selectedPhase}
                                        onChange={(e) => setSelectedPhase(e.target.value ? Number(e.target.value) : '')}
                                        disabled={!selectedProject}
                                    >
                                        <option value="">Select phase</option>
                                        {phases?.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    {!selectedProject && (
                                        <p className="text-xs text-construction-muted mt-1">Please select a project first</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1">
                                        Task Title *
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm"
                                        placeholder="e.g. Install electrical wiring"
                                        value={taskTitle}
                                        onChange={(e) => setTaskTitle(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm"
                                        rows={3}
                                        placeholder="Task details..."
                                        value={taskDescription}
                                        onChange={(e) => setTaskDescription(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-construction-muted mb-1">
                                        Assign to Site Manager *
                                    </label>
                                    <select
                                        className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm"
                                        value={selectedSupervisor}
                                        onChange={(e) => setSelectedSupervisor(e.target.value ? Number(e.target.value) : '')}
                                    >
                                        <option value="">Select site manager</option>
                                        {supervisors?.map((s) => (
                                            <option key={s.id} value={s.id}>{s.username}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => createTaskMutation.mutate()}
                                        disabled={createTaskMutation.isPending}
                                    >
                                        {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
                                    </Button>
                                    <Button
                                        onClick={() => setShowCreateForm(false)}
                                        variant="secondary"
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Task List */}
                <div className="space-y-3">
                    {filteredTasks.length === 0 ? (
                        <div className="text-center py-8 text-construction-muted">
                            <p>No tasks requiring action</p>
                        </div>
                    ) : (
                        filteredTasks.map((task) => (
                            <div
                                key={task.id}
                                className="p-4 border border-construction-border rounded-lg bg-white hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                        <h4 className="font-header font-bold text-construction-black">{task.title}</h4>
                                        {task.description && (
                                            <p className="text-sm text-construction-muted mt-1">{task.description}</p>
                                        )}
                                    </div>
                                    {getApprovalStatusBadge(task.approval_status)}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2 mt-3">
                                    {userRole === 'supervisor' && task.approval_status === 'pending_acceptance' && (
                                        <>
                                            <Button
                                                onClick={() => acceptTaskMutation.mutate(task.id)}
                                                disabled={acceptTaskMutation.isPending}
                                                leftIcon={<CheckCircle2 size={16} />}
                                                size="sm"
                                            >
                                                Accept
                                            </Button>
                                            <Button
                                                onClick={() => rejectTaskMutation.mutate(task.id)}
                                                disabled={rejectTaskMutation.isPending}
                                                leftIcon={<XCircle size={16} />}
                                                variant="secondary"
                                                size="sm"
                                            >
                                                Reject
                                            </Button>
                                        </>
                                    )}

                                    {userRole === 'supervisor' && task.approval_status === 'accepted' && (
                                        <Button
                                            onClick={() => markDoneMutation.mutate(task.id)}
                                            disabled={markDoneMutation.isPending}
                                            leftIcon={<CheckCircle2 size={16} />}
                                            size="sm"
                                        >
                                            Mark as Done
                                        </Button>
                                    )}

                                    {userRole === 'project_manager' && task.approval_status === 'pending_completion' && (
                                        <Button
                                            onClick={() => approveCompletionMutation.mutate(task.id)}
                                            disabled={approveCompletionMutation.isPending}
                                            leftIcon={<CheckCircle2 size={16} />}
                                            size="sm"
                                        >
                                            Approve Completion
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </Card>
    )
}
