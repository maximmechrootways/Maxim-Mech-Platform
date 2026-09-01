import { useState, useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { listDailyHazardSubmissions, type DailyHazardSubmissionSummary } from '@/api/dailyHazardAnalysis'

export function DailyHazardAnalysisList() {
  const location = useLocation()
  const [list, setList] = useState<DailyHazardSubmissionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const fromCompletedForms = new URLSearchParams(location.search).get('from') === 'completed-forms'
  const backTo = fromCompletedForms ? '/library?view=submissions&from=safety' : '/safety'
  const detailSuffix = fromCompletedForms ? '?from=completed-forms' : ''

  useEffect(() => {
    listDailyHazardSubmissions()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return list.filter((item) => {
      if (search.trim()) {
        const q = search.toLowerCase()
        const match = (item.projectTitle ?? '').toLowerCase().includes(q) ||
          (item.siteName ?? '').toLowerCase().includes(q) ||
          (item.supervisorName ?? '').toLowerCase().includes(q) ||
          (item.submittedBy ?? '').toLowerCase().includes(q) ||
          (item.jobNumber ?? '').toLowerCase().includes(q)
        if (!match) return false
      }
      if (dateFilter && item.date !== dateFilter) return false
      return true
    })
  }, [list, search, dateFilter])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link to={backTo} className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div className="flex-1 min-w-0" />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Daily Hazard Analysis</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">View submitted Daily Hazard Analysis forms.</p>
        </div>
        <Link to="/forms/daily-hazard-analysis">
          <Button>New Daily Hazard Analysis</Button>
        </Link>
      </div>

      <Card padding="lg">
        <CardHeader>Submissions</CardHeader>
        <CardDescription>All submitted Daily Hazard Analysis forms. Click a row to view details.</CardDescription>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by title, site, supervisor, submitted by..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[40px] flex-1 min-w-[200px] max-w-sm rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm"
            aria-label="Search submissions"
          />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="min-h-[40px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm min-w-[140px]"
            aria-label="Filter by date"
          >
            <option value="">All dates</option>
            {[...new Set(list.map((i) => i.date))].sort().reverse().slice(0, 31).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        ) : list.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No submissions yet. <Link to="/forms/daily-hazard-analysis" className="text-brand-600 dark:text-brand-400 hover:underline">Submit the first one</Link>.</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No submissions match the current filters.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-600">
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Date</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Project / Site</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Supervisor</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Job #</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Submitted By</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Submitted At</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Approval</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="py-3 pr-4">{item.date}</td>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-neutral-900 dark:text-white">{item.projectTitle ?? item.projectId}</span>
                      {item.siteName && <span className="block text-xs text-neutral-500">{item.siteName}</span>}
                    </td>
                    <td className="py-3 pr-4 text-neutral-700 dark:text-neutral-300">{item.supervisorName ?? '—'}</td>
                    <td className="py-3 pr-4 text-neutral-700 dark:text-neutral-300">{item.jobNumber ?? '—'}</td>
                    <td className="py-3 pr-4 text-neutral-700 dark:text-neutral-300">{item.submittedBy ?? '—'}</td>
                    <td className="py-3 pr-4 text-sm text-neutral-500">
                      {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      {item.approved ? (
                        <Badge variant="success">Approved</Badge>
                      ) : (
                        <Badge variant="warning">Pending</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Link to={`/safety/daily-hazard-analysis/${item.id}${detailSuffix}`} className="text-brand-600 dark:text-brand-400 hover:underline text-sm">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
