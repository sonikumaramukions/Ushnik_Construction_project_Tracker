import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useState } from 'react'
import { PageShell, PageHeader, KpiTile } from '../components/layout/Page'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Gavel, DollarSign, Download, ClipboardList } from 'lucide-react'

interface MaterialRequest {
  id: number
  status: string
  description: string
  project: number
}

interface RequirementSheet {
  id: number
  title: string
  description: string
  status: string
  project: number
  created_at: string
  document?: string | null
}

interface Bid {
  id: number
  status: string
  amount: string
  material_request: number
}

interface CreateBidParams {
  material_request: number
  amount: string
  notes?: string
}

export function ContractorDashboard() {
  const queryClient = useQueryClient()
  const [newBid, setNewBid] = useState<CreateBidParams>({ material_request: 0, amount: '' })

  const { data: requests, error: requestsError } = useQuery({
    queryKey: ['contractor-material-requests'],
    queryFn: async () => {
      const res = await api.get<any>('/material-requests/')
      // Handle paginated response (DRF returns { results: [...] }) or plain array
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
    retry: 1,
    onError: (error) => {
      console.error('Failed to fetch material requests:', error)
    },
  })

  const { data: requirementSheets, error: sheetsError } = useQuery({
    queryKey: ['requirement-sheets'],
    queryFn: async () => {
      const res = await api.get<any>('/requirement-sheets/')
      // Handle paginated response (DRF returns { results: [...] }) or plain array
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
    retry: 1,
    onError: (error) => {
      console.error('Failed to fetch requirement sheets:', error)
    },
  })

  const { data: bids, error: bidsError } = useQuery({
    queryKey: ['bids'],
    queryFn: async () => {
      const res = await api.get<any>('/bids/')
      // Handle paginated response (DRF returns { results: [...] }) or plain array
      return Array.isArray(res.data) ? res.data : (res.data.results || [])
    },
    retry: 1,
    onError: (error) => {
      console.error('Failed to fetch bids:', error)
    },
  })

  const createBidMutation = useMutation({
    mutationFn: async (bid: CreateBidParams) => {
      return api.post('/bids/', bid)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bids'] })
      setNewBid({ material_request: 0, amount: '', notes: '' })
      alert("Bid submitted!")
    },
    onError: () => alert("Failed to submit bid")
  })

  const handleSubmitBid = (e: React.FormEvent) => {
    e.preventDefault()
    createBidMutation.mutate(newBid)
  }

  const displaySheets: RequirementSheet[] = requirementSheets && requirementSheets.length > 0 ? requirementSheets : []
  const displayBids: Bid[] = bids && bids.length > 0 ? bids : []

  if (requestsError || sheetsError || bidsError) {
    return (
      <PageShell>
        <PageHeader title="Contractor Console" subtitle="View published auctions, download requirement sheets, and submit bids." badge="Partner Network Portal" />
        <div className="p-6 bg-red-50 border-l-4 border-red-500 rounded-md">
          <p className="text-red-700 font-semibold">Error loading data. Please check your connection and try again.</p>
          {(requestsError || sheetsError || bidsError) && (
            <p className="text-red-600 text-sm mt-2">{requestsError?.message || sheetsError?.message || bidsError?.message}</p>
          )}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Contractor Console"
        subtitle="View published auctions, download requirement sheets, and submit bids."
        badge="Partner Network Portal"
        kpisRight={
          <>
            <KpiTile
              label="Auctions"
              value={requests?.length || 0}
              icon={<Gavel size={20} />}
            />
            <KpiTile
              label="My Bids"
              value={displayBids.length}
              icon={<DollarSign size={20} />}
            />
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-3 relative z-10 mt-4">
        {/* Auctions */}
        <div className="lg:col-span-2">
          <Card title="Published Auctions" subtitle="Admin-published RFQs">
            <div className="space-y-4">
              {requests?.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col gap-3 rounded-lg border border-construction-border bg-gray-50 p-5 hover:bg-white hover:border-construction-yellow transition-all shadow-sm hover:translate-x-1"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-construction-black font-bold font-header text-lg uppercase tracking-wide">Auction #{req.id}</div>
                      <div className="text-sm text-construction-muted mt-1 font-medium">{req.description}</div>
                    </div>
                    <Badge variant={req.status === 'published' ? 'success' : 'default'}>
                      {req.status}
                    </Badge>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setNewBid({ ...newBid, material_request: req.id })}
                      leftIcon={<DollarSign size={14} />}
                    >
                      Place Bid
                    </Button>
                  </div>
                </div>
              )) ?? (
                  <div className="text-center py-12 text-construction-muted border-2 border-dashed border-construction-border rounded-lg bg-gray-50">
                    <p>No auctions available.</p>
                  </div>
                )}
            </div>
          </Card>
        </div>

        {/* Bid form */}
        <div>
          <Card title="Submit Bid" subtitle="Select auction & submit">
            <form onSubmit={handleSubmitBid} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-construction-muted tracking-wider">Auction ID</label>
                <input
                  type="number"
                  readOnly
                  className="w-full rounded border-construction-border bg-gray-100 px-3 py-2 text-sm text-construction-black font-mono font-bold cursor-not-allowed opacity-70"
                  value={newBid.material_request || ''}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-construction-muted tracking-wider">Bid Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black placeholder-gray-400 focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors font-mono font-bold"
                  value={newBid.amount}
                  onChange={(e) => setNewBid({ ...newBid, amount: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-construction-muted tracking-wider">Notes</label>
                <textarea
                  placeholder="Delivery details, etc..."
                  className="w-full min-h-[96px] rounded border border-construction-border bg-white px-3 py-2 text-sm text-construction-black placeholder-gray-400 focus:border-construction-yellow focus:ring-1 focus:ring-construction-yellow focus:outline-none transition-colors"
                  value={newBid.notes || ''}
                  onChange={(e) => setNewBid({ ...newBid, notes: e.target.value })}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={!newBid.material_request || createBidMutation.isPending}
                isLoading={createBidMutation.isPending}
              >
                Submit Bid
              </Button>
            </form>
          </Card>
        </div>

        {/* Requirement sheets */}
        <div className="lg:col-span-2">
          <Card title="Requirement Sheets" subtitle="Public Downloads">
            <div className="space-y-4">
              {displaySheets.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-construction-border bg-gray-50 p-4 hover:bg-white hover:border-construction-yellow transition-all shadow-sm group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-construction-black font-bold font-header uppercase tracking-wide group-hover:text-yellow-600 transition-colors">{s.title}</div>
                      <div className="text-xs text-construction-muted mt-2 font-medium">{s.description || '—'}</div>
                      <div className="text-[10px] text-gray-400 mt-1 font-mono uppercase">
                        Published: {new Date(s.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <Badge variant={s.status === 'active' ? 'success' : 'default'}>
                        {s.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {}}
                        disabled
                        title="Download coming soon"
                        leftIcon={<Download size={14} />}
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* My bids */}
        <div>
          <Card title="My Bids" subtitle="Submission Status">
            <div className="space-y-4">
              {displayBids.map((bid) => (
                <div
                  key={bid.id}
                  className="rounded-lg border border-construction-border bg-white px-4 py-3 hover:border-l-4 hover:border-l-construction-yellow transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-construction-black font-bold font-header tracking-wide">Bid #{bid.id}</div>
                      <div className="text-xs text-construction-muted font-mono">Auction #{bid.material_request}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-construction-black font-mono">${bid.amount}</div>
                      <Badge
                        className="mt-1"
                        variant={
                          bid.status === 'accepted' ? 'success' :
                            bid.status === 'rejected' ? 'danger' :
                              'warning'
                        }
                      >
                        {bid.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
