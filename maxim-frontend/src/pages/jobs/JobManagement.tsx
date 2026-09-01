import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  fetchJobs,
  createJob,
  addSupervisor,
  removeSupervisor,
  fetchSites,
  fetchSupervisors,
  type JobListItem,
  type SiteOption,
  type SupervisorOption,
} from '@/api/jobs'
import { fetchPdfTemplates } from '@/api/library'
export function JobManagement() {
  const { user } = useUser()
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [sites, setSites] = useState<SiteOption[]>([])
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSiteId, setNewSiteId] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [legislativeComplianceTemplateId, setLegislativeComplianceTemplateId] = useState<string | null>(null)
  const [criticalTaskRiskRegisterTemplateId, setCriticalTaskRiskRegisterTemplateId] = useState<string | null>(null)
  const [confinedSpaceEntryPermitTemplateId, setConfinedSpaceEntryPermitTemplateId] = useState<string | null>(null)
  const jobTemplates: { id: string; name: string; defaultSiteName?: string }[] = []

  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'

  useEffect(() => {
    if (!isOwnerOrHr) {
      setLoading(false)
      return
    }
    let cancelled = false
    Promise.all([fetchJobs(), fetchSites(), fetchSupervisors()])
      .then(([jobList, siteList, supList]) => {
        if (!cancelled) {
          setJobs(jobList)
          setSites(siteList)
          setSupervisors(supList)
          if (siteList.length && !newSiteId) setNewSiteId(siteList[0].id)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [isOwnerOrHr])

  useEffect(() => {
    if (!isOwnerOrHr) return
    fetchPdfTemplates()
      .then((list) => {
        const leg = list.find((t) => /legislative compliance evaluation/i.test((t.name ?? '').trim()))
        setLegislativeComplianceTemplateId(leg?.id ?? null)
        const ctr = list.find(
          (t) =>
            /critical task inventory/i.test((t.name ?? '').trim()) && /risk register/i.test((t.name ?? '').trim())
        )
        setCriticalTaskRiskRegisterTemplateId(ctr?.id ?? null)
        const csp = list.find((t) => /confined\s+space\s+entry\s+permit/i.test((t.name ?? '').trim()))
        setConfinedSpaceEntryPermitTemplateId(csp?.id ?? null)
      })
      .catch(() => {
        setLegislativeComplianceTemplateId(null)
        setCriticalTaskRiskRegisterTemplateId(null)
        setConfinedSpaceEntryPermitTemplateId(null)
      })
  }, [isOwnerOrHr])

  const getSupervisorNames = (ids: string[]) =>
    ids.length === 0 ? 'None' : ids.map((id) => supervisors.find((s) => s.id === id)?.name ?? id).join(', ')

  const toggleSupervisor = async (jobId: string, supervisorId: string) => {
    const job = jobs.find((j) => j.id === jobId)
    if (!job) return
    const isAssigned = (job.assignedSupervisorIds ?? []).includes(supervisorId)
    try {
      if (isAssigned) {
        await removeSupervisor(jobId, supervisorId)
        setJobs((prev) =>
          prev.map((j) =>
            j.id !== jobId
              ? j
              : { ...j, assignedSupervisorIds: (j.assignedSupervisorIds ?? []).filter((id) => id !== supervisorId) }
          )
        )
      } else {
        await addSupervisor(jobId, supervisorId)
        setJobs((prev) =>
          prev.map((j) =>
            j.id !== jobId ? j : { ...j, assignedSupervisorIds: [...(j.assignedSupervisorIds ?? []), supervisorId] }
          )
        )
      }
    } catch (err) {
      setError((err as any)?.response?.data?.error || 'Failed to update')
    }
  }

  const handleCreateJob = async () => {
    if (!newTitle.trim() || !newSiteId) return
    setCreating(true)
    setError(null)
    try {
      const created = await createJob({ title: newTitle.trim(), siteId: newSiteId })
      setJobs((prev) => [
        ...prev,
        {
          id: created.id,
          title: created.title,
          siteId: created.siteId,
          siteName: created.siteName,
          status: created.status,
          createdBy: created.createdBy,
          createdAt: created.createdAt,
          assignedSupervisorIds: created.assignedSupervisorIds ?? [],
          labourerCount: 0,
          progressStage: created.progressStage ?? 'not-started',
        },
      ])
      setNewTitle('')
      setNewSiteId(sites[0]?.id ?? '')
      setShowCreate(false)
      // Refetch from server so the list is persisted; when user leaves and comes back they see the saved job
      const freshList = await fetchJobs()
      setJobs(freshList)
    } catch (err) {
      const msg = (err as any)?.response?.data?.error ?? (err as any)?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to create job')
    } finally {
      setCreating(false)
    }
  }

  if (!isOwnerOrHr) return null

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Loading jobs…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Job Management</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">Create jobs, assign supervisors and labourers</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowCreate(true)} leftIcon={<PlusIcon />}>Create Job</Button>
          <select
            className="rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-4 py-2 text-sm"
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (!id) return
              const t = jobTemplates.find((x) => x.id === id)
              if (t) {
                setNewTitle(t.name)
                const site = sites.find((s) => s.name === (t.defaultSiteName ?? 'North Site'))
                if (site) setNewSiteId(site.id)
                setShowCreate(true)
              }
              e.target.value = ''
            }}
            aria-label="Create from template"
          >
            <option value="">Create from template…</option>
            {jobTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {showCreate && (
        <Card padding="lg">
          <CardHeader>Create Job</CardHeader>
          <CardDescription>Add a new job/site. Then assign one or more supervisors and labourers.</CardDescription>
          <div className="mt-4 space-y-4 max-w-md">
            {sites.length === 0 && (
              <p className="text-amber-700 dark:text-amber-200 text-sm rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2">
                No sites yet. Create a site first under <Link to="/sites" className="underline font-medium">Job Management (Sites)</Link>, then come back to create a job.
              </p>
            )}
            <input
              placeholder="Job title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
              aria-label="Job title"
            />
            <select
              value={newSiteId}
              onChange={(e) => setNewSiteId(e.target.value)}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
              aria-label="Site"
            >
              <option value="">Select a site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                onClick={handleCreateJob}
                disabled={creating || !newTitle.trim() || !newSiteId}
              >
                {creating ? 'Creating…' : 'Create'}
              </Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <ul className="space-y-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <Card padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">{job.title}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {job.siteName} · Supervisors: {getSupervisorNames(job.assignedSupervisorIds ?? [])} · {job.labourerCount} labourer(s)
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={job.status === 'active' ? 'success' : 'default'}>{job.status}</Badge>
                <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Assign supervisors">
                  {supervisors.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={(job.assignedSupervisorIds ?? []).includes(s.id)}
                        onChange={() => toggleSupervisor(job.id, s.id)}
                        className="rounded border-slate-300 text-brand-600"
                      />
                      <span className="text-neutral-700 dark:text-neutral-300">{s.name}</span>
                    </label>
                  ))}
                </div>
                {legislativeComplianceTemplateId && (
                  <Link to={`/forms/new/${legislativeComplianceTemplateId}?jobId=${encodeURIComponent(job.id)}`}>
                    <Button size="sm" variant="outline">Legislative compliance</Button>
                  </Link>
                )}
                {criticalTaskRiskRegisterTemplateId && (
                  <Link to={`/forms/new/${criticalTaskRiskRegisterTemplateId}?jobId=${encodeURIComponent(job.id)}`}>
                    <Button size="sm" variant="outline">Critical task register</Button>
                  </Link>
                )}
                {confinedSpaceEntryPermitTemplateId && (
                  <Link to={`/forms/new/${confinedSpaceEntryPermitTemplateId}?jobId=${encodeURIComponent(job.id)}`}>
                    <Button size="sm" variant="outline">Confined space permit</Button>
                  </Link>
                )}
                <Link to={`/jobs/${job.id}`}><Button size="sm" variant="secondary">Manage</Button></Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PlusIcon() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
