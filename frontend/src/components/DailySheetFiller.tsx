import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type DailySheetTemplate, type DailySheetEntry, type DailySheetEntryCreate } from '../lib/api'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Save, Download, FileSpreadsheet } from 'lucide-react'

function toArray<T>(data: T[] | { results: T[] } | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : (data.results || [])
}

export function DailySheetFiller() {
  const queryClient = useQueryClient()
  const [selectedTemplate, setSelectedTemplate] = useState<number | ''>('')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [cellValues, setCellValues] = useState<Record<string, string>>({})
  const [currentEntry, setCurrentEntry] = useState<DailySheetEntry | null>(null)

  const { data: templates } = useQuery({
    queryKey: ['daily-sheet-templates'],
    queryFn: async () => {
      const res = await api.get<any>('/daily-sheet-templates/')
      return toArray(res.data) as DailySheetTemplate[]
    },
  })

  const { data: entries, refetch: refetchEntries } = useQuery({
    queryKey: ['daily-sheet-entries'],
    queryFn: async () => {
      const res = await api.get<any>('/daily-sheet-entries/')
      return toArray(res.data) as DailySheetEntry[]
    },
  })

  const selectedTemplateData = templates?.find(t => t.id === selectedTemplate)

  // Load existing entry when template and date are selected
  const loadEntry = () => {
    if (!selectedTemplate || !selectedDate) return

    const existing = entries?.find(
      e => e.template === selectedTemplate && e.date === selectedDate
    )

    if (existing) {
      setCurrentEntry(existing)
      setNotes(existing.notes)
      // Load cell data
      const newCellValues: Record<string, string> = {}
      existing.cell_data.forEach(cell => {
        const key = `${cell.row_index}-${cell.column_index}`
        newCellValues[key] = cell.value
      })
      setCellValues(newCellValues)
    } else {
      setCurrentEntry(null)
      setNotes('')
      setCellValues({})
    }
  }

  // Load entry when template or date changes
  useState(() => {
    loadEntry()
  })

  const saveEntryMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) {
        throw new Error('Please select a template')
      }

      const template = templates?.find(t => t.id === selectedTemplate)
      if (!template) throw new Error('Template not found')

      const cell_data = []
      for (let row = 0; row < template.row_headings.length; row++) {
        for (let col = 0; col < template.column_headings.length; col++) {
          const key = `${row}-${col}`
          const value = cellValues[key] || ''
          cell_data.push({
            row_index: row,
            column_index: col,
            value,
          })
        }
      }

      const payload: DailySheetEntryCreate = {
        template: selectedTemplate,
        date: selectedDate,
        notes: notes.trim(),
        cell_data,
      }

      await api.post('/daily-sheet-entries/', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-sheet-entries'] })
      refetchEntries()
      alert('Daily sheet saved successfully!')
    },
    onError: (e: any) => {
      alert(e.response?.data?.detail || e.message || 'Failed to save sheet')
    },
  })

  const downloadExcelMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const response = await api.get(`/daily-sheet-entries/${entryId}/download-excel/`, {
        responseType: 'blob',
      })
      return response.data
    },
    onSuccess: (blob: Blob) => {
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `daily-sheet-${selectedDate}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    },
    onError: () => {
      alert('Failed to download Excel file')
    },
  })

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const key = `${rowIndex}-${colIndex}`
    setCellValues({ ...cellValues, [key]: value })
  }

  const getCellValue = (rowIndex: number, colIndex: number): string => {
    const key = `${rowIndex}-${colIndex}`
    return cellValues[key] || ''
  }

  return (
    <Card title="Fill Daily Sheet" subtitle="Complete your daily reporting sheet">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-bold text-construction-black mb-1">Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => {
                setSelectedTemplate(Number(e.target.value) || '')
                setCellValues({})
                setNotes('')
              }}
              className="w-full px-3 py-2 border border-construction-border rounded-md"
            >
              <option value="">Select Template</option>
              {templates?.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.project_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-construction-black mb-1">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                loadEntry()
              }}
              className="w-full px-3 py-2 border border-construction-border rounded-md"
            />
          </div>
        </div>

        {selectedTemplateData && (
          <>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <div className="border border-construction-border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-construction-border">
                    <thead className="bg-construction-light">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-bold text-construction-black uppercase tracking-wider border-r border-construction-border">
                          {/* Empty corner cell */}
                        </th>
                        {selectedTemplateData.column_headings.map((heading, colIndex) => (
                          <th
                            key={colIndex}
                            className="px-3 py-2 text-center text-xs font-bold text-construction-black uppercase tracking-wider border-r border-construction-border last:border-r-0"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-construction-border">
                      {selectedTemplateData.row_headings.map((rowHeading, rowIndex) => (
                        <tr key={rowIndex}>
                          <td className="px-3 py-2 text-sm font-bold text-construction-black bg-gray-50 border-r border-construction-border whitespace-nowrap">
                            {rowHeading}
                          </td>
                          {selectedTemplateData.column_headings.map((_, colIndex) => (
                            <td
                              key={colIndex}
                              className="px-1 py-1 border-r border-construction-border last:border-r-0"
                            >
                              <input
                                type="text"
                                value={getCellValue(rowIndex, colIndex)}
                                onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                                className="w-full px-2 py-1 text-sm border-0 focus:ring-2 focus:ring-construction-yellow rounded"
                                placeholder="-"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-construction-black mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes or comments"
                rows={3}
                className="w-full px-3 py-2 border border-construction-border rounded-md"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={() => saveEntryMutation.mutate()} leftIcon={<Save size={16} />}>
                Save Sheet
              </Button>
              {currentEntry && (
                <Button
                  variant="ghost"
                  onClick={() => downloadExcelMutation.mutate(currentEntry.id)}
                  leftIcon={<Download size={16} />}
                >
                  Download Excel
                </Button>
              )}
            </div>
          </>
        )}

        {!selectedTemplateData && (
          <div className="text-center py-12 text-construction-muted border-2 border-dashed border-construction-border rounded-lg">
            <FileSpreadsheet size={32} className="mx-auto mb-2 opacity-50" />
            <p>Select a template to start filling the daily sheet</p>
          </div>
        )}
      </div>
    </Card>
  )
}
