import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useInjuryReports } from '@/contexts/InjuryReportsContext'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { downloadCsv } from '@/utils/exportCsv'

export function InjuryReports() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { reports, loading, error } = useInjuryReports()
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open')

  const canAccessInjuryReports = user?.role === 'hr' || user?.role === 'owner' || user?.role === 'supervisor'
  if (!canAccessInjuryReports) return null

  if (loading && reports.length === 0) return <div className="animate-fade-in text-neutral-500 dark:text-neutral-400">Loading injury reports…</div>
  if (error) return <div className="animate-fade-in text-red-600 dark:text-red-400">{error}</div>

  const filtered = reports.filter((r) => {
    if (filter === 'open') return r.status !== 'closed' && r.status !== 'draft'
    if (filter === 'closed') return r.status === 'closed'
    return true
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Injury Reports</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">Track and manage workplace injury reports in depth</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/injury-reports/analytics"><Button variant="secondary">Analytics & Metrics</Button></Link>
          <Button variant="secondary" onClick={() => {
            const rows = filtered.map((r) => ({
              id: r.id,
              site: r.siteName,
              description: r.description,
              injuredPerson: r.injuredPersonName ?? '',
              type: r.injuryType ?? '',
              bodyPart: r.bodyPart ?? '',
              severity: r.severity,
              status: r.status,
              reportedBy: r.reportedBy,
              reportedAt: r.reportedAt,
            }))
            downloadCsv(rows, `injury-reports-${new Date().toISOString().slice(0, 10)}.csv`)
          }}>Export CSV</Button>
          <Button leftIcon={<PlusIcon />} onClick={() => navigate('/injury-reports/new')}>New Report</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="injury-status-filter" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Status:</label>
        <select
          id="injury-status-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'open' | 'closed' | 'all')}
          className="min-h-[40px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm min-w-[140px]"
          aria-label="Filter by status"
        >
          <option value="open">Opens</option>
          <option value="closed">Closed</option>
          <option value="all">All (incl. drafts)</option>
        </select>
      </div>

      <ul className="space-y-3">
        {filtered.map((r) => (
          <li key={r.id}>
            <Link to={`/injury-reports/${r.id}`}>
              <Card padding="md" hover className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">{r.siteName} — {r.description.slice(0, 60)}{r.description.length > 60 ? '…' : ''}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Reported by {r.reportedBy} · {r.reportedAt} · Severity: {r.severity}
                  </p>
                </div>
                <Badge variant={r.status === 'closed' ? 'default' : r.severity === 'major' ? 'danger' : 'warning'}>{r.status}</Badge>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PlusIcon() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
