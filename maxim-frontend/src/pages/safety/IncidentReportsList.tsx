import { useState, useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import * as incidentsApi from '@/api/incidents'

export function IncidentReportsList() {
  const location = useLocation()
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const fromCompletedForms = new URLSearchParams(location.search).get('from') === 'completed-forms'
  const backTo = fromCompletedForms ? '/library?view=submissions&from=safety' : '/safety'
  const detailSuffix = fromCompletedForms ? '?from=completed-forms' : ''

  const load = async () => {
    try {
      setLoading(true)
      const data = await incidentsApi.fetchIncidents()
      setList(Array.isArray(data) ? data : [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const sites = useMemo(() => [...new Set(list.map((i) => i.siteName).filter(Boolean))].sort(), [list])
  const filtered = useMemo(() => {
    return list.filter((item) => {
      if (statusFilter !== 'all' && (item.status ?? 'open') !== statusFilter) return false
      if (siteFilter !== 'all' && (item.siteName ?? '') !== siteFilter) return false
      return true
    })
  }, [list, statusFilter, siteFilter])

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Incident Reports</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Report and track incidents.</p>
        </div>
        <Link to="/safety/incidents/new">
          <Button size="sm">Report Incident</Button>
        </Link>
      </div>

      {!loading && list.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[40px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm min-w-[120px]"
            aria-label="Filter by status"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 ml-2">Site:</label>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="min-h-[40px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm min-w-[160px]"
            aria-label="Filter by site"
          >
            <option value="all">All sites</option>
            {sites.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <Card padding="lg"><p className="text-sm text-neutral-500">Loading…</p></Card>
      ) : list.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title="No incident reports yet"
            description="Use the button above to report an incident."
            action={
              <Link to="/safety/incidents/new">
                <Button size="sm">Report Incident</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <li key={item.id}>
              <Card padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <Link to={`/safety/incidents/${item.id}${detailSuffix}`} className="flex-1 min-w-0">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">{item.title}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{item.siteName || '—'} · {item.date}</p>
                    {item.reportedBy && <p className="text-xs text-neutral-400 mt-1">Reported by {item.reportedBy}</p>}
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={item.status === 'closed' ? 'success' : item.status === 'open' ? 'warning' : 'default'}>{item.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={async (e) => { e.preventDefault(); if (window.confirm('Delete this incident?')) { await incidentsApi.deleteIncident(item.id); load(); } }}>Delete</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {!loading && list.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-neutral-500">No incidents match the selected filters.</p>
      )}
    </div>
  )
}
