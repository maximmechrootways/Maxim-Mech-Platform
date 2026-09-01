import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, CardDescription, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { addSupervisor, deleteJob, fetchJobDetail, fetchSiteDetail, fetchSupervisors, removeSupervisor, updateJob, updateSite } from '@/api/jobs'
import * as hazardsApi from '@/api/hazards'
import * as injuryReportsApi from '@/api/injuryReports'
import { fetchToolboxTalkSummary, fetchAssignedPersonnelSubmissionsByJob, type AssignedPersonnelSubmission } from '@/api/library'
import { ProjectDocumentsSection } from '@/pages/safety/ProjectDocumentsSection'
import { useUser } from '@/contexts/UserContext'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function ProjectDashboard() {
  const { siteId, jobId } = useParams()
  const navigate = useNavigate()
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [site, setSite] = useState<any>(null)
  const [job, setJob] = useState<any>(null)
  const [hazards, setHazards] = useState<any[]>([])
  const [injuries, setInjuries] = useState<any[]>([])
  const [toolboxSummary, setToolboxSummary] = useState<{ total: number; submitted: number; approved: number; recentTalks?: { id: string; title: string; date: string; status: string }[] }>({ total: 0, submitted: 0, approved: 0 })
  const [assignedPersonnelSubmissions, setAssignedPersonnelSubmissions] = useState<AssignedPersonnelSubmission[]>([])

  const [openProjectDetails, setOpenProjectDetails] = useState(true)
  const [openSafetyPulse, setOpenSafetyPulse] = useState(true)
  const [openPersonnel, setOpenPersonnel] = useState(true)
  const [openDocs, setOpenDocs] = useState(true)
  const [openSubmittedForms, setOpenSubmittedForms] = useState(true)

  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  type ProgressStatus = 'on-hold' | 'active' | 'completed' | 'inactive'
  const [progressStatus, setProgressStatus] = useState<ProgressStatus>('on-hold')
  const [editingInfo, setEditingInfo] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)
  const [editForm, setEditForm] = useState({ projectTitle: '', siteAddress: '', gate: '', supervisorIds: [] as string[] })
  const [supervisors, setSupervisors] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (!isOwnerOrHr) return
    fetchSupervisors()
      .then((list: any) => setSupervisors(Array.isArray(list) ? list : []))
      .catch(() => setSupervisors([]))
  }, [isOwnerOrHr])

  useEffect(() => {
    if (!siteId || !jobId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchSiteDetail(siteId),
      fetchJobDetail(jobId),
    ])
      .then(([siteRes, jobRes]) => {
        if (cancelled) return
        setSite(siteRes)
        setJob(jobRes)
        const nextStatus = (jobRes?.status as ProgressStatus | undefined) ?? 'on-hold'
        setProgressStatus(nextStatus)
        setEditForm({
          projectTitle: (jobRes?.title ?? '') as string,
          siteAddress: (siteRes?.address ?? '') as string,
          gate: (jobRes?.gate ?? '') as string,
          supervisorIds: [
            ...new Set([
              ...((jobRes?.assignedSupervisorIds ?? []) as string[]),
              ...((siteRes?.siteSupervisors ?? []) as Array<{ userId: string }>).map((s) => s.userId),
            ]),
          ],
        })
      })
      .catch((err: any) => {
        if (cancelled) return
        setError(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Failed to load project')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [siteId, jobId])

  useEffect(() => {
    if (!site?.id) return
    hazardsApi
      .fetchHazards({ siteId: site.id })
      .then((list: any) => setHazards(Array.isArray(list) ? list : []))
      .catch(() => setHazards([]))
  }, [site?.id])

  useEffect(() => {
    if (!site?.name) return
    injuryReportsApi
      .fetchInjuryReports()
      .then((list: any) => {
        const arr = Array.isArray(list) ? list : []
        setInjuries(arr.filter((r: any) => r.siteName === site.name))
      })
      .catch(() => setInjuries([]))
  }, [site?.name])

  useEffect(() => {
    if (!jobId) return
    fetchToolboxTalkSummary(jobId)
      .then((s) => setToolboxSummary(s))
      .catch(() => setToolboxSummary({ total: 0, submitted: 0, approved: 0 }))

    fetchAssignedPersonnelSubmissionsByJob(jobId)
      .then((rows) => setAssignedPersonnelSubmissions(Array.isArray(rows) ? rows : []))
      .catch(() => setAssignedPersonnelSubmissions([]))
  }, [jobId])

  const hazardsSummary = useMemo(() => {
    const open = hazards.filter((h) => (h?.status ?? '').toLowerCase() !== 'closed')
    const closed = hazards.filter((h) => (h?.status ?? '').toLowerCase() === 'closed')
    return { open: open.length, closed: closed.length, total: hazards.length }
  }, [hazards])

  const injuriesSummary = useMemo(() => {
    const open = injuries.filter((r) => (r?.status ?? '').toLowerCase() !== 'closed')
    const closed = injuries.filter((r) => (r?.status ?? '').toLowerCase() === 'closed')
    return { open: open.length, closed: closed.length, total: injuries.length }
  }, [injuries])

  const supervisorIdsMerged = useMemo(
    () =>
      [
        ...new Set([
          ...((job?.assignedSupervisorIds ?? []) as string[]),
          ...((site?.siteSupervisors ?? []) as Array<{ userId: string }>).map((s) => s.userId),
        ]),
      ],
    [job?.assignedSupervisorIds, site?.siteSupervisors]
  )

  const labourersCount = Math.max(
    Array.isArray(job?.labourers) ? job.labourers.length : 0,
    Array.isArray(site?.siteLabourers) ? site.siteLabourers.length : 0
  )
  const subcontractorsCount = (job?.subcontractors ?? []).length
  const personnelPageHref = siteId
    ? `/sites/${siteId}?tab=personnel${jobId ? `&jobId=${encodeURIComponent(jobId)}` : ''}`
    : '/sites'

  const safetyOpenRatio = clamp01(
    hazardsSummary.total === 0 ? 0 : hazardsSummary.open / Math.max(1, hazardsSummary.total)
  )
  const progressMeta = useMemo(() => {
    // Persisted via `job.status` (3 steps)
    if (progressStatus === 'on-hold') return { label: 'Not started', pct: 0 }
    if (progressStatus === 'active') return { label: 'In progress', pct: 50 }
    if (progressStatus === 'inactive') return { label: 'Inactive (archived)', pct: 100 }
    return { label: 'Complete', pct: 100 }
  }, [progressStatus])

  if (loading && !site && !job) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    )
  }

  if (!siteId || !jobId) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Missing project.</p>
        <Link to="/sites" className="text-brand-600 dark:text-brand-400 hover:underline">Back to Job Management</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/sites" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Job Management</Link>
        <span className="text-neutral-400">·</span>
        <Link to={`/sites/${siteId}`} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Client</Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight truncate">
            {job?.title ?? 'Project Dashboard'}
          </h1>
          <div className="mt-2 max-w-xl">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Progress</span>
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{progressMeta.label} · {progressMeta.pct}%</span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-neutral-200/80 dark:bg-neutral-700/70 overflow-hidden">
              <div className="h-full bg-brand-600 dark:bg-brand-400" style={{ width: `${progressMeta.pct}%` }} aria-hidden />
            </div>
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            {site?.name ? <>Client: <span className="font-medium text-neutral-700 dark:text-neutral-300">{site.name}</span></> : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {job?.status && <Badge variant={job.status === 'active' ? 'success' : 'default'}>{job.status}</Badge>}
          <Link to={personnelPageHref}>
            <Button variant="secondary" size="sm">Open Personnel Page</Button>
          </Link>
          {isOwnerOrHr && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              onClick={async () => {
                if (!jobId) return
                if (!window.confirm('Delete this project? This cannot be undone.')) return
                setDeletingProject(true)
                setError(null)
                try {
                  await deleteJob(jobId)
                  navigate('/sites')
                } catch (err: any) {
                  setError(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Failed to delete project')
                } finally {
                  setDeletingProject(false)
                }
              }}
              disabled={deletingProject}
            >
              {deletingProject ? 'Deleting…' : 'Delete Project'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <Card padding="lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardHeader className="mb-0">Project Details</CardHeader>
            <CardDescription>Core details for this project under the client.</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {isOwnerOrHr && (
              <button
                type="button"
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
                onClick={() => {
                  if (!editingInfo) {
                    setEditForm({
                      projectTitle: job?.title ?? '',
                      siteAddress: site?.address ?? '',
                      gate: job?.gate ?? '',
                      supervisorIds: [...supervisorIdsMerged],
                    })
                  }
                  setEditingInfo((e) => !e)
                }}
              >
                {editingInfo ? 'Cancel edit' : 'Edit info'}
              </button>
            )}
            <button
              type="button"
              className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
              onClick={() => setOpenProjectDetails((o) => !o)}
            >
              {openProjectDetails ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
        {openProjectDetails && (
          <div className="mt-4">
            {editingInfo && isOwnerOrHr ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Client</label>
                  <div className="min-h-[44px] flex items-center px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-neutral-50 dark:bg-neutral-800/60 text-neutral-700 dark:text-neutral-200">
                    {site?.name ?? '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Site address</label>
                  <input
                    value={editForm.siteAddress}
                    onChange={(e) => setEditForm((f) => ({ ...f, siteAddress: e.target.value }))}
                    placeholder="Address"
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    aria-label="Site address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Project</label>
                  <input
                    value={editForm.projectTitle}
                    onChange={(e) => setEditForm((f) => ({ ...f, projectTitle: e.target.value }))}
                    placeholder="Project title"
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    aria-label="Project title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Progress</label>
                  <select
                    value={progressStatus}
                    onChange={(e) => setProgressStatus(e.target.value as ProgressStatus)}
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    aria-label="Project progress"
                  >
                    <option value="on-hold">Not started</option>
                    <option value="active">In progress</option>
                    <option value="completed">Complete</option>
                    <option value="inactive">Inactive (archive)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Gate</label>
                  <input
                    value={editForm.gate}
                    onChange={(e) => setEditForm((f) => ({ ...f, gate: e.target.value }))}
                    placeholder="e.g. Gate A, East Gate"
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    aria-label="Gate"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Supervisors</label>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">Select one or more supervisors for this site/project.</p>
                  <ul className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800/50 p-2 space-y-1">
                    {supervisors.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                        <input
                          type="checkbox"
                          id={`project-sup-${s.id}`}
                          checked={editForm.supervisorIds.includes(s.id)}
                          onChange={(e) => {
                            setEditForm((f) => ({
                              ...f,
                              supervisorIds: e.target.checked
                                ? [...f.supervisorIds, s.id]
                                : f.supervisorIds.filter((id) => id !== s.id),
                            }))
                          }}
                          className="rounded border-neutral-300 dark:border-neutral-600 text-brand-600"
                        />
                        <label htmlFor={`project-sup-${s.id}`} className="text-sm cursor-pointer flex-1">{s.name}</label>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-end">
                  <div className="w-full">
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Personnel</label>
                    <div className="min-h-[44px] flex items-center px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-neutral-50 dark:bg-neutral-800/60 text-neutral-700 dark:text-neutral-200">
                      {labourersCount} employees · {subcontractorsCount} subcontractors
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-2 flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!siteId || !jobId) return
                      setSavingInfo(true)
                      setError(null)
                      try {
                        const newTitle = editForm.projectTitle.trim()
                        const newAddress = editForm.siteAddress.trim()
                        const titleChanged = newTitle !== (job?.title ?? '')
                        const statusChanged = progressStatus !== (job?.status ?? '')
                        const gateChanged = (editForm.gate.trim() || '') !== (job?.gate ?? '')
                        if (titleChanged || statusChanged || gateChanged) {
                          await updateJob(jobId, {
                            title: titleChanged ? newTitle : undefined,
                            status: statusChanged ? progressStatus : undefined,
                            gate: gateChanged ? (editForm.gate.trim() || '') : undefined,
                          })
                        }
                        if (newAddress !== (site?.address ?? '')) {
                          await updateSite(siteId, { address: newAddress || undefined })
                        }

                        const prevSup = [...supervisorIdsMerged]
                        const nextSup = [...new Set(editForm.supervisorIds)]
                        const toRemove = prevSup.filter((id) => !nextSup.includes(id))
                        const toAdd = nextSup.filter((id) => !prevSup.includes(id))
                        for (const supId of toRemove) {
                          await removeSupervisor(jobId, supId)
                        }
                        for (const supId of toAdd) {
                          await addSupervisor(jobId, supId)
                        }
                        const [siteRes, jobRes] = await Promise.all([fetchSiteDetail(siteId), fetchJobDetail(jobId)])
                        setSite(siteRes)
                        setJob(jobRes)
                        setProgressStatus((jobRes?.status as ProgressStatus | undefined) ?? 'on-hold')
                        setEditingInfo(false)
                      } catch (err: any) {
                        setError(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Failed to save')
                      } finally {
                        setSavingInfo(false)
                      }
                    }}
                    disabled={savingInfo || !editForm.projectTitle.trim()}
                  >
                    {savingInfo ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingInfo(false)}
                    disabled={savingInfo}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="text-sm">
                  <div className="text-neutral-500 dark:text-neutral-400">Client</div>
                  <div className="text-neutral-900 dark:text-white font-medium">{site?.name ?? '—'}</div>
                </div>
                <div className="text-sm">
                  <div className="text-neutral-500 dark:text-neutral-400">Site address</div>
                  <div className="text-neutral-900 dark:text-white font-medium">{site?.address ?? '—'}</div>
                </div>
                <div className="text-sm">
                  <div className="text-neutral-500 dark:text-neutral-400">Project</div>
                  <div className="text-neutral-900 dark:text-white font-medium">{job?.title ?? '—'}</div>
                </div>
                <div className="text-sm">
                  <div className="text-neutral-500 dark:text-neutral-400">Personnel</div>
                  <div className="text-neutral-900 dark:text-white font-medium">{labourersCount} employees · {subcontractorsCount} subcontractors</div>
                </div>
                <div className="text-sm">
                  <div className="text-neutral-500 dark:text-neutral-400">Gate</div>
                  <div className="text-neutral-900 dark:text-white font-medium">{job?.gate ?? '—'}</div>
                </div>
                <div className="text-sm">
                  <div className="text-neutral-500 dark:text-neutral-400">Supervisors</div>
                  <div className="text-neutral-900 dark:text-white font-medium">
                    {(() => {
                      if (supervisorIdsMerged.length === 0) return '—'
                      return supervisorIdsMerged
                        .map((id) => supervisors.find((s) => s.id === id)?.name ?? id)
                        .join(', ')
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card padding="lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardHeader className="mb-0">Submitted Forms (Assigned Personnel)</CardHeader>
            <CardDescription>Forms submitted by labourers and supervisors assigned to this job site.</CardDescription>
          </div>
          <button
            type="button"
            className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
            onClick={() => setOpenSubmittedForms((o) => !o)}
          >
            {openSubmittedForms ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {openSubmittedForms && (
          <div className="mt-4">
            {assignedPersonnelSubmissions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-sm text-neutral-500 dark:text-neutral-400">
                No submitted forms yet from assigned labourers/supervisors for this project.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
                <table className="w-full text-left text-sm text-neutral-600 dark:text-neutral-300">
                  <thead className="bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">Form</th>
                      <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">Submitted By</th>
                      <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 bg-white dark:bg-neutral-900">
                    {assignedPersonnelSubmissions.map((row) => (
                      <tr key={row.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <Link to={`/forms/${row.id}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
                            {row.title}
                          </Link>
                          <div className="text-xs text-neutral-500 mt-0.5">{row.templateName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-neutral-900 dark:text-white">{row.submittedByName ?? 'Unknown'}</div>
                          <div className="text-xs text-neutral-500 capitalize">{row.submittedByRole ?? 'worker'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              row.status === 'APPROVED'
                                ? 'success'
                                : row.status === 'SUBMITTED'
                                  ? 'default'
                                  : 'warning'
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-neutral-500">
                          {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card padding="lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardHeader className="mb-0">Health & Safety Pulse</CardHeader>
            <CardDescription>Quick snapshot with links to the full pages.</CardDescription>
          </div>
          <button
            type="button"
            className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
            onClick={() => setOpenSafetyPulse((o) => !o)}
          >
            {openSafetyPulse ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {openSafetyPulse && (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">Open Hazards</div>
                <Link to="/safety/hazards" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Open full page</Link>
              </div>
              <div className="mt-3">
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[{ name: 'Hazards', Open: hazardsSummary.open, Closed: hazardsSummary.closed }]}
                      layout="vertical"
                      margin={{ top: 0, right: 10, bottom: 0, left: 10 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip />
                      <Bar dataKey="Open" fill="#f59e0b" radius={[6, 6, 6, 6]} />
                      <Bar dataKey="Closed" fill="#22c55e" radius={[6, 6, 6, 6]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Open: {hazardsSummary.open}</span>
                  <span>Closed: {hazardsSummary.closed}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">Injury Reports</div>
                <Link to="/injury-reports" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Open full page</Link>
              </div>
              <div className="mt-3">
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[{ name: 'Injuries', Open: injuriesSummary.open, Closed: injuriesSummary.closed }]}
                      layout="vertical"
                      margin={{ top: 0, right: 10, bottom: 0, left: 10 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip />
                      <Bar dataKey="Open" fill="#ef4444" radius={[6, 6, 6, 6]} />
                      <Bar dataKey="Closed" fill="#22c55e" radius={[6, 6, 6, 6]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Open: {injuriesSummary.open}</span>
                  <span>Closed: {injuriesSummary.closed}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">Toolbox Talks</div>
                <Link to="/library?view=submissions" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Open full page</Link>
              </div>
              <div className="mt-3">
                <div className="h-24 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-4xl font-display font-bold text-neutral-900 dark:text-white">{toolboxSummary.total}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">total submissions</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Submitted: {toolboxSummary.submitted}</span>
                  <span>Approved: {toolboxSummary.approved}</span>
                </div>
              </div>
              {toolboxSummary.recentTalks && toolboxSummary.recentTalks.length > 0 && (
                <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                  <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">Recent Submissions</div>
                  <ul className="space-y-2">
                    {toolboxSummary.recentTalks.map(talk => (
                      <li key={talk.id}>
                        <Link to={`/forms/${talk.id}`} className="block group">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-neutral-900 dark:text-neutral-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 truncate">{talk.title}</span>
                            <span className="text-xs text-neutral-500 shrink-0 ml-2">{new Date(talk.date).toLocaleDateString()}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardHeader className="mb-0">Personnel on Site</CardHeader>
            <CardDescription>Both cards are clickable and can also route to the existing Personnel page.</CardDescription>
          </div>
          <button
            type="button"
            className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
            onClick={() => setOpenPersonnel((o) => !o)}
          >
            {openPersonnel ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {openPersonnel && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Link
              to={personnelPageHref}
              className="block rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
            >
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">Employees on site</div>
              <div className="mt-2 text-3xl font-display font-bold text-neutral-900 dark:text-white">{labourersCount}</div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Click to open Personnel page</div>
            </Link>

            <Link
              to={personnelPageHref}
              className="block rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
            >
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">Subcontractors on site</div>
              <div className="mt-2 text-3xl font-display font-bold text-neutral-900 dark:text-white">{subcontractorsCount}</div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Click to open Personnel page</div>
            </Link>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardHeader className="mb-0">Project Documents</CardHeader>
            <CardDescription>Miscellaneous documents explicitly linked to this project.</CardDescription>
          </div>
          <button
            type="button"
            className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
            onClick={() => setOpenDocs((o) => !o)}
          >
            {openDocs ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {openDocs && jobId && (
          <ProjectDocumentsSection jobId={jobId} canManage={isOwnerOrHr} />
        )}
      </Card>
    </div>
  )
}

