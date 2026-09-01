import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { listDhaLocalDrafts, removeDhaLocalDraft, type DhaLocalDraftRecord } from '@/utils/dhaLocalDrafts'
import { isWashroomDraftForMyDraftsList } from '@/utils/washroomTemplate'
import { useSigning } from '@/contexts/SigningContext'
import { useSignableSubmissions } from '@/contexts/SignableSubmissionsContext'
import { useSignableTemplates } from '@/contexts/SignableTemplatesContext'
import { fetchMyJobs } from '@/api/jobs'
import { fetchIncidents } from '@/api/incidents'
import {
  deleteDraftPdfSubmissions,
  exportMergedPdfSubmissions,
  fetchFormAssignmentCounts,
  fetchPdfSubmissions,
  type PdfSubmissionRecord,
} from '@/api/library'
import { downloadBlob } from '@/utils/fileActions'

type IncidentItem = { id: string; title?: string; status?: string }

export function DashboardSupervisor() {
  const { user } = useUser()
  const { requests } = useSigning()
  const { dailyForms } = useSignableSubmissions()
  const { templates: signableTemplates } = useSignableTemplates()
  const [siteNames, setSiteNames] = useState<string[]>([])
  const [recentIncidents, setRecentIncidents] = useState<IncidentItem[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [myPdfDrafts, setMyPdfDrafts] = useState<PdfSubmissionRecord[]>([])
  const [dhaLocalDrafts, setDhaLocalDrafts] = useState<DhaLocalDraftRecord[]>([])
  const [myResubmissions, setMyResubmissions] = useState<PdfSubmissionRecord[]>([])
  const [mySubmittedForms, setMySubmittedForms] = useState<PdfSubmissionRecord[]>([])
  const [downloadingSubmissionId, setDownloadingSubmissionId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)

  const refreshDailyHazardDrafts = (uid?: string) => {
    if (!uid) {
      setDhaLocalDrafts([])
      return
    }
    setDhaLocalDrafts(listDhaLocalDrafts(uid))
  }

  useEffect(() => {
    if (!user?.id) {
      setMyPdfDrafts([])
      return
    }
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
    fetchPdfSubmissions({ status: 'RESUBMIT_REQUIRED' })
      .then((list) => setMyResubmissions(list.filter((s) => s.submittedById === user.id)))
      .catch(() => setMyResubmissions([]))
    fetchPdfSubmissions({ submittedById: user.id })
      .then((list) =>
        setMySubmittedForms(
          list
            .filter((s) => s.status !== 'DRAFT')
            .sort((a, b) => {
              const aTime = Date.parse(String(a.createdAt ?? '')) || 0
              const bTime = Date.parse(String(b.createdAt ?? '')) || 0
              return bTime - aTime
            })
            .slice(0, 8)
        )
      )
      .catch(() => setMySubmittedForms([]))
    refreshDailyHazardDrafts(user.id)
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

  const handleDownloadSubmissionPdf = async (submission: PdfSubmissionRecord) => {
    setDownloadingSubmissionId(submission.id)
    try {
      const blob = await exportMergedPdfSubmissions([submission.id])
      const baseName = String(submission.title ?? submission.templateName ?? 'submission').trim() || 'submission'
      const safeName = `${baseName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()}.pdf`
      downloadBlob(blob, safeName)
    } catch (e: any) {
      alert(e?.message ?? 'Failed to download PDF')
    } finally {
      setDownloadingSubmissionId(null)
    }
  }

  useEffect(() => {
    const onFocus = () => refreshDailyHazardDrafts(user?.id)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [user?.id])
  const waitingSignatures = requests.filter((sr) => sr.requiredSigners.some((s) => s.status === 'pending'))

  // Match Daily forms page logic: only daily schedule, assigned to me, status pending or filled
  const dailyFormsPending = dailyForms.filter((f) => {
    if (f.assignedToUserId) {
      if (f.assignedToUserId !== user?.id) return false
    } else {
      if (f.assignedToRole !== user?.role) return false
    }
    const template = signableTemplates.find((t) => t.id === f.signableFormId)
    if (template?.schedule !== 'daily') return false
    return f.status === 'pending' || f.status === 'filled'
  }).length

  useEffect(() => {
    fetchMyJobs()
      .then((jobs) => {
        const names = [...new Set((jobs || []).map((j) => j.siteName).filter(Boolean))] as string[]
        setSiteNames(names)
      })
      .catch(() => setSiteNames([]))
  }, [])
  useEffect(() => {
    fetchIncidents()
      .then((list) => {
        const items = (Array.isArray(list) ? list : []).slice(0, 5).map((i: any) => ({
          id: i.id,
          title: i.title ?? i.description ?? 'Incident',
          status: i.status ?? 'Reported',
        }))
        setRecentIncidents(items)
      })
      .catch(() => setRecentIncidents([]))
  }, [])
  useEffect(() => {
    fetchFormAssignmentCounts()
      .then((c) => setReviewCount(c.pendingReview ?? 0))
      .catch(() => setReviewCount(0))
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Supervisor Dashboard</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">Sites & Teams</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link to="/daily-forms" className="w-full sm:w-auto"><Button className="w-full sm:w-auto">Daily Forms to Sign</Button></Link>
          <Link to="/safety/incidents/new" className="w-full sm:w-auto"><Button variant="secondary" leftIcon={<PlusIcon />} className="w-full sm:w-auto">New Incident Report</Button></Link>
          <Link to="/forms/new/t1" className="w-full sm:w-auto"><Button variant="secondary" className="w-full sm:w-auto">New Site Inspection</Button></Link>
        </div>
      </div>

      {dailyFormsPending > 0 && (
        <Link to="/daily-forms">
          <Card hover padding="md" className="border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/30">
            <div className="flex items-center justify-between">
              <div>
                <CardHeader>Daily Forms to complete</CardHeader>
                <CardDescription>You have {dailyFormsPending} form{dailyFormsPending === 1 ? '' : 's'} to fill out and sign today</CardDescription>
              </div>
              <span className="text-brand-600 dark:text-brand-400 font-medium">Go to daily forms →</span>
            </div>
          </Card>
        </Link>
      )}

      {reviewCount > 0 && (
        <Link to="/library?view=submissions">
          <Card hover padding="md" className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
            <div className="flex items-center justify-between">
              <div>
                <CardHeader>Forms Awaiting Review</CardHeader>
                <CardDescription>{reviewCount} submission{reviewCount === 1 ? '' : 's'} from your labourers need review</CardDescription>
              </div>
              <span className="text-brand-600 dark:text-brand-400 font-medium">Review →</span>
            </div>
          </Card>
        </Link>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>Active Sites</CardHeader>
          <CardDescription>Sites where you are assigned as supervisor</CardDescription>
          <ul className="mt-4 space-y-2">
            {siteNames.length === 0 ? (
              <li className="text-sm text-neutral-500 dark:text-neutral-400 py-2">No sites. You will see sites from your assigned jobs here.</li>
            ) : (
              siteNames.map((site) => (
                <li key={site}>
                  <span className="block py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50 text-sm font-medium">{site}</span>
                </li>
              ))
            )}
          </ul>
          {siteNames.length > 0 && <Link to="/my-jobs" className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">My Jobs</Link>}
        </Card>

        <Card>
          <CardHeader>My Drafts</CardHeader>
          <CardDescription>Only drafts you created</CardDescription>
          <ul className="mt-4 space-y-2">
            {myPdfDrafts.length === 0 && dhaLocalDrafts.length === 0 ? <li className="text-sm text-neutral-500">No drafts</li> : (
              <>
                {dhaLocalDrafts.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                  >
                    <Link
                      to={`/forms/daily-hazard-analysis?draft=${encodeURIComponent(d.id)}`}
                      className="min-w-0 flex-1 font-medium text-brand-600 dark:text-brand-400 hover:underline"
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
                {myPdfDrafts.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                  >
                    <Link
                      to={`/forms/new/${f.templateId}${f.jobId ? `?jobId=${encodeURIComponent(f.jobId)}&draftId=${encodeURIComponent(f.id)}` : `?draftId=${encodeURIComponent(f.id)}`}`}
                      className="min-w-0 flex-1 font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {f.title ?? f.templateName ?? 'Form'}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="warning">Draft</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 dark:text-red-400"
                        disabled={deletingDraftId === f.id}
                        onClick={() => void handleDeletePdfDraft(f)}
                      >
                        {deletingDraftId === f.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </li>
                ))}
              </>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader>My Submitted Forms</CardHeader>
          <CardDescription>Review and download your submitted forms</CardDescription>
          <ul className="mt-4 space-y-2">
            {mySubmittedForms.length === 0 ? (
              <li className="text-sm text-neutral-500 dark:text-neutral-400 py-2">No submitted forms yet.</li>
            ) : (
              mySubmittedForms.map((f) => (
                <li key={f.id} className="py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 dark:text-white truncate">{f.title ?? f.templateName ?? 'Form'}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        {new Date(f.createdAt).toLocaleDateString()} · {f.status.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link to={`/forms/${f.id}`}>
                        <Button variant="outline" size="sm">Review</Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadSubmissionPdf(f)}
                        disabled={downloadingSubmissionId === f.id}
                      >
                        {downloadingSubmissionId === f.id ? 'Downloading…' : 'PDF'}
                      </Button>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
          {mySubmittedForms.length > 0 && (
            <Link to={`/library?view=submissions&submittedById=${encodeURIComponent(user?.id ?? '')}`} className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">
              View all my submissions
            </Link>
          )}
        </Card>

        <Card className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20">
          <CardHeader>Resubmissions</CardHeader>
          <CardDescription>Forms HR sent back to you for correction</CardDescription>
          <ul className="mt-4 space-y-2">
            {myResubmissions.length === 0 ? <li className="text-sm text-neutral-500">No resubmissions</li> : myResubmissions.map((f) => (
              <li key={f.id}>
                <Link
                  to={`/forms/new/${f.templateId}${f.jobId ? `?jobId=${encodeURIComponent(f.jobId)}&draftId=${encodeURIComponent(f.id)}` : `?draftId=${encodeURIComponent(f.id)}`}`}
                  className="block py-2 px-3 rounded-xl hover:bg-red-100/60 dark:hover:bg-red-900/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-neutral-900 dark:text-white">{f.title ?? f.templateName ?? 'Form'}</span>
                    <Badge variant="danger">Resubmit</Badge>
                  </div>
                  {f.resubmissionReason && (
                    <p className="mt-1 text-xs text-red-700 dark:text-red-300 truncate">{f.resubmissionReason}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>Waiting for Labourer Signatures</CardHeader>
          <CardDescription>Documents pending sign-off</CardDescription>
          <ul className="mt-4 space-y-2">
            {waitingSignatures.map((sr) => (
              <li key={sr.id}>
                <Link to={`/signing/${sr.id}`} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                  <span className="font-medium text-neutral-900 dark:text-white">{sr.documentName}</span>
                  <Badge variant="warning">Pending</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>Recent Incidents</CardHeader>
          <CardDescription>Latest incidents</CardDescription>
          <ul className="mt-4 space-y-2">
            {recentIncidents.length === 0 ? (
              <li className="text-sm text-neutral-500 dark:text-neutral-400 py-2">No recent incidents.</li>
            ) : (
              recentIncidents.map((i) => (
                <li key={i.id}>
                  <Link to={`/safety/incidents/${i.id}`} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                    <span className="font-medium text-neutral-900 dark:text-white truncate">{i.title}</span>
                    <Badge variant="default" className="shrink-0">{i.status}</Badge>
                  </Link>
                </li>
              ))
            )}
          </ul>
          {recentIncidents.length > 0 && <Link to="/safety/incidents" className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>}
        </Card>
      </div>
    </div>
  )
}

function PlusIcon() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
