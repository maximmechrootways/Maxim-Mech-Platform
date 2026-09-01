import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { api } from '@/api'
import { createJob, createSite, deleteSite, fetchJobs, updateSite } from '@/api/jobs'
import type { JobListItem } from '@/api/jobs'

interface SiteItem {
  id: string
  name: string
  jobId: string | null
  activeJobTitle: string | null
  managerName?: string
}

export function SitesList() {
  const { user } = useUser()
  const [sites, setSites] = useState<SiteItem[]>([])
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [jobsLoading, setJobsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [creating, setCreating] = useState(false)
  const [siteFilter, setSiteFilter] = useState<'active' | 'inactive'>('active')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreateProjectForSiteId, setShowCreateProjectForSiteId] = useState<string | null>(null)
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)

  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'

  const loadSites = () => {
    setLoading(true)
    const activeOnly = siteFilter === 'active'
    api
      .get<SiteItem[]>('/sites', { params: { activeOnly: activeOnly ? 'true' : 'false' } })
      .then((res) => setSites(res.data))
      .catch(() => setSites([]))
      .finally(() => setLoading(false))
  }

  const loadJobs = () => {
    setJobsLoading(true)
    fetchJobs()
      .then((list) => {
        setJobs(Array.isArray(list) ? list : [])
      })
      .catch((err: any) => {
        setJobs([])
        const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message
        setError(typeof msg === 'string' ? msg : 'Failed to load projects')
      })
      .finally(() => setJobsLoading(false))
  }

  useEffect(() => {
    loadSites()
    loadJobs()
  }, [siteFilter])

  const handleDeleteSite = async (siteId: string) => {
    if (!window.confirm('Mark this site as inactive? It will be hidden from the default list but all data is kept. You can view it under Inactive filter.')) return
    setDeletingId(siteId)
    setError(null)
    try {
      await deleteSite(siteId)
      setSites((prev) => prev.filter((s) => s.id !== siteId))
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message
      setError(typeof msg === 'string' ? msg : 'Failed to mark site inactive')
    } finally {
      setDeletingId(null)
    }
  }

  const handleReactivateSite = async (siteId: string) => {
    if (!window.confirm('Reactivate this site? It will appear in the Active list again.')) return
    setReactivatingId(siteId)
    setError(null)
    try {
      await updateSite(siteId, { active: true })
      setSites((prev) => prev.filter((s) => s.id !== siteId))
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message
      setError(typeof msg === 'string' ? msg : 'Failed to reactivate site')
    } finally {
      setReactivatingId(null)
    }
  }

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const created = await createSite({ name: newName.trim(), address: newAddress.trim() || undefined })
      setSites((prev) => [...prev, { ...created, jobId: null, activeJobTitle: null, managerName: 'Unassigned' }])
      setNewName('')
      setNewAddress('')
      setShowCreate(false)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message
      setError(typeof msg === 'string' ? msg : 'Failed to create site')
    } finally {
      setCreating(false)
    }
  }

  const handleCreateProject = async (siteId: string) => {
    if (!newProjectTitle.trim()) return
    setCreatingProject(true)
    setError(null)
    try {
      await createJob({ title: newProjectTitle.trim(), siteId })
      setNewProjectTitle('')
      setShowCreateProjectForSiteId(null)
      loadJobs()
      loadSites()
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message
      setError(typeof msg === 'string' ? msg : 'Failed to create project')
    } finally {
      setCreatingProject(false)
    }
  }

  const jobsBySiteId = useMemo(() => {
    const map = new Map<string, JobListItem[]>()
    for (const j of jobs) {
      const arr = map.get(j.siteId) ?? []
      arr.push(j)
      map.set(j.siteId, arr)
    }
    for (const [siteId, arr] of map.entries()) {
      arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      map.set(siteId, arr)
    }
    return map
  }, [jobs])

  if (loading && sites.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Loading sites…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/safety" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Job Management</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">Clients (sites) with projects (jobs) grouped in buckets</p>
        </div>
        {isOwnerOrHr && (
          <Button leftIcon={<PlusIcon />} onClick={() => { setShowCreate(true); setError(null) }}>
            Add Client
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {!loading && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Projects loaded:{' '}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {jobs.filter((j) => sites.some((s) => s.id === j.siteId)).length}
          </span>
          {jobsLoading && <span> · Loading projects…</span>}
        </div>
      )}

      {isOwnerOrHr && (
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Sites:</label>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value as 'active' | 'inactive')}
            className="min-h-[40px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm min-w-[120px]"
            aria-label="Filter sites"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            type="button"
            onClick={() => { loadSites(); loadJobs() }}
            className="ml-auto text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
          >
            Refresh
          </button>
        </div>
      )}

      {showCreate && isOwnerOrHr && (
        <Card padding="lg">
          <CardHeader>Add a Site</CardHeader>
          <CardDescription>Enter site name and address first (core details). You can add jobs and personnel later from the site page.</CardDescription>
          <form onSubmit={handleCreateSite} className="mt-4 space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Site name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. North Site, Via Rail"
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                aria-label="Site name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Address (optional)</label>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Full address"
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                aria-label="Address"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating || !newName.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); setError(null) }}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <ul className="grid gap-4 lg:grid-cols-3">
        {sites.map((site) => {
          const siteJobs = jobsBySiteId.get(site.id) ?? []
          return (
            <li key={site.id}>
              <Card padding="md" className="h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/sites/${site.id}`} className="block min-w-0">
                      <p className="font-semibold text-neutral-900 dark:text-white truncate">{site.name}</p>
                    </Link>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Supervisors: {site.managerName || 'Unassigned'}
                    </p>
                  </div>
                  {isOwnerOrHr && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setShowCreateProjectForSiteId(site.id)
                        setNewProjectTitle('')
                        setError(null)
                      }}
                    >
                      Add Project
                    </Button>
                  )}
                </div>

                {showCreateProjectForSiteId === site.id && isOwnerOrHr && (
                  <div className="mt-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Project title</label>
                    <input
                      type="text"
                      value={newProjectTitle}
                      onChange={(e) => setNewProjectTitle(e.target.value)}
                      placeholder="e.g. Phase 1 Foundation"
                      className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                      aria-label="Project title"
                      autoFocus
                    />
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleCreateProject(site.id)}
                        disabled={creatingProject || !newProjectTitle.trim()}
                      >
                        {creatingProject ? 'Creating…' : 'Create'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setShowCreateProjectForSiteId(null); setNewProjectTitle('') }}
                        disabled={creatingProject}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  {siteJobs.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">No projects yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {siteJobs.slice(0, 10).map((job) => {
                        const subN = job.subcontractorCount ?? 0
                        const subPersN = job.subcontractorPersonnelCount ?? 0
                        return (
                        <li key={job.id}>
                          <Link
                            to={`/sites/${site.id}/projects/${job.id}`}
                            className="block rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/30 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-neutral-900 dark:text-white truncate">{job.title}</span>
                              <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">{job.status}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                              {job.labourerCount} labourer(s)
                              <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                              {subN} {subN === 1 ? 'contractor' : 'contractors'}
                              <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                              {subPersN === 1 ? '1 person' : `${subPersN} personnel`} on site
                            </div>
                          </Link>
                        </li>
                        )
                      })}
                      {siteJobs.length > 10 && (
                        <li className="text-xs text-neutral-500 dark:text-neutral-400">
                          Showing 10 of {siteJobs.length} projects.
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                {isOwnerOrHr && (
                  <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700 flex justify-end gap-2">
                    {siteFilter === 'active' ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteSite(site.id)}
                        disabled={deletingId === site.id}
                        className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        {deletingId === site.id ? 'Updating…' : 'Mark inactive'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivateSite(site.id)}
                        disabled={reactivatingId === site.id}
                        className="text-sm text-emerald-700 dark:text-emerald-300 hover:underline disabled:opacity-50"
                      >
                        {reactivatingId === site.id ? 'Updating…' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}
