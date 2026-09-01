import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import {
  deleteDailyHazardSubmission,
  getDailyHazardSubmission,
  setDailyHazardSubmissionApproval,
  type DailyHazardSubmissionDetail,
} from '@/api/dailyHazardAnalysis'
import { useUser } from '@/contexts/UserContext'

export function DailyHazardAnalysisDetail() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useUser()
  const [item, setItem] = useState<DailyHazardSubmissionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState(false)

  const canDelete = user?.role === 'owner' || user?.role === 'hr'
  const canApprove = user?.role === 'owner' || user?.role === 'hr'
  const fromCompletedForms = new URLSearchParams(location.search).get('from') === 'completed-forms'
  const healthSafetyTo = fromCompletedForms ? '/library?view=submissions&from=safety' : '/safety'
  const backTo = fromCompletedForms ? '/library?view=submissions&from=safety' : '/safety/daily-hazard-analysis'
  const backLabel = fromCompletedForms ? 'Completed Forms' : 'Daily Hazard Analysis'

  useEffect(() => {
    if (!id) return
    getDailyHazardSubmission(id)
      .then(setItem)
      .catch(() => setItem(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading || !item) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={healthSafetyTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
          <span className="text-neutral-400">·</span>
          <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">{backLabel}</Link>
        </div>
        <Card padding="lg">{loading ? <p className="text-sm text-neutral-500">Loading…</p> : <p className="text-sm text-neutral-500">Not found.</p>}</Card>
      </div>
    )
  }

  const handleSetApproval = async (approved: boolean) => {
    if (!id || !canApprove) return
    setApprovalBusy(true)
    try {
      const updated = await setDailyHazardSubmissionApproval(id, approved)
      setItem(updated)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      alert(err?.response?.data?.error ?? 'Could not update approval.')
    } finally {
      setApprovalBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !canDelete) return
    if (!window.confirm('Delete this Daily Hazard Analysis submission? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteDailyHazardSubmission(id)
      navigate(backTo)
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Failed to delete submission.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="no-print flex flex-wrap items-center gap-2 mb-2">
        <Link to={healthSafetyTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
        <span className="text-neutral-400">·</span>
        <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">{backLabel}</Link>
      </div>
      <div className="no-print"><Breadcrumbs items={[{ label: 'Health & Safety', to: healthSafetyTo }, { label: backLabel, to: backTo }, { label: item.date }]} /></div>
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Daily Hazard Analysis — {item.date}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canApprove && item.approved ? (
            <Button variant="outline" size="sm" onClick={() => void handleSetApproval(false)} disabled={approvalBusy}>
              {approvalBusy ? 'Updating…' : 'Remove approval'}
            </Button>
          ) : null}
          {canApprove && !item.approved ? (
            <Button size="sm" onClick={() => void handleSetApproval(true)} disabled={approvalBusy}>
              {approvalBusy ? 'Updating…' : 'Approve'}
            </Button>
          ) : null}
          {canDelete && (
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => window.print()} leftIcon={<span aria-hidden>📄</span>}>Export to PDF</Button>
          <button
            type="button"
            className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
            onClick={() => navigate(backTo, { replace: true })}
          >
            ← Back to list
          </button>
        </div>
      </div>

      <Card padding="lg">
        <CardHeader>General Information</CardHeader>
        {item.approved ? (
          <p className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
            <span className="font-semibold">Approved</span>
            {item.approvedByName ? ` · ${item.approvedByName}` : ''}
            {item.approvedAt ? ` · ${new Date(item.approvedAt).toLocaleString()}` : ''}
          </p>
        ) : (
          <p className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            <span className="font-semibold">Pending approval</span>
            {' — '}Owner or HR can mark this form approved when review is complete.
          </p>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Date</span> {item.date}</li>
          <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Project</span> {item.projectTitle ?? item.projectId}</li>
          <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Site</span> {item.siteName ?? '—'}</li>
          <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Muster Point</span> {item.musterPoint ?? '—'}</li>
          <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Supervisor</span> {item.supervisorName ?? '—'}</li>
          <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Job number</span> {item.jobNumber ?? '—'}</li>
          <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Submitted by</span> {item.submittedBy ?? '—'} {item.submittedAt && `at ${new Date(item.submittedAt).toLocaleString()}`}</li>
        </ul>
      </Card>

      {item.activities.length > 0 && (
        <Card padding="lg">
          <CardHeader>General Activities and Hazards</CardHeader>
          <ul className="mt-2 flex flex-wrap gap-2"><li className="text-sm text-neutral-700 dark:text-neutral-300">{item.activities.join(', ')}</li></ul>
        </Card>
      )}
      {item.hazards.length > 0 && (
        <Card padding="lg">
          <CardHeader>Specific Hazards and Site Considerations</CardHeader>
          <ul className="mt-2 flex flex-wrap gap-2"><li className="text-sm text-neutral-700 dark:text-neutral-300">{item.hazards.join(', ')}</li></ul>
        </Card>
      )}
      {item.controls.length > 0 && (
        <Card padding="lg">
          <CardHeader>Standard Site Controls</CardHeader>
          <ul className="mt-2 flex flex-wrap gap-2"><li className="text-sm text-neutral-700 dark:text-neutral-300">{item.controls.join(', ')}</li></ul>
        </Card>
      )}
      {item.ppe.length > 0 && (
        <Card padding="lg">
          <CardHeader>PPE required</CardHeader>
          <ul className="mt-2 flex flex-wrap gap-2"><li className="text-sm text-neutral-700 dark:text-neutral-300">{item.ppe.join(', ')}</li></ul>
        </Card>
      )}
      {(item.toolsReplaced || item.additionalComments) && (
        <Card padding="lg">
          <CardHeader>Tool Condition / Comments</CardHeader>
          <div className="mt-2 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
            {item.toolsReplaced && <p><span className="font-medium">Tools replaced:</span> {item.toolsReplaced}</p>}
            {item.additionalComments && <p><span className="font-medium">Additional comments:</span> {item.additionalComments}</p>}
          </div>
        </Card>
      )}
      {item.signatures.length > 0 && (
        <Card padding="lg">
          <CardHeader>Worker Acknowledgements</CardHeader>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {item.signatures.map((sig) => (
              <div key={sig.id} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{sig.name}</p>
                <p className="text-xs text-neutral-500">{sig.timestamp ? new Date(sig.timestamp).toLocaleString() : ''}</p>
                {sig.dataUrl && <img src={sig.dataUrl} alt={sig.name} className="mt-2 max-h-16 object-contain" />}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
