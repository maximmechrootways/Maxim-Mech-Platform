import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { fetchJobs, fetchJobDetail } from '@/api/jobs'
import { fetchDailyForms, fetchFormAssignments, fetchPdfSubmissions, type FormAssignmentRecord, type PdfSubmissionRecord } from '@/api/library'
import { fetchQualityFindingsSummary } from '@/api/qualityFindings'
import { listDailyHazardSubmissions } from '@/api/dailyHazardAnalysis'
import { useSubcontractors } from '@/contexts/SubcontractorsContext'
import { useInjuryReports } from '@/contexts/InjuryReportsContext'
import { useSignableTemplates } from '@/contexts/SignableTemplatesContext'
import { useSafetyObservations } from '@/contexts/SafetyObservationsContext'
import { useCorrectiveActions } from '@/contexts/CorrectiveActionsContext'
import { useCertificates } from '@/contexts/CertificatesContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { getExpiryBucket } from '@/utils/certificateExpiry'
import * as XLSX from 'xlsx'

const TODAY = new Date().toISOString().slice(0, 10)

const CHART_COLORS = {
  reported: '#f59e0b',
  closed: '#10b981',
  completed: '#0f3d7a',
  due: '#94a3b8',
  minor: '#3b82f6',
  moderate: '#f59e0b',
  major: '#ef4444',
}

export function DashboardHR() {
  const { templates } = useSignableTemplates()
  const { observations } = useSafetyObservations()
  const { actions: correctiveActions } = useCorrectiveActions()
  const { certificates } = useCertificates()
  const { reports: injuryReports } = useInjuryReports()
  const { subcontractors, certifications } = useSubcontractors()
  const { employees } = useEmployees()
  const [jobCounts, setJobCounts] = useState<{ activeJobs: number; checkedInToday: number; totalAssignedToday: number } | null>(null)
  const [formsPending, setFormsPending] = useState<number | null>(null)
  const [dailyFormsPendingCount, setDailyFormsPendingCount] = useState<number | null>(null)
  const [formAssignments, setFormAssignments] = useState<FormAssignmentRecord[]>([])
  const [submittedForReview, setSubmittedForReview] = useState<{ id: string; templateName: string; title?: string; submittedBy?: string }[]>([])
  const [dailyHazardSubmissionCount, setDailyHazardSubmissionCount] = useState<number | null>(null)
  const [toolboxTalkSubmissionCount, setToolboxTalkSubmissionCount] = useState<number | null>(null)
  const [allPdfSubmissions, setAllPdfSubmissions] = useState<PdfSubmissionRecord[] | null>(null)
  const [pendingPdfSubmissions, setPendingPdfSubmissions] = useState<PdfSubmissionRecord[] | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [qualityOpenCount, setQualityOpenCount] = useState<number | null>(null)

  useEffect(() => {
    fetchQualityFindingsSummary()
      .then((s) => setQualityOpenCount(s.openCount))
      .catch(() => setQualityOpenCount(null))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const jobs = await fetchJobs()
        if (cancelled) return
        const active = jobs.filter((j) => j.status === 'active')
        if (active.length === 0) {
          setJobCounts({ activeJobs: 0, checkedInToday: 0, totalAssignedToday: 0 })
          return
        }
        const details = await Promise.all(active.map((j) => fetchJobDetail(j.id).catch(() => null)))
        if (cancelled) return
        let checkedInToday = 0
        let totalAssignedToday = 0
        for (const d of details) {
          if (!d) continue
          const labourers = (d as { labourers?: { userId: string }[] }).labourers ?? []
          const checkIns = (d as { checkInsToday?: { userId: string; checkedInAt: string | null }[] }).checkInsToday ?? []
          const checkedUserIds = new Set(
            checkIns.filter((c) => c.checkedInAt).map((c) => c.userId)
          )
          totalAssignedToday += labourers.length
          for (const l of labourers) {
            if (checkedUserIds.has(l.userId)) checkedInToday += 1
          }
        }
        setJobCounts({ activeJobs: active.length, checkedInToday, totalAssignedToday })
      } catch {
        // Keep prior counts on failure so remount/transient errors don't flash zeros.
        if (!cancelled) {
          setJobCounts((prev) => prev ?? { activeJobs: 0, checkedInToday: 0, totalAssignedToday: 0 })
        }
      }
    })()
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    fetchDailyForms()
      .then((list) => {
        const rows = Array.isArray(list) ? list : []
        const dailyPending = rows.filter((f: any) => String(f?.status ?? '').trim().toLowerCase() !== 'signed').length
        setDailyFormsPendingCount(dailyPending)
      })
      .catch(() => {
        setDailyFormsPendingCount((prev) => prev ?? 0)
      })
  }, [])
  useEffect(() => {
    fetchFormAssignments(assigneeFilter ? { assignedToId: assigneeFilter } : undefined)
      .then(setFormAssignments)
      .catch(() => setFormAssignments([]))
  }, [assigneeFilter])

  // Single PDF submissions pass — previously hammered the same endpoint ~6 times per mount.
  useEffect(() => {
    let cancelled = false
    const looksLikeDailyHazard = (text: string) =>
      /daily\s*hazard|daily\s*jha|hazard\s*assessment/i.test(text)
    const looksLikeToolboxTalk = (text: string) =>
      /tool\s*box|toolbox/i.test(text)

    Promise.all([
      fetchPdfSubmissions(),
      listDailyHazardSubmissions().catch(() => []),
    ])
      .then(([pdfList, dhaList]) => {
        if (cancelled) return
        const all = Array.isArray(pdfList) ? pdfList : []
        const nonDraft = all.filter((s) => s.status !== 'DRAFT')
        setAllPdfSubmissions(nonDraft)

        const byPending = new Map<string, PdfSubmissionRecord>()
        const byReview = new Map<string, PdfSubmissionRecord>()
        for (const s of nonDraft) {
          const status = String(s.status)
          if (status === 'SUBMITTED' || status === 'AWAITING_SIGNATURES' || status === 'RESUBMIT_REQUIRED') {
            byPending.set(s.id, s)
          }
          if (status === 'SUBMITTED' || status === 'AWAITING_SIGNATURES') {
            byReview.set(s.id, s)
          }
        }
        setPendingPdfSubmissions([...byPending.values()])
        setSubmittedForReview(
          [...byReview.values()].map((s) => ({
            id: s.id,
            templateName: s.templateName || 'Unknown Template',
            title: s.title,
            submittedBy: typeof s.submittedBy === 'string' ? s.submittedBy : (s as { submittedBy?: { displayName?: string } }).submittedBy?.displayName,
          }))
        )

        const pdfDailyHazardCount = nonDraft.filter((s) => {
          const text = `${s.templateName ?? ''} ${s.title ?? ''}`.trim()
          return looksLikeDailyHazard(text)
        }).length
        const toolboxCount = nonDraft.filter((s) => {
          const text = `${s.templateName ?? ''} ${s.title ?? ''}`.trim()
          return looksLikeToolboxTalk(text)
        }).length
        const legacyDhaCount = Array.isArray(dhaList) ? dhaList.length : 0
        setDailyHazardSubmissionCount(pdfDailyHazardCount + legacyDhaCount)
        setToolboxTalkSubmissionCount(toolboxCount)
      })
      .catch(() => {
        if (cancelled) return
        setDailyHazardSubmissionCount((prev) => prev ?? 0)
        setToolboxTalkSubmissionCount((prev) => prev ?? 0)
        setAllPdfSubmissions((prev) => prev ?? [])
        setPendingPdfSubmissions((prev) => prev ?? [])
        setSubmittedForReview((prev) => prev)
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (dailyFormsPendingCount == null || pendingPdfSubmissions == null) {
      setFormsPending(null)
      return
    }
    setFormsPending(dailyFormsPendingCount + pendingPdfSubmissions.length)
  }, [dailyFormsPendingCount, pendingPdfSubmissions])

  const now = new Date()
  const expiringSoon = certificates.filter((c) => getExpiryBucket(c.expirationDate) === 'expiry-30').length
  const expiredEmployeeCerts = certificates.filter((c) => getExpiryBucket(c.expirationDate) === 'expired').length
  const openInjuries = injuryReports.filter((r) => r.status !== 'closed')
  const activeJobs = jobCounts?.activeJobs ?? null
  const checkedInToday = jobCounts?.checkedInToday ?? null
  const totalAssignedToday = jobCounts?.totalAssignedToday ?? null
  const customForms = templates.filter((f) => f.active)
  const observationsThisMonth = observations.filter((o) => {
    const d = new Date(o.observedAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const overdueCorrective = correctiveActions.filter((c) => c.status !== 'completed' && c.dueDate < TODAY).length
  const formCompletionRate = useMemo(() => {
    if (!allPdfSubmissions) return null
    const total = allPdfSubmissions.filter((s) => ['SUBMITTED', 'AWAITING_SIGNATURES', 'RESUBMIT_REQUIRED', 'APPROVED', 'REJECTED'].includes(String(s.status))).length
    if (total === 0) return 0
    const done = allPdfSubmissions.filter((s) => String(s.status) === 'APPROVED').length
    return Math.round((done / total) * 100)
  }, [allPdfSubmissions])
  const subcontractorCount = subcontractors.length
  const employeeCount = employees.length
  const subcontractorCertsExpiring = certifications.filter((c) => getExpiryBucket(c.expiresAt) === 'expiry-30').length
  // Match Management Review: employee Certificate register only for "Expired certs".
  const totalCertsExpiringSoon = expiringSoon + subcontractorCertsExpiring
  const totalCertsExpired = expiredEmployeeCerts
  const insuranceExpiringSoon = useMemo(() => {
    return subcontractors
      .flatMap((s) => Array.isArray(s.insurances) ? s.insurances : [])
      .filter((ins) => getExpiryBucket(ins.expiresAt) === 'expiry-30').length
  }, [subcontractors])

  const severityCounts = injuryReports.reduce(
    (acc, r) => {
      acc[r.severity] = (acc[r.severity] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const severityData = Object.entries(severityCounts).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
  const pieColors = severityData.map((d) => CHART_COLORS[d.name.toLowerCase() as keyof typeof CHART_COLORS] ?? '#94a3b8')

  const injuryTrendData = useMemo(() => {
    const byMonth: Record<string, { reported: number; closed: number }> = {}
    injuryReports.forEach((r) => {
      const reportedAt = r.reportedAt ? String(r.reportedAt).slice(0, 7) : ''
      if (!reportedAt) return
      if (!byMonth[reportedAt]) byMonth[reportedAt] = { reported: 0, closed: 0 }
      byMonth[reportedAt].reported += 1
      if (r.status === 'closed') byMonth[reportedAt].closed += 1
    })
    return Object.entries(byMonth)
      .map(([month]) => {
        const y = month.slice(0, 4)
        const m = month.slice(5, 7)
        return { month: `${m}/${y.slice(2)}`, ...byMonth[month] }
      })
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [injuryReports])
  const injuryChartData = injuryTrendData.length > 0 ? injuryTrendData : [{ month: '—', reported: 0, closed: 0 }]

  const formCompletionData = useMemo(() => [], [])

  const impending = useMemo(() => {
    const today = new Date()
    const weekOut = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    return formAssignments.filter((a) => {
      if (['completed', 'reviewed'].includes(a.status)) return false
      if (!a.dueDate) return true
      const d = new Date(a.dueDate + 'T12:00:00')
      return d >= today && d <= weekOut
    })
  }, [formAssignments])
  const outstanding = useMemo(() => {
    if (pendingPdfSubmissions && pendingPdfSubmissions.length > 0) {
      return pendingPdfSubmissions.map((s) => ({
        id: s.id,
        templateName: s.title || s.templateName || 'Form submission',
        assignedTo: (typeof s.submittedBy === 'string'
          ? s.submittedBy
          : (s.submittedBy?.displayName || 'Unknown submitter')),
      }))
    }
    return formAssignments.filter((a) => ['pending', 'in_progress', 'resubmission_required'].includes(a.status))
  }, [formAssignments, pendingPdfSubmissions])
  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>()
    return formAssignments.filter((a) => !seen.has(a.assignedToId) && (seen.add(a.assignedToId), true)).map((a) => ({ id: a.assignedToId, name: a.assignedTo }))
  }, [formAssignments])

  const handleExportExcel = () => {
    const injuryRows = injuryReports.map((r) => ({
      ID: r.id,
      Site: r.siteName,
      Description: r.description,
      'Injured Person': r.injuredPersonName ?? '',
      Type: r.injuryType ?? '',
      'Body Part': r.bodyPart ?? '',
      Severity: r.severity,
      Status: r.status,
      'Reported By': r.reportedBy,
      'Reported At': r.reportedAt,
    }))
    const wb = XLSX.utils.book_new()

    const summaryRows = [
      { Metric: 'Daily hazard assessments', Value: dailyHazardSubmissionCount ?? 0 },
      { Metric: 'Toolbox talks', Value: toolboxTalkSubmissionCount ?? 0 },
      { Metric: 'Training', Value: certificates.length },
      { Metric: 'Incidents (open)', Value: openInjuries.length },
      { Metric: 'Form completion %', Value: formCompletionRate ?? 0 },
      { Metric: 'Observations (month)', Value: observationsThisMonth },
      { Metric: 'Overdue CAPA', Value: overdueCorrective },
      { Metric: 'Certs expiring (30d)', Value: totalCertsExpiringSoon },
      { Metric: 'Expired certs', Value: totalCertsExpired },
      { Metric: 'Insurance expiring (30d)', Value: insuranceExpiringSoon },
      { Metric: 'Active jobs', Value: activeJobs ?? 0 },
      { Metric: 'Checked in today', Value: `${checkedInToday ?? 0}/${totalAssignedToday ?? 0}` },
      { Metric: 'Forms pending', Value: formsPending ?? 0 },
      { Metric: 'Subcontractors', Value: subcontractorCount },
      { Metric: 'Our employees', Value: employeeCount },
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

    const safeInjuryRows = injuryRows.length > 0 ? injuryRows : [{ Note: 'No injury report rows available.' }]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(safeInjuryRows), 'Injury Reports')

    const submissionRows = (allPdfSubmissions ?? []).map((s) => ({
      ID: s.id,
      Title: s.title ?? '',
      Template: s.templateName ?? '',
      Status: s.status ?? '',
      SubmittedBy: typeof s.submittedBy === 'string' ? s.submittedBy : (s.submittedBy?.displayName ?? ''),
      SubmittedAt: s.submittedAt ?? '',
      CreatedAt: s.createdAt ?? '',
      Job: s.jobTitle ?? '',
      Site: s.jobSiteName ?? '',
    }))
    const safeSubmissionRows = submissionRows.length > 0 ? submissionRows : [{ Note: 'No form submissions found.' }]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(safeSubmissionRows), 'Form Submissions')

    const assignmentRows = formAssignments.map((a) => ({
      ID: a.id,
      Template: a.templateName,
      AssignedTo: a.assignedTo,
      AssignedBy: a.assignedBy,
      DueDate: a.dueDate ?? '',
      Status: a.status,
      Recurrence: a.recurrence ?? '',
      CreatedAt: a.createdAt,
      UpdatedAt: a.updatedAt,
    }))
    const safeAssignmentRows = assignmentRows.length > 0 ? assignmentRows : [{ Note: 'No form assignments found.' }]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(safeAssignmentRows), 'Assignments')

    XLSX.writeFile(wb, `hr-dashboard-export-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <header className="mb-8 no-print">
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">HR Dashboard</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-1">Injury Reports, Forms, and Job Assignments</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={handleExportExcel}>Export to Excel</Button>
          <Button variant="secondary" onClick={() => window.print()}>Print</Button>
          <button type="button" className="text-sm text-neutral-500 dark:text-neutral-400 hover:underline" onClick={() => alert('Scheduled report would be emailed weekly.')}>Schedule Weekly Report</button>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link to="/safety" className="text-brand-600 dark:text-brand-400 hover:underline">Health &amp; Safety</Link>
            <Link to="/safety/alerts" className="text-brand-600 dark:text-brand-400 hover:underline">Safety Alerts &amp; Acknowledgements</Link>
            <Link to="/injury-reports/analytics" className="text-brand-600 dark:text-brand-400 hover:underline">Injury Analytics</Link>
            <Link to="/injury-reports" className="text-brand-600 dark:text-brand-400 hover:underline">Injury Reports</Link>
            <Link to="/library?view=submissions&from=safety" className="text-brand-600 dark:text-brand-400 hover:underline">Completed Forms</Link>
            <Link to="/subcontractors" className="text-brand-600 dark:text-brand-400 hover:underline">Subcontractors</Link>
            <Link to="/employees" className="text-brand-600 dark:text-brand-400 hover:underline">Employees</Link>
          </nav>
        </div>
      </header>

      {openInjuries.length > 0 && (
        <section className="mb-6">
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 px-4 py-3 flex items-center gap-3">
            <span className="text-amber-600 dark:text-amber-400 font-medium">Open injury reports:</span>
            <span className="text-sm text-amber-800 dark:text-amber-200">Review and close open reports.</span>
            <Link to="/injury-reports" className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline ml-auto">View reports</Link>
          </div>
        </section>
      )}

      {/* Form assignments: assignee filter + impending, outstanding, forms to approve */}
      <section className="mb-8">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card padding="md" className="border-amber-200 dark:border-amber-800">
              <CardHeader className="text-base">Impending Submission</CardHeader>
              <CardDescription>Due within 7 days</CardDescription>
              <ul className="mt-3 space-y-2 max-h-28 overflow-y-auto">
                {impending.length === 0 ? <li className="text-sm text-neutral-500">None</li> : impending.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link to="/library?view=submissions" className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 text-sm">
                      <span className="truncate text-neutral-900 dark:text-white">{a.templateName}</span>
                      <span className="text-neutral-500 shrink-0">{a.assignedTo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/library?view=submissions" className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
            </Card>
            <Card padding="md" className="border-slate-200 dark:border-slate-600">
              <CardHeader className="text-base">Outstanding</CardHeader>
              <CardDescription>Pending or in progress</CardDescription>
              <ul className="mt-3 space-y-2 max-h-28 overflow-y-auto">
                {outstanding.length === 0 ? <li className="text-sm text-neutral-500">None</li> : outstanding.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link to="/library?view=submissions" className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 text-sm">
                      <span className="truncate text-neutral-900 dark:text-white">{a.templateName}</span>
                      <span className="text-neutral-500 shrink-0">{a.assignedTo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/library?view=submissions" className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
            </Card>
            <Card padding="md" className="border-l-4 border-l-amber-500 dark:border-l-amber-500">
              <CardHeader className="text-base">Forms to Approve</CardHeader>
              <CardDescription>Awaiting your review</CardDescription>
              <ul className="mt-3 space-y-2 max-h-28 overflow-y-auto">
                {submittedForReview.length === 0 ? <li className="text-sm text-neutral-500">None</li> : submittedForReview.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link to={`/forms/${s.id}`} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 text-sm">
                      <span className="truncate text-neutral-900 dark:text-white">{s.title || s.templateName}</span>
                      {s.submittedBy && <span className="text-neutral-500 shrink-0">{s.submittedBy}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/library?view=submissions" className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
            </Card>
          </div>
        </div>
      </section>

      {/* At a glance: order per spec */}
      <section className="mb-8">
        <Card padding="md">
          <CardHeader className="text-base">At a Glance</CardHeader>
          <CardDescription>Leading indicators and key counts</CardDescription>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Form Red Flags (open)" value={qualityOpenCount ?? '—'} to="/hq/quality-findings" variant={qualityOpenCount != null && qualityOpenCount > 0 ? 'warning' : undefined} />
            <Stat label="Toolbox talks" value={toolboxTalkSubmissionCount ?? '—'} to="/library?view=submissions&from=safety&bucket=tool-box-talks" />
            <Stat label="Training" value={certificates.length} to="/certificates" />
            <Stat label="Incidents" value={openInjuries.length} to="/injury-reports" variant={openInjuries.length > 0 ? 'warning' : undefined} />
            <Stat label="Form completion %" value={formCompletionRate == null ? '—' : `${formCompletionRate}%`} />
            <Stat label="Observations (month)" value={observationsThisMonth} to="/safety/observations" />
            <Stat label="Overdue CAPA" value={overdueCorrective} to="/safety/corrective-actions" variant={overdueCorrective > 0 ? 'warning' : undefined} />
            <Stat label="Certs expiring (30d)" value={totalCertsExpiringSoon} to="/certificates?status=expiry-30" variant={totalCertsExpiringSoon > 0 ? 'warning' : undefined} />
            <Stat label="Expired certs" value={totalCertsExpired} to="/certificates?status=expired" variant={totalCertsExpired > 0 ? 'warning' : undefined} />
            <Stat label="Insurance expiring (30d)" value={insuranceExpiringSoon} to="/certificates?section=subcontractor-insurance" variant={insuranceExpiringSoon > 0 ? 'warning' : undefined} />
          </div>
        </Card>
      </section>

      {/* Key metrics */}
      <section className="mb-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Open Injuries" value={openInjuries.length} href="/injury-reports?filter=open" highlight={openInjuries.length > 0} />
          <StatCard label="Active Jobs" value={activeJobs ?? '—'} href="/jobs" />
          <StatCard label="Checked In Today" value={jobCounts == null ? '—' : `${checkedInToday}/${totalAssignedToday}`} sub="on site" href="/jobs" />
          <StatCard label="Forms Pending" value={formsPending ?? '—'} href="/daily-forms" />
          <StatCard label="Subcontractors" value={subcontractorCount} sub={subcontractorCertsExpiring > 0 ? `${subcontractorCertsExpiring} certs soon` : undefined} href="/subcontractors" />
          <StatCard label="Our Employees" value={employeeCount} href="/employees" />
        </div>
      </section>

      {/* Charts: injury trend + severity */}
      <section className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card padding="md">
          <CardHeader className="text-base">Injury Trend</CardHeader>
          <CardDescription>Reported vs closed by month</CardDescription>
          <div className="mt-4 h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={injuryChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-600" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'currentColor', fontSize: 11 }} className="text-neutral-500" />
                <YAxis tick={{ fill: 'currentColor', fontSize: 11 }} className="text-neutral-500" allowDecimals={false} width={24} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-neutral-200)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="reported" name="Reported" fill={CHART_COLORS.reported} radius={[4, 4, 0, 0]} />
                <Bar dataKey="closed" name="Closed" fill={CHART_COLORS.closed} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card padding="md">
          <CardHeader className="text-base">Injury Severity</CardHeader>
          <CardDescription>All time</CardDescription>
          <div className="mt-4 h-[240px] w-full">
            {severityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={72}
                    paddingAngle={2}
                    label={({ name, value }) => `${name}: ${value}`}
                    stroke="transparent"
                  >
                    {severityData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">No data yet</div>
            )}
          </div>
        </Card>
      </section>

      {/* Quick access: injuries + forms in one card */}
      <section className="mb-8">
        <Card padding="md">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <CardHeader className="text-base mb-0 pb-1">Open Injury Reports</CardHeader>
                <Link to="/injury-reports" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
              </div>
              <ul className="mt-2 space-y-1">
                {openInjuries.length === 0 ? (
                  <li className="text-sm text-neutral-500 py-2">None open</li>
                ) : (
                  openInjuries.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <Link to={`/injury-reports/${r.id}`} className="flex items-center justify-between gap-2 py-2 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-sm">
                        <span className="text-neutral-900 dark:text-white truncate">{r.siteName} — {(r.injuredPersonName || r.description).slice(0, 30)}{(r.injuredPersonName || r.description).length > 30 ? '…' : ''}</span>
                        <Badge variant={r.severity === 'major' ? 'danger' : 'warning'} className="shrink-0">{r.status}</Badge>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <CardHeader className="text-base mb-0 pb-1">Custom Forms</CardHeader>
                <Link to="/admin/signable-forms" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Manage</Link>
              </div>
              <ul className="mt-2 space-y-1">
                {customForms.slice(0, 5).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 py-2 px-2 rounded-lg text-sm">
                    <span className="text-neutral-900 dark:text-white">{f.name}</span>
                    <span className="text-neutral-500 dark:text-neutral-400 text-xs">{f.schedule}</span>
                  </li>
                ))}
                {customForms.length === 0 && <li className="text-sm text-neutral-500 py-2">No forms yet</li>}
              </ul>
            </div>
          </div>
        </Card>
      </section>

      {formCompletionData.length > 0 && (
        <section>
          <Card padding="md">
            <CardHeader className="text-base">Form Completion (4 Weeks)</CardHeader>
            <div className="mt-3 h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formCompletionData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-600" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: 'currentColor', fontSize: 11 }} className="text-neutral-500" />
                  <YAxis tick={{ fill: 'currentColor', fontSize: 11 }} className="text-neutral-500" allowDecimals={false} width={24} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="completed" name="Completed" fill={CHART_COLORS.completed} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="due" name="Due" fill={CHART_COLORS.due} radius={[4, 4, 0, 0]} opacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  to,
  variant,
}: {
  label: string
  value: number | string
  to?: string
  variant?: 'warning'
}) {
  const content = (
    <div className="flex flex-col">
      <span className={`text-xl font-semibold tabular-nums ${variant === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-900 dark:text-white'}`}>
        {value}
      </span>
      <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{label}</span>
    </div>
  )
  if (to) {
    return <Link to={to} className="rounded-lg p-2 -m-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">{content}</Link>
  }
  return content
}

function StatCard({
  label,
  value,
  sub,
  href,
  highlight,
}: {
  label: string
  value: number | string
  sub?: string
  href?: string
  highlight?: boolean
}) {
  const content = (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-600 bg-neutral-50/50 dark:bg-neutral-800/30 px-4 py-3 min-h-[5.5rem] flex flex-col justify-between">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{label}</p>
      <div>
        <p className={`mt-1 text-xl font-bold tabular-nums ${highlight ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-900 dark:text-white'}`}>
          {value}
        </p>
        <p className={`mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 ${sub ? '' : 'invisible'}`}>{sub || '\u00A0'}</p>
      </div>
    </div>
  )
  if (href) {
    return <Link to={href} className="block transition-opacity hover:opacity-90">{content}</Link>
  }
  return content
}
