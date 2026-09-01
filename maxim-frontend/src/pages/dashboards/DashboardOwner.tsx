import { Link } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { fetchIncidents } from '@/api/incidents'
import { fetchInspectionResults } from '@/api/inspections'
import { fetchQualityFindingsSummary } from '@/api/qualityFindings'
import { fetchSignatureRequests, fetchFormAssignments, fetchPdfSubmissions, type FormAssignmentRecord, type PdfSubmissionRecord } from '@/api/library'

export function DashboardOwner() {
  const [incidents, setIncidents] = useState<{ id: string; title?: string; siteName?: string; status?: string; severity?: string }[]>([])
  const [compliance, setCompliance] = useState<{ inspectionsCompleted: number; signaturesPending: number; incidentsOpen: number }>({ inspectionsCompleted: 0, signaturesPending: 0, incidentsOpen: 0 })
  const [formAssignments, setFormAssignments] = useState<FormAssignmentRecord[]>([])
  const [submittedForReview, setSubmittedForReview] = useState<{ id: string; templateName: string; title?: string; submittedBy?: string }[]>([])
  const [myResubmissions, setMyResubmissions] = useState<PdfSubmissionRecord[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [qualityOpenCount, setQualityOpenCount] = useState<number | null>(null)

  useEffect(() => {
    fetchQualityFindingsSummary()
      .then((s) => setQualityOpenCount(s.openCount))
      .catch(() => setQualityOpenCount(null))
  }, [])

  useEffect(() => {
    fetchIncidents().then((list) => setIncidents(Array.isArray(list) ? list.slice(0, 3) : [])).catch(() => setIncidents([]))
  }, [])

  useEffect(() => {
    fetchFormAssignments(assigneeFilter ? { assignedToId: assigneeFilter } : undefined)
      .then(setFormAssignments)
      .catch(() => setFormAssignments([]))
  }, [assigneeFilter])

  useEffect(() => {
    fetchPdfSubmissions({ status: 'SUBMITTED' })
      .then((list) => setSubmittedForReview(list.map((s) => ({
        id: s.id,
        templateName: s.templateName as string,
        title: (s as any).title,
        submittedBy: (s as any).submittedBy?.displayName || (s as any).submittedBy,
      }))))
      .catch(() => setSubmittedForReview([]))
  }, [])

  useEffect(() => {
    fetchPdfSubmissions({ status: 'RESUBMIT_REQUIRED' })
      .then(setMyResubmissions)
      .catch(() => setMyResubmissions([]))
  }, [])

  useEffect(() => {
    Promise.all([
      fetchInspectionResults(),
      fetchSignatureRequests(),
      fetchIncidents(),
    ])
      .then(([results, signingList, incidentList]) => {
        const inspectionsCompleted = Array.isArray(results) ? results.length : 0
        const requests = Array.isArray(signingList) ? signingList : []
        const signaturesPending = requests.reduce(
          (sum, r) => sum + (r.requiredSigners ?? []).filter((s: { status?: string }) => (s.status ?? 'pending') !== 'signed').length,
          0
        )
        const incidentsOpen = Array.isArray(incidentList)
          ? incidentList.filter((i: { status?: string }) => (i.status ?? '').toLowerCase() !== 'closed').length
          : 0
        setCompliance({ inspectionsCompleted, signaturesPending, incidentsOpen })
      })
      .catch(() => setCompliance({ inspectionsCompleted: 0, signaturesPending: 0, incidentsOpen: 0 }))
  }, [])

  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const impending = useMemo(() => formAssignments.filter((a) => {
    if (['completed', 'reviewed'].includes(a.status)) return false
    if (!a.dueDate) return true
    const d = new Date(a.dueDate + 'T12:00:00')
    return d >= now && d <= in7
  }), [formAssignments])
  const outstanding = useMemo(() => formAssignments.filter((a) => ['pending', 'in_progress', 'resubmission_required'].includes(a.status)), [formAssignments])
  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>()
    return formAssignments.filter((a) => !seen.has(a.assignedToId) && (seen.add(a.assignedToId), true)).map((a) => ({ id: a.assignedToId, name: a.assignedTo }))
  }, [formAssignments])

  const recentIncidents = incidents

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Dashboard</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">Owner — Job & site focused. You can also use Injury Reports, Custom Forms, and Scanned Forms like HR.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/safety/incidents/new"><Button leftIcon={<PlusIcon />}>Report Incident / Near-Miss</Button></Link>
          <Link to="/library"><Button variant="secondary">Forms & Documents</Button></Link>
          <Link to="/jobs"><Button variant="secondary">Job Management</Button></Link>
          <Link to="/injury-reports"><Button variant="secondary">Injury Reports</Button></Link>
          <Link to="/admin/signable-forms"><Button variant="secondary">Custom Forms</Button></Link>
          <Link to="/admin/users"><Button variant="secondary">Manage Users</Button></Link>
        </div>
      </div>

      {/* Global search */}
      <div className="relative">
        <input
          type="search"
          placeholder="Search documents, submissions, incidents..."
          className="w-full min-h-[48px] pl-4 pr-12 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white/90 dark:bg-neutral-800/90 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 shadow-soft transition-all"
        />
        <Link to="/search" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500">
          <SearchIcon className="w-5 h-5" />
        </Link>
      </div>

      {/* Form assignments: assignee filter + impending & outstanding */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Assigned to</span>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm min-w-[160px]"
            aria-label="Filter by assignee"
          >
            <option value="">All</option>
            {assigneeOptions.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card padding="md" className="border-amber-200 dark:border-amber-800">
            <CardHeader className="text-base">Impending Submission</CardHeader>
            <CardDescription>Due within 7 days, not yet submitted</CardDescription>
            <ul className="mt-3 space-y-2 max-h-36 overflow-y-auto">
              {impending.length === 0 ? <li className="text-sm text-neutral-500">None</li> : impending.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <Link to="/library?view=submissions" className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 text-sm">
                    <span className="truncate text-neutral-900 dark:text-white">{a.templateName}</span>
                    <span className="text-neutral-500 shrink-0">{a.assignedTo}{a.dueDate ? ` · ${a.dueDate}` : ''}</span>
                  </Link>
                </li>
              ))}
              {impending.length > 8 && <li className="text-xs text-neutral-500">+{impending.length - 8} more</li>}
            </ul>
            <Link to="/library?view=submissions" className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
          </Card>
          <Card padding="md" className="border-slate-200 dark:border-slate-600">
            <CardHeader className="text-base">Outstanding</CardHeader>
            <CardDescription>Pending, in progress, or resubmission required</CardDescription>
            <ul className="mt-3 space-y-2 max-h-36 overflow-y-auto">
              {outstanding.length === 0 ? <li className="text-sm text-neutral-500">None</li> : outstanding.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <Link to="/library?view=submissions" className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 text-sm">
                    <span className="truncate text-neutral-900 dark:text-white">{a.templateName}</span>
                    <span className="text-neutral-500 shrink-0">{a.assignedTo}</span>
                  </Link>
                </li>
              ))}
              {outstanding.length > 8 && <li className="text-xs text-neutral-500">+{outstanding.length - 8} more</li>}
            </ul>
            <Link to="/library?view=submissions" className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
          </Card>
        </div>
      </div>

      {myResubmissions.length > 0 && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20">
          <CardHeader>Resubmissions</CardHeader>
          <CardDescription>Forms sent back for correction before approval</CardDescription>
          <ul className="mt-4 space-y-2">
            {myResubmissions.slice(0, 8).map((s) => (
              <li key={s.id}>
                <Link
                  to={`/forms/new/${s.templateId}${s.jobId ? `?jobId=${encodeURIComponent(s.jobId)}&draftId=${encodeURIComponent(s.id)}` : `?draftId=${encodeURIComponent(s.id)}`}`}
                  className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-red-100/60 dark:hover:bg-red-900/30 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-neutral-900 dark:text-white">{s.title ?? s.templateName ?? 'Form'}</span>
                    {s.submittedBy?.displayName && (
                      <p className="text-xs text-neutral-500 mt-1">Submitted by {s.submittedBy.displayName}</p>
                    )}
                    {s.resubmissionReason && (
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1 truncate">{s.resubmissionReason}</p>
                    )}
                  </div>
                  <Badge variant="danger">Resubmit</Badge>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/library?view=submissions&status=resubmit_required" className="mt-3 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-l-4 border-l-brand-500/50 dark:border-l-brand-400/50">
          <CardHeader>Compliance Overview</CardHeader>
          <CardDescription>This Period</CardDescription>
          <div className="mt-4 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Inspections Completed</span><span className="font-medium">{compliance.inspectionsCompleted}</span></div>
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Signatures Pending</span><span className="font-medium">{compliance.signaturesPending}</span></div>
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Incidents (Open)</span><span className="font-medium">{compliance.incidentsOpen}</span></div>
            {qualityOpenCount != null && (
              <div className="flex justify-between text-sm items-center gap-2">
                <span className="text-neutral-500">Form Red Flags (open)</span>
                <Link
                  to="/hq/quality-findings"
                  className={`font-medium hover:underline tabular-nums ${qualityOpenCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-neutral-800 dark:text-neutral-200'}`}
                >
                  {qualityOpenCount}
                </Link>
              </div>
            )}
          </div>
        </Card>

        {/* Forms to approve — below compliance overview */}
        <Card hover className="md:col-span-2 border-l-4 border-l-amber-500 dark:border-l-amber-500">
          <CardHeader>Forms to Approve</CardHeader>
          <CardDescription>Submitted forms awaiting your review</CardDescription>
          <ul className="mt-4 space-y-2">
            {submittedForReview.length === 0 ? (
              <li className="text-sm text-neutral-500">No submissions awaiting approval</li>
            ) : (
              submittedForReview.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link to={`/forms/${s.id}`} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
                    <span className="font-medium text-neutral-900 dark:text-white">{s.title || s.templateName}</span>
                    {s.submittedBy && <span className="text-sm text-neutral-500">{s.submittedBy}</span>}
                  </Link>
                </li>
              ))
            )}
          </ul>
          <Link to="/library?view=submissions" className="mt-3 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>Recent Incidents</CardHeader>
          <CardDescription>Latest reported incidents</CardDescription>
          <ul className="mt-4 space-y-2">
            {recentIncidents.map((i) => (
              <li key={i.id}>
                <Link to={`/search/incident/${i.id}`} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
                  <span className="font-medium text-neutral-900 dark:text-white">{i.title}</span>
                  <Badge variant={i.severity === 'high' ? 'danger' : i.severity === 'medium' ? 'warning' : 'default'}>{i.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/search?type=incidents" className="mt-3 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
        </Card>
      </div>
    </div>
  )
}

function PlusIcon() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
}
