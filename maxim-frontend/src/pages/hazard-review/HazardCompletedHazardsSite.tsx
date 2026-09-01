import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchHazardSubmissions, type HazardSubmission } from '@/api/hazardReview'
import { fetchSiteDetail } from '@/api/jobs'
import { Card, CardHeader } from '@/components/ui/Card'
export function HazardCompletedHazardsSite() {
  const { siteId } = useParams<{ siteId: string }>()
  const [siteName, setSiteName] = useState<string>('')
  const [rows, setRows] = useState<HazardSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!siteId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchSiteDetail(siteId).catch(() => null),
      fetchHazardSubmissions({ status: 'SUBMITTED', siteId }),
    ])
      .then(([site, list]) => {
        if (cancelled) return
        setSiteName((site as { name?: string } | null)?.name ?? siteId)
        setRows(list ?? [])
      })
      .catch(() => {
        if (!cancelled) setError('Could not load completed hazard assessments for this site.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [siteId])

  if (!siteId) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-neutral-500">Missing site.</p>
        <Link to="/hazard-review" className="text-brand-600 dark:text-brand-400 hover:underline mt-4 inline-block">
          ← Hazard Review
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      <div>
        <Link to="/hazard-review" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
          ← Hazard Review
        </Link>
        <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white mt-2">
          Completed hazard assessments
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Site: <span className="font-medium text-neutral-800 dark:text-neutral-200">{siteName}</span>
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : rows.length === 0 ? (
        <Card padding="lg">
          <p className="text-neutral-600 dark:text-neutral-400">
            No completed hazard risk assessments are linked to jobs on this site yet.
          </p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-700">
            <CardHeader title="Submitted assessments" subtitle="Open a row to view the full record (read-only)." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-900/50">
                  <th className="text-left py-3 px-4 font-medium text-neutral-700 dark:text-neutral-300">Role / template</th>
                  <th className="text-left py-3 px-4 font-medium text-neutral-700 dark:text-neutral-300">Job</th>
                  <th className="text-left py-3 px-4 font-medium text-neutral-700 dark:text-neutral-300">Submitted by</th>
                  <th className="text-left py-3 px-4 font-medium text-neutral-700 dark:text-neutral-300">Submitted</th>
                  <th className="text-right py-3 px-4 font-medium text-neutral-700 dark:text-neutral-300"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/80">
                    <td className="py-3 px-4 text-neutral-900 dark:text-white font-mono text-xs">{r.templateKey}</td>
                    <td className="py-3 px-4 text-neutral-700 dark:text-neutral-300">
                      {r.job?.title ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-neutral-700 dark:text-neutral-300">
                      {r.submittedBy?.name ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-neutral-500">
                      {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`/hazard-review/hra/${r.id}`}
                        className="inline-flex items-center justify-center px-3 py-1.5 text-sm min-h-[36px] rounded-lg border-2 border-brand-500/80 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/50 transition-colors"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
