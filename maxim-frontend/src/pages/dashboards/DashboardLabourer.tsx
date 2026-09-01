import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useSigning } from '@/contexts/SigningContext'
import { useSafetyAlerts } from '@/contexts/SafetyAlertsContext'
import { SafetyAlertCard } from '@/components/safety/SafetyAlertCard'
import { filterActiveAlertsForUser } from '@/utils/safetyAlerts'
import { fetchJobs, fetchSupervisors } from '@/api/jobs'
import type { JobListItem } from '@/api/jobs'
import {
  fetchFormAssignments,
  fetchPdfSubmissions,
  deleteDraftPdfSubmissions,
  fetchSignableSubmissions,
  type FormAssignmentRecord,
  type PdfSubmissionRecord,
} from '@/api/library'
import { Badge } from '@/components/ui/Badge'
import { listDhaLocalDrafts, removeDhaLocalDraft, type DhaLocalDraftRecord } from '@/utils/dhaLocalDrafts'
import { isWashroomDraftForMyDraftsList } from '@/utils/washroomTemplate'

export function DashboardLabourer() {
  const { user } = useUser()
  const { requests } = useSigning()
  const { alerts: safetyAlerts, loadData: loadSafetyAlerts, markAlertRead, acknowledgeAlert } = useSafetyAlerts()
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [supervisorNames, setSupervisorNames] = useState<Record<string, string>>({})
  const [pendingForms, setPendingForms] = useState<FormAssignmentRecord[]>([])
  const [myPdfDrafts, setMyPdfDrafts] = useState<PdfSubmissionRecord[]>([])
  const [dhaLocalDrafts, setDhaLocalDrafts] = useState<DhaLocalDraftRecord[]>([])
  const [resubmissions, setResubmissions] = useState<PdfSubmissionRecord[]>([])
  const [pendingDailySignatures, setPendingDailySignatures] = useState<Array<{ id: string; templateName: string; submittedBy: string }>>([])
  const [pendingPdfSignatures, setPendingPdfSignatures] = useState<PdfSubmissionRecord[]>([])
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)

  const refreshDailyHazardDrafts = (uid?: string) => {
    if (!uid) {
      setDhaLocalDrafts([])
      return
    }
    setDhaLocalDrafts(listDhaLocalDrafts(uid))
  }

  useEffect(() => { loadSafetyAlerts() }, [loadSafetyAlerts])
  const activeAlerts = filterActiveAlertsForUser(safetyAlerts || [], user)

  const needSignature = requests.filter((sr) =>
    sr.requiredSigners.some((s) => (s.userId === user?.id || s.name === user?.name) && s.status === 'pending')
  )
  const acknowledged = requests.filter((sr) =>
    sr.requiredSigners.some((s) => (s.userId === user?.id || s.name === user?.name) && s.status === 'signed')
  ).map((sr) => {
    const me = sr.requiredSigners.find((s) => (s.userId === user?.id || s.name === user?.name) && s.status === 'signed')
    return { documentName: sr.documentName, signedAt: me?.signedAt ?? '' }
  }).sort((a, b) => (b.signedAt || '').localeCompare(a.signedAt || '')).slice(0, 10)

  useEffect(() => {
    fetchJobs().then(setJobs).catch(() => setJobs([]))
    fetchSupervisors().then((list) => {
      const map: Record<string, string> = {}
      list.forEach((s) => { map[s.id] = s.name })
      setSupervisorNames(map)
    }).catch(() => setSupervisorNames({}))
    fetchFormAssignments()
      .then((list) => setPendingForms(list.filter(a => ['pending', 'in_progress', 'resubmission_required'].includes(a.status))))
      .catch(() => setPendingForms([]))
    fetchSignableSubmissions()
      .then((list) => {
        if (!user?.id) return setPendingDailySignatures([])
        const pending = (Array.isArray(list) ? list : []).filter((s: any) => {
          if (s?.workflowType !== 'site_meeting') return false
          const signerIds: string[] = Array.isArray(s?.siteSignerIds) ? s.siteSignerIds : []
          if (!signerIds.includes(user.id)) return false
          const signatures: Array<{ userId: string }> = Array.isArray(s?.siteSignatures) ? s.siteSignatures : []
          return !signatures.some((sig) => sig.userId === user.id)
        })
        setPendingDailySignatures(
          pending.map((s: any) => ({
            id: String(s.id),
            templateName: String(s.templateName ?? 'Daily Form'),
            submittedBy: String(s.submittedBy ?? 'Supervisor'),
          }))
        )
      })
      .catch(() => setPendingDailySignatures([]))
    if (user?.id) {
      fetchPdfSubmissions({ status: 'DRAFT' })
        .then((list) =>
          setMyPdfDrafts(
            list.filter((s) => {
              if (s.submittedById !== user.id) return false
              if (isWashroomDraftForMyDraftsList(s.templateName)) return false
              if (/daily\s*hazard|daily\s*jha/i.test(String(s.templateName ?? ''))) return s.userSavedDraft === true
              return true
            })
          )
        )
        .catch(() => setMyPdfDrafts([]))
      fetchPdfSubmissions({ status: 'AWAITING_SIGNATURES' })
        .then((list) => setPendingPdfSignatures((list || []).filter((s) => Boolean(s.needsMySignature))))
        .catch(() => setPendingPdfSignatures([]))
      fetchPdfSubmissions({ status: 'RESUBMIT_REQUIRED' })
        .then((list) => setResubmissions(list.filter((s) => s.submittedById === user.id)))
        .catch(() => setResubmissions([]))
      refreshDailyHazardDrafts(user.id)
    }
  }, [user?.id])

  useEffect(() => {
    const onFocus = () => refreshDailyHazardDrafts(user?.id)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [user?.id])

  const handleDeletePdfDraft = async (draft: PdfSubmissionRecord) => {
    const label = draft.title ?? draft.templateName ?? 'Draft'
    if (!window.confirm(`Delete draft "${label}"? This cannot be undone.`)) return
    setDeletingDraftId(draft.id)
    try {
      await deleteDraftPdfSubmissions([draft.id])
      setMyPdfDrafts((prev) => prev.filter((d) => d.id !== draft.id))
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? 'Failed to delete draft.')
    } finally {
      setDeletingDraftId(null)
    }
  }

  const handleDeleteLocalDhaDraft = (draftId: string, label: string) => {
    if (!user?.id) return
    if (!window.confirm(`Delete draft "${label}"? This cannot be undone.`)) return
    removeDhaLocalDraft(user.id, draftId)
    refreshDailyHazardDrafts(user.id)
  }

  const firstSupervisorId = jobs.length > 0 && (jobs[0].assignedSupervisorIds ?? [])[0]
  const supervisorName = firstSupervisorId ? (supervisorNames[firstSupervisorId] ?? 'Your supervisor') : 'Your supervisor'
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || 'there'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
            {`Hi, ${firstName}!`}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">Your assignments, documents & safety</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/safety/incidents/new"><Button size="sm">Report Incident</Button></Link>
          <Link to="/safety/near-miss?create=1"><Button size="sm" variant="secondary">Report Near-Miss</Button></Link>
          <Link to="/safety/hazards"><Button size="sm" variant="secondary">Report Hazard</Button></Link>
        </div>
      </div>

      <Card>
        <CardHeader>Your Supervisor</CardHeader>
        <CardDescription>Contact for assignments and safety questions</CardDescription>
        <p className="mt-3 text-lg font-medium text-neutral-900 dark:text-white">{supervisorName}</p>
      </Card>

      <Card>
        <CardHeader>Jobs Assigned to You</CardHeader>
        <CardDescription>Your current assignments</CardDescription>
        <ul className="mt-4 space-y-2">
          {jobs.length === 0 ? (
            <li className="text-sm text-neutral-500 dark:text-neutral-400 py-2">No jobs assigned yet. Ask your supervisor or HR to assign you from Job Management.</li>
          ) : (
            jobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                <Link to={`/jobs/${job.id}`} className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900 dark:text-white">{job.title}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">{job.siteName} · {job.status}</p>
                </Link>
              </li>
            ))
          )}
        </ul>
        {jobs.length > 0 && (
          <Link to="/jobs" className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
        )}
      </Card>

      {pendingForms.length > 0 && (
        <Card>
          <CardHeader>Forms to Complete</CardHeader>
          <CardDescription>Forms assigned to you by your supervisor</CardDescription>
          <ul className="mt-4 space-y-2">
            {pendingForms.map((a) => (
              <li key={a.id}>
                <Link to={`/forms/new/${a.templateId}?assignmentId=${a.id}`} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                  <div>
                    <span className="font-medium text-neutral-900 dark:text-white">{a.templateName}</span>
                    {a.dueDate && (
                      <span className={`ml-2 text-xs ${new Date(a.dueDate) < new Date() ? 'text-red-600' : 'text-amber-600'}`}>
                        Due {new Date(a.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <Badge variant="warning">Fill</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pendingDailySignatures.length > 0 && (
        <Card className="border-l-4 border-brand-500">
          <CardHeader>Daily Forms Requiring Your Signature</CardHeader>
          <CardDescription>These were sent to you by your supervisor to sign.</CardDescription>
          <ul className="mt-4 space-y-2">
            {pendingDailySignatures.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/daily-forms/sign/${s.id}`}
                  className="flex items-center justify-between py-3 px-4 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors"
                >
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">{s.templateName}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">From {s.submittedBy}</p>
                  </div>
                  <Button size="sm">Sign</Button>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {resubmissions.length > 0 && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20">
          <CardHeader>Resubmissions</CardHeader>
          <CardDescription>Forms HR sent back to you for corrections</CardDescription>
          <ul className="mt-4 space-y-2">
            {resubmissions.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/forms/new/${s.templateId}${s.jobId ? `?jobId=${encodeURIComponent(s.jobId)}&draftId=${encodeURIComponent(s.id)}` : `?draftId=${encodeURIComponent(s.id)}`}`}
                  className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-red-100/60 dark:hover:bg-red-900/30"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-neutral-900 dark:text-white">{s.title ?? s.templateName ?? 'Form'}</span>
                    {s.resubmissionReason && (
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1 truncate">{s.resubmissionReason}</p>
                    )}
                  </div>
                  <Badge variant="danger">Resubmit</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader>My Drafts</CardHeader>
        <CardDescription>Only drafts you created</CardDescription>
        <ul className="mt-4 space-y-2">
          {myPdfDrafts.length === 0 && dhaLocalDrafts.length === 0 ? (
            <li className="text-sm text-neutral-500 dark:text-neutral-400 py-2">No drafts</li>
          ) : (
            <>
              {dhaLocalDrafts.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                >
                  <Link
                    to={`/forms/daily-hazard-analysis?draft=${encodeURIComponent(d.id)}`}
                    className="min-w-0 flex-1 font-medium text-neutral-900 dark:text-white hover:underline"
                  >
                    {d.label}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="warning">Local Draft</Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 dark:text-red-400"
                      onClick={() => handleDeleteLocalDhaDraft(d.id, d.label)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
              {myPdfDrafts.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                >
                  <Link
                    to={`/forms/new/${d.templateId}${d.jobId ? `?jobId=${encodeURIComponent(d.jobId)}&draftId=${encodeURIComponent(d.id)}` : `?draftId=${encodeURIComponent(d.id)}`}`}
                    className="min-w-0 flex-1 font-medium text-neutral-900 dark:text-white hover:underline"
                  >
                    {d.title ?? d.templateName ?? 'Form'}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="warning">Draft</Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 dark:text-red-400"
                      disabled={deletingDraftId === d.id}
                      onClick={() => void handleDeletePdfDraft(d)}
                    >
                      {deletingDraftId === d.id ? 'Deleting…' : 'Delete'}
                    </Button>
                  </div>
                </li>
              ))}
            </>
          )}
        </ul>
      </Card>

      <Card>
        <CardHeader>Documents Requiring Your Signature</CardHeader>
        <CardDescription>Review the documentation and sign to acknowledge you received and understand the contents. If you have any questions, please contact HR</CardDescription>
        <ul className="mt-4 space-y-2">
          {needSignature.length === 0 && pendingPdfSignatures.length === 0 ? (
            <li className="text-sm text-neutral-500">Nothing pending</li>
          ) : (
            <>
              {pendingPdfSignatures.map((s) => (
                <li key={`pdf-${s.id}`}>
                  <Link to={`/forms/${s.id}`} className="flex items-center justify-between py-3 px-4 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors">
                    <span className="font-medium text-neutral-900 dark:text-white">{s.title ?? s.templateName ?? 'Form'}</span>
                    <Button size="sm">Sign</Button>
                  </Link>
                </li>
              ))}
              {needSignature.map((sr) => (
                <li key={sr.id}>
                  <Link to={`/signing/${sr.id}/sign`} className="flex items-center justify-between py-3 px-4 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors">
                    <span className="font-medium text-neutral-900 dark:text-white">{sr.documentName}</span>
                    <Button size="sm">Sign</Button>
                  </Link>
                </li>
              ))}
            </>
          )}
        </ul>
      </Card>

      <Card>
        <CardHeader>Recently Acknowledged</CardHeader>
        <CardDescription>Documents you&apos;ve signed</CardDescription>
        <ul className="mt-4 space-y-2">
          {acknowledged.length === 0 ? (
            <li className="py-2 px-3 rounded-xl text-sm text-neutral-500 dark:text-neutral-400">Nothing yet. Signed documents will appear here.</li>
          ) : (
            acknowledged.map((a, i) => (
              <li key={i} className="py-2 px-3 rounded-xl text-sm text-neutral-600 dark:text-neutral-400">
                {a.documentName}
                {a.signedAt && <span className="ml-2 text-neutral-500">— {new Date(a.signedAt).toLocaleDateString()}</span>}
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card>
        <CardHeader>Safety Announcements</CardHeader>
        <CardDescription>Important notices — acknowledge when you have read them</CardDescription>
        <div className="mt-4 space-y-3">
          {activeAlerts.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-2">No current announcements.</p>
          ) : (
            activeAlerts.slice(0, 5).map((a) => (
              <SafetyAlertCard
                key={a.id}
                alert={a}
                userId={user?.id}
                onRead={markAlertRead}
                onAcknowledge={acknowledgeAlert}
                compact
              />
            ))
          )}
          {(safetyAlerts?.length ?? 0) > 0 && (
            <Link to="/safety/alerts" className="inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all alerts</Link>
          )}
        </div>
      </Card>
    </div>
  )
}
