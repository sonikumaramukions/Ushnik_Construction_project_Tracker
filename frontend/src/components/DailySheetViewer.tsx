import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, type DailySheetEntry } from '../lib/api'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Download, FileSpreadsheet, Calendar } from 'lucide-react'

function toArray<T>(data: T[] | { results: T[] } | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : (data.results || [])
}

export function DailySheetViewer() {
  const [selectedProject, setSelectedProject] = useState<number | ''>('')

  const { data: projects } = useQuery({
    queryKey: ['owner-projects'],
    queryFn: async () => {
      const res = await api.get<any>('/projects/')
      return toArray(res.data)
    },
  })

  const { data: entries } = useQuery({
    queryKey: ['daily-sheet-entries', selectedProject],
    queryFn: async () => {
      if (!selectedProject) return []
      const res = await api.get<any>(`/daily-sheet-entries/by-project/${selectedProject}/`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: !!selectedProject,
  })

  const downloadExcelMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const response = await api.get(`/daily-sheet-entries/${entryId}/download-excel/`, {
        responseType: 'blob',
      })
      return { blob: response.data, entry: entries?.find(e => e.id === entryId) }
    },
    onSuccess: ({ blob, entry }) => {
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${entry?.template_name}-${entry?.date}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    },
    onError: () => {
      alert('Failed to download Excel file')
    },
  })

  return (
    <Card title="Daily Sheets" subtitle="View and download daily project sheets">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-construction-black mb-1">Select Project</label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(Number(e.target.value) || '')}
            className="w-full px-3 py-2 border border-construction-border rounded-md"
          >
            <option value="">Select a project</option>
            {projects?.map((project: any) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {selectedProject && (
          <div className="space-y-3">
            {!entries || entries.length === 0 ? (
              <div className="text-center py-12 text-construction-muted border-2 border-dashed border-construction-border rounded-lg">
                <FileSpreadsheet size={32} className="mx-auto mb-2 opacity-50" />
                <p>No daily sheets found for this project</p>
              </div>
            ) : (
              entries.map((entry: DailySheetEntry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-construction-border bg-gray-50 hover:bg-white transition-all"
                >
                  <div className="flex-1">
                    <div className="font-bold text-construction-black flex items-center gap-2">
                      <FileSpreadsheet size={16} />
                      {entry.template_name}
                    </div>
                    <div className="text-sm text-construction-muted flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(entry.date).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </span>
                      <span>Filled by: {entry.filled_by_username}</span>
                      <span>
                        Submitted: {new Date(entry.submitted_at).toLocaleDateString()}
                      </span>
                    </div>
                    {entry.notes && (
                      <div className="text-xs text-construction-muted mt-2 p-2 bg-yellow-50 rounded">
                        <strong>Notes:</strong> {entry.notes}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadExcelMutation.mutate(entry.id)}
                    leftIcon={<Download size={14} />}
                  >
                    Download Excel
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
