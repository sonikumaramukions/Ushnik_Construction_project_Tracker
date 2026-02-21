import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type DailySheetTemplate } from '../lib/api'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Plus, Trash2, FileSpreadsheet } from 'lucide-react'

interface Project {
  id: number
  name: string
}

function toArray<T>(data: T[] | { results: T[] } | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : (data.results || [])
}

export function DailySheetManager() {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedProject, setSelectedProject] = useState<number | ''>('')
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [rowHeadings, setRowHeadings] = useState<string[]>([''])
  const [columnHeadings, setColumnHeadings] = useState<string[]>([''])

  const { data: projects } = useQuery({
    queryKey: ['pm-projects'],
    queryFn: async () => {
      const res = await api.get<any>('/projects/')
      return toArray(res.data) as Project[]
    },
  })

  const { data: templates, refetch: refetchTemplates } = useQuery({
    queryKey: ['daily-sheet-templates'],
    queryFn: async () => {
      const res = await api.get<any>('/daily-sheet-templates/')
      return toArray(res.data) as DailySheetTemplate[]
    },
  })

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject || !templateName.trim()) {
        throw new Error('Project and template name are required')
      }
      const filteredRows = rowHeadings.filter(r => r.trim())
      const filteredCols = columnHeadings.filter(c => c.trim())
      
      if (filteredRows.length === 0 || filteredCols.length === 0) {
        throw new Error('At least one row and one column heading is required')
      }

      await api.post('/daily-sheet-templates/', {
        project: selectedProject,
        name: templateName.trim(),
        description: templateDescription.trim(),
        row_headings: filteredRows,
        column_headings: filteredCols,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-sheet-templates'] })
      refetchTemplates()
      setShowCreateForm(false)
      setSelectedProject('')
      setTemplateName('')
      setTemplateDescription('')
      setRowHeadings([''])
      setColumnHeadings([''])
      alert('Daily sheet template created successfully!')
    },
    onError: (e: any) => {
      alert(e.response?.data?.detail || e.message || 'Failed to create template')
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      await api.delete(`/daily-sheet-templates/${templateId}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-sheet-templates'] })
      alert('Template deleted successfully')
    },
    onError: (e: any) => {
      alert(e.response?.data?.detail || e.message || 'Failed to delete template')
    },
  })

  const addRowHeading = () => {
    setRowHeadings([...rowHeadings, ''])
  }

  const updateRowHeading = (index: number, value: string) => {
    const updated = [...rowHeadings]
    updated[index] = value
    setRowHeadings(updated)
  }

  const removeRowHeading = (index: number) => {
    if (rowHeadings.length > 1) {
      setRowHeadings(rowHeadings.filter((_, i) => i !== index))
    }
  }

  const addColumnHeading = () => {
    setColumnHeadings([...columnHeadings, ''])
  }

  const updateColumnHeading = (index: number, value: string) => {
    const updated = [...columnHeadings]
    updated[index] = value
    setColumnHeadings(updated)
  }

  const removeColumnHeading = (index: number) => {
    if (columnHeadings.length > 1) {
      setColumnHeadings(columnHeadings.filter((_, i) => i !== index))
    }
  }

  return (
    <Card title="Daily Sheet Templates" subtitle="Create templates for daily reporting">
      <div className="space-y-4">
        {!showCreateForm ? (
          <>
            <Button
              onClick={() => setShowCreateForm(true)}
              leftIcon={<Plus size={16} />}
            >
              Create New Template
            </Button>

            <div className="space-y-3 mt-4">
              {!templates || templates.length === 0 ? (
                <div className="text-center py-8 text-construction-muted border-2 border-dashed border-construction-border rounded-lg">
                  <FileSpreadsheet size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No daily sheet templates yet.</p>
                  <p className="text-sm">Create a template to get started.</p>
                </div>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-construction-border bg-gray-50 hover:bg-white transition-all"
                  >
                    <div className="flex-1">
                      <div className="font-bold text-construction-black">{template.name}</div>
                      <div className="text-sm text-construction-muted">
                        {template.project_name} · {template.row_headings.length} rows × {template.column_headings.length} columns
                      </div>
                      {template.description && (
                        <div className="text-xs text-construction-muted mt-1">{template.description}</div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm('Delete this template?')) {
                          deleteTemplateMutation.mutate(template.id)
                        }
                      }}
                      leftIcon={<Trash2 size={14} />}
                    >
                      Delete
                    </Button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-construction-border">
            <h3 className="font-bold text-construction-black">Create Daily Sheet Template</h3>

            <div>
              <label className="block text-sm font-bold text-construction-black mb-1">Project</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(Number(e.target.value) || '')}
                className="w-full px-3 py-2 border border-construction-border rounded-md"
              >
                <option value="">Select Project</option>
                {projects?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-construction-black mb-1">Template Name</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Daily Progress Report"
                className="w-full px-3 py-2 border border-construction-border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-construction-black mb-1">Description (optional)</label>
              <textarea
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Brief description of this template"
                rows={2}
                className="w-full px-3 py-2 border border-construction-border rounded-md"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-construction-black">Row Headings</label>
                <Button size="sm" variant="ghost" onClick={addRowHeading} leftIcon={<Plus size={14} />}>
                  Add Row
                </Button>
              </div>
              <div className="space-y-2">
                {rowHeadings.map((heading, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={heading}
                      onChange={(e) => updateRowHeading(index, e.target.value)}
                      placeholder={`Row ${index + 1} heading`}
                      className="flex-1 px-3 py-2 border border-construction-border rounded-md text-sm"
                    />
                    {rowHeadings.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeRowHeading(index)}
                        leftIcon={<Trash2 size={14} />}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-construction-black">Column Headings</label>
                <Button size="sm" variant="ghost" onClick={addColumnHeading} leftIcon={<Plus size={14} />}>
                  Add Column
                </Button>
              </div>
              <div className="space-y-2">
                {columnHeadings.map((heading, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={heading}
                      onChange={(e) => updateColumnHeading(index, e.target.value)}
                      placeholder={`Column ${index + 1} heading`}
                      className="flex-1 px-3 py-2 border border-construction-border rounded-md text-sm"
                    />
                    {columnHeadings.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeColumnHeading(index)}
                        leftIcon={<Trash2 size={14} />}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={() => createTemplateMutation.mutate()}>
                Create Template
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateForm(false)
                  setSelectedProject('')
                  setTemplateName('')
                  setTemplateDescription('')
                  setRowHeadings([''])
                  setColumnHeadings([''])
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
