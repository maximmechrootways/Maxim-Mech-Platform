import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useSubcontractors } from '@/contexts/SubcontractorsContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Button } from '@/components/ui/Button'
import { api } from '@/api'
import * as incidentsApi from '@/api/incidents'
import * as hazardsApi from '@/api/hazards'
import * as injuryReportsApi from '@/api/injuryReports'
import {
  fetchJobDetail,
  addLabourer,
  removeLabourer,
  addSupervisor,
  removeSupervisor,
  addSubcontractor,
  removeSubcontractor,
  checkIn,
  resetCheckIn,
  fetchUsers,
  fetchUsersForAssignment,
  fetchSupervisors,
  fetchSubcontractors,
  updateSite,
  addSiteSupervisor,
  removeSiteSupervisor,
  addSiteLabourer,
  removeSiteLabourer,
} from '@/api/jobs'
import { Input } from '@/components/ui/Input'
import {
  addPersonnelJobAssignment as apiAddPersonnelToJob,
  removePersonnelJobAssignment as apiRemovePersonnelFromJob,
} from '@/api/subcontractors'

const TODAY = new Date().toISOString().slice(0, 10)

function isHrAdminRole(role: string | undefined): boolean {
  return role === 'owner' || role === 'hr'
}

function employmentAssignable(u: { employmentStatus?: string }): boolean {
  return u.employmentStatus !== 'on-leave' && u.employmentStatus !== 'terminated'
}

function formatCheckInTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

export function SiteDetail() {
  const { id } = useParams()
  const location = useLocation()
  const requestedJobId = new URLSearchParams(location.search).get('jobId')
  const { user } = useUser()
  const { personnelJobAssignments, personnel, loadPersonnelForSubcontractor } = useSubcontractors()
  const [site, setSite] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [incidents, setIncidents] = useState<any[]>([])
  const [hazards, setHazards] = useState<any[]>([])
  const [injuries, setInjuries] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'safety' | 'personnel' | 'details'>('safety')
  const [job, setJob] = useState<any>(null)
  const [users, setUsers] = useState<{ id: string; name: string; role: string; employmentStatus?: string }[]>([])
  const [supervisors, setSupervisors] = useState<{ id: string; name: string; role: string }[]>([])
  const [subcontractors, setSubcontractorsList] = useState<{ id: string; companyName: string; primaryContactName: string; status: string }[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingSite, setEditingSite] = useState(false)
  const [selectedLabourerIds, setSelectedLabourerIds] = useState<string[]>([])
  const [selectedAdminStaffIds, setSelectedAdminStaffIds] = useState<string[]>([])
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<string[]>([])
  const [selectedSubcontractorIds, setSelectedSubcontractorIds] = useState<string[]>([])
  const [editSiteForm, setEditSiteForm] = useState({
    name: '',
    address: '',
    meetingPoint: '',
    nearestHospital: '',
    firstAiderName: '',
    firstAiderPhone: '',
    emergencyContact: '',
  })
  const [savingSite, setSavingSite] = useState(false)
  const [showCreateJob, setShowCreateJob] = useState(false)
  const [newJobTitle, setNewJobTitle] = useState('')
  const [creatingJob, setCreatingJob] = useState(false)

  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    if (tab === 'safety' || tab === 'personnel' || tab === 'details') setActiveTab(tab)
  }, [location.search])

  useEffect(() => {
    let cancelled = false
    if (!id) {
      setSite(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setSite(null)

    api
      .get(`/sites/${id}`)
      .then((res) => {
        if (cancelled) return
        setSite(res.data)
      })
      .catch(() => {
        if (cancelled) return
        setSite(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!site?.id) return
    Promise.all([
      incidentsApi.fetchIncidents({ siteId: site.id }),
      hazardsApi.fetchHazards({ siteId: site.id }),
      injuryReportsApi.fetchInjuryReports().catch(() => []),
    ]).then(([incList, hazList, injuryList]) => {
      setIncidents(Array.isArray(incList) ? incList : [])
      setHazards(Array.isArray(hazList) ? hazList : [])
      const bySite = Array.isArray(injuryList) ? injuryList.filter((r: any) => r.siteName === site.name) : []
      setInjuries(bySite)
    })
  }, [site?.id, site?.name])

  const loadJob = useCallback(() => {
    const fallbackJobId = site?.activeJob?.id
    const targetJobId = requestedJobId || fallbackJobId
    if (!targetJobId) {
      setJob(null)
      return
    }
    setError(null)
    fetchJobDetail(targetJobId)
      .then(setJob)
      .catch(async (err) => {
        if (requestedJobId && fallbackJobId && requestedJobId !== fallbackJobId) {
          try {
            const fallbackJob = await fetchJobDetail(fallbackJobId)
            setJob(fallbackJob)
            return
          } catch {
            // Fall through to the standard error handling below.
          }
        }
        setJob(null)
        setError(err.response?.data?.error || 'Failed to load job details')
      })
  }, [requestedJobId, site?.activeJob?.id])

  const reloadSite = useCallback(() => {
    if (!id) return
    api.get(`/sites/${id}`).then((res) => setSite(res.data)).catch(() => {})
  }, [id])

  useEffect(() => {
    loadJob()
  }, [loadJob])

  // Load rosters for assigned subcontractors so we can add workers to this job.
  useEffect(() => {
    if (!job?.subcontractors?.length) return
    for (const s of job.subcontractors) {
      void loadPersonnelForSubcontractor(s.id)
    }
  }, [job?.id, job?.subcontractors, loadPersonnelForSubcontractor])

  useEffect(() => {
    if (user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor') {
      if (user?.role === 'owner' || user?.role === 'hr') {
        fetchUsersForAssignment().then(setUsers).catch(() => fetchUsers().then(setUsers))
        fetchSupervisors().then(setSupervisors).catch(() => { })
        fetchSubcontractors().then(setSubcontractorsList).catch(() => { })
      } else {
        fetchUsers().then(setUsers).catch(() => { })
      }
    }
  }, [user?.role])

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    )
  }

  if (!site) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/safety" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
          <span className="text-neutral-400">·</span>
          <Link to="/sites" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Job sites</Link>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400">Site not found.</p>
        <Link to="/sites" className="text-brand-600 dark:text-brand-400 hover:underline">Back to Job Management</Link>
      </div>
    )
  }

  const checkInsToday = site.checkedInToday ?? []
  const siteSupervisors = (site?.siteSupervisors ?? []) as { id: string; userId: string; userName: string }[]
  const siteLabourers = (site?.siteLabourers ?? []) as { id: string; userId: string; userName: string; assignedAt: string }[]
  const siteSupervisorIds = siteSupervisors.map((s) => s.userId)
  const siteLabourerIds = siteLabourers.map((l) => l.userId)
  const assignedSupervisorIds = [...new Set([...(job?.assignedSupervisorIds ?? []), ...siteSupervisorIds])] as string[]
  const isSupervisor =
    user?.role === 'supervisor' &&
    (assignedSupervisorIds.includes(user?.id ?? '') || siteSupervisorIds.includes(user?.id ?? ''))
  const canAssignLabourers = isOwnerOrHr || isSupervisor
  const canCheckIn = isOwnerOrHr || isSupervisor

  const assignedJobUserIds = (job?.labourers ?? []).map((l: any) => l.userId)
  const roleForUserId = (uid: string) => users.find((u) => u.id === uid)?.role
  const assignableLabourers = users.filter((u) => u.role === 'labourer' && employmentAssignable(u))
  const assignableAdminStaff = users.filter((u) => isHrAdminRole(u.role) && employmentAssignable(u))
  const labourersNotOnJob = assignableLabourers.filter((u) => !assignedJobUserIds.includes(u.id))
  const adminStaffNotOnJob = assignableAdminStaff.filter((u) => !assignedJobUserIds.includes(u.id))
  const jobLabourerAssignments = (job?.labourers ?? []).filter((l: any) => !isHrAdminRole(roleForUserId(l.userId)))
  const jobAdminAssignments = (job?.labourers ?? []).filter((l: any) => isHrAdminRole(roleForUserId(l.userId)))

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newJobTitle.trim() || !site?.id) return
    setCreatingJob(true)
    setError(null)
    try {
      // Import createJob at the top of the file via the bulk api/jobs imports
      const { createJob } = await import('@/api/jobs')
      await createJob({ title: newJobTitle.trim(), siteId: site.id })
      setShowCreateJob(false)
      setNewJobTitle('')
      // Reload site to get the new active job
      const res = await api.get(`/sites/${site.id}`)
      setSite(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create job')
    } finally {
      setCreatingJob(false)
    }
  }
  const assignLabourersBulk = async (userIds: string[]) => {
    if (!job?.id || userIds.length === 0) return
    setActionLoading('assign-bulk-labourers')
    try {
      for (const userId of userIds) {
        await addLabourer(job.id, userId)
      }
      loadJob()
      setSelectedLabourerIds([])
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to assign')
    } finally {
      setActionLoading(null)
    }
  }

  const assignAdminStaffBulk = async (userIds: string[]) => {
    if (!job?.id || userIds.length === 0) return
    setActionLoading('assign-bulk-admin')
    try {
      for (const userId of userIds) {
        await addLabourer(job.id, userId)
      }
      loadJob()
      setSelectedAdminStaffIds([])
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to assign')
    } finally {
      setActionLoading(null)
    }
  }

  const removeLabourerFromJob = async (userId: string) => {
    if (!job?.id) return
    setActionLoading('remove-' + userId)
    try {
      await removeLabourer(job.id, userId)
      loadJob()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to remove')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCheckIn = async (userId: string) => {
    if (!job?.id) return
    setActionLoading('checkin-' + userId)
    try {
      await checkIn(job.id, userId, TODAY)
      loadJob()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to check in')
    } finally {
      setActionLoading(null)
    }
  }

  const handleResetCheckIn = async (userId: string) => {
    if (!job?.id) return
    setActionLoading('reset-' + userId)
    try {
      await resetCheckIn(job.id, userId, TODAY)
      loadJob()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reset check-in')
    } finally {
      setActionLoading(null)
    }
  }

  const assignedSupervisorIdsForActions = assignedSupervisorIds
  const supervisorsNotOnJob = supervisors.filter((s) => !assignedSupervisorIdsForActions.includes(s.id))
  const assignSupervisorsBulk = async (userIds: string[]) => {
    if (!job?.id || userIds.length === 0) return
    setActionLoading('assign-bulk-supervisors')
    try {
      for (const userId of userIds) {
        await addSupervisor(job.id, userId)
      }
      loadJob()
      reloadSite()
      setSelectedSupervisorIds([])
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to assign supervisors')
    } finally {
      setActionLoading(null)
    }
  }
  const removeSupervisorFromJob = async (userId: string) => {
    if (!job?.id) return
    setActionLoading('sup-rm-' + userId)
    try {
      await removeSupervisor(job.id, userId)
      loadJob()
      reloadSite()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to remove supervisor')
    } finally {
      setActionLoading(null)
    }
  }

  const assignedSubcontractorIds = (job?.subcontractors ?? []).map((s: any) => s.id)
  const subcontractorsNotOnJob = subcontractors.filter((s) => !assignedSubcontractorIds.includes(s.id))
  const assignSubcontractorsBulk = async (subIds: string[]) => {
    if (!job?.id || subIds.length === 0) return
    setActionLoading('assign-bulk-subcontractors')
    try {
      for (const subId of subIds) {
        await addSubcontractor(job.id, subId)
      }
      loadJob()
      setSelectedSubcontractorIds([])
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to assign subcontractors')
    } finally {
      setActionLoading(null)
    }
  }
  const removeSubcontractorFromJob = async (subId: string) => {
    if (!job?.id) return
    setActionLoading('sub-rm-' + subId)
    try {
      await removeSubcontractor(job.id, subId)
      loadJob()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to remove subcontractor')
    } finally {
      setActionLoading(null)
    }
  }

  const addSubcontractorPersonnelToJob = async (subcontractorId: string, personnelId: string) => {
    if (!job?.id) return
    setActionLoading('add-sub-pers')
    setError(null)
    try {
      await apiAddPersonnelToJob(subcontractorId, personnelId, {
        jobId: job.id,
        assignedAt: TODAY,
      })
      await loadPersonnelForSubcontractor(subcontractorId)
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Could not assign this worker to the job.'
      setError(msg)
      window.alert(msg)
    } finally {
      setActionLoading(null)
    }
  }

  const removeSubcontractorPersonnelFromJob = async (subcontractorId: string, personnelId: string, assignmentId: string) => {
    if (!job?.id) return
    setActionLoading('rm-sub-pers')
    setError(null)
    try {
      await apiRemovePersonnelFromJob(subcontractorId, personnelId, assignmentId)
      await loadPersonnelForSubcontractor(subcontractorId)
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Could not remove this worker from the job.'
      setError(msg)
      window.alert(msg)
    } finally {
      setActionLoading(null)
    }
  }

  const siteLabourersOnly = siteLabourers.filter((l) => !isHrAdminRole(roleForUserId(l.userId)))
  const siteAdminOnly = siteLabourers.filter((l) => isHrAdminRole(roleForUserId(l.userId)))
  const labourersNotOnSite = assignableLabourers.filter((u) => !siteLabourerIds.includes(u.id))
  const adminStaffNotOnSite = assignableAdminStaff.filter((u) => !siteLabourerIds.includes(u.id))
  const supervisorsNotOnSite = supervisors.filter((s) => !siteSupervisorIds.includes(s.id))

  const assignSiteSupervisorsBulk = async (userIds: string[]) => {
    if (!site?.id || userIds.length === 0) return
    setActionLoading('assign-site-sup')
    try {
      for (const userId of userIds) {
        await addSiteSupervisor(site.id, userId)
      }
      reloadSite()
      loadJob()
      setSelectedSupervisorIds([])
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to assign supervisors')
    } finally {
      setActionLoading(null)
    }
  }
  const removeSiteSupervisorFromSite = async (userId: string) => {
    if (!site?.id) return
    setActionLoading('site-sup-rm-' + userId)
    try {
      await removeSiteSupervisor(site.id, userId)
      reloadSite()
      loadJob()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to remove supervisor')
    } finally {
      setActionLoading(null)
    }
  }
  const assignSiteLabourersBulk = async (userIds: string[]) => {
    if (!site?.id || userIds.length === 0) return
    setActionLoading('assign-site-labourers')
    try {
      for (const userId of userIds) {
        await addSiteLabourer(site.id, userId)
      }
      reloadSite()
      setSelectedLabourerIds([])
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to assign labourers')
    } finally {
      setActionLoading(null)
    }
  }

  const assignSiteAdminStaffBulk = async (userIds: string[]) => {
    if (!site?.id || userIds.length === 0) return
    setActionLoading('assign-site-admin')
    try {
      for (const userId of userIds) {
        await addSiteLabourer(site.id, userId)
      }
      reloadSite()
      setSelectedAdminStaffIds([])
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to assign HR/Admin staff')
    } finally {
      setActionLoading(null)
    }
  }
  const removeSiteLabourerFromSite = async (userId: string) => {
    if (!site?.id) return
    setActionLoading('site-lab-rm-' + userId)
    try {
      await removeSiteLabourer(site.id, userId)
      reloadSite()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to remove labourer')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs items={[{ label: 'Job Management', to: '/sites' }, { label: site.name }]} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">{site.name}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            {job?.title
              ? `Job: ${job.title}`
              : site.activeJob?.title
                ? `Active Job: ${site.activeJob.title}`
                : 'No active job'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={activeTab === 'safety' ? 'primary' : 'secondary'} onClick={() => setActiveTab('safety')}>
            Health & Safety
          </Button>
          <Button variant={activeTab === 'personnel' ? 'primary' : 'secondary'} onClick={() => setActiveTab('personnel')}>
            Personnel
          </Button>
          <Button variant={activeTab === 'details' ? 'primary' : 'secondary'} onClick={() => setActiveTab('details')}>
            Details
          </Button>
        </div>
      </div>

      {!site.activeJob && isOwnerOrHr && (
        <Card padding="md" className="border-brand-200 dark:border-brand-800/50 bg-brand-50/50 dark:bg-brand-900/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-brand-900 dark:text-brand-100">No Active Job</h3>
              <p className="text-sm text-brand-700/80 dark:text-brand-300/80 mt-1">Creating a job is optional. Not every site has subcategories (e.g. Via Rail). When you need to assign personnel and manage check-ins, you can create a job here.</p>
            </div>
            {!showCreateJob ? (
              <Button onClick={() => setShowCreateJob(true)}>Create Job (optional)</Button>
            ) : (
              <form onSubmit={handleCreateJob} className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Input
                  autoFocus
                  placeholder="e.g. Phase 1 Foundation"
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  className="min-w-[200px]"
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={!newJobTitle.trim() || creatingJob}>
                    {creatingJob ? 'Saving…' : 'Save'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowCreateJob(false)} disabled={creatingJob}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {activeTab === 'safety' && (
        <div className="space-y-6 animate-fade-in">
          {checkInsToday.length > 0 && (
            <Card padding="md">
              <CardHeader className="text-base">Checked in Today</CardHeader>
              <CardDescription>Personnel on site</CardDescription>
              <ul className="mt-3 space-y-2">
                {checkInsToday.map((c: any) => (
                  <li key={c.userId} className="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                    <span className="text-sm font-medium text-neutral-900 dark:text-white">{c.userName ?? c.userId}</span>
                    <span className="text-xs text-neutral-500">In at {c.checkedInAt ? new Date(c.checkedInAt).toLocaleTimeString() : '—'}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card padding="md">
              <div className="flex items-center justify-between gap-2">
                <CardHeader className="text-base mb-0">Open Hazards</CardHeader>
                <Link to="/safety/hazards" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
              </div>
              {hazards.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">No hazards at this site.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {hazards.slice(0, 5).map((h: any) => (
                    <li key={h.id}>
                      <Link to={`/safety/hazards/${h.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                        <span className="text-sm font-medium text-neutral-900 dark:text-white">{h.title}</span>
                        <Badge variant={h.riskLevel === 'critical' || h.riskLevel === 'high' ? 'danger' : 'warning'}>{h.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card padding="md">
              <div className="flex items-center justify-between gap-2">
                <CardHeader className="text-base mb-0">Recent Incidents</CardHeader>
                <Link to="/safety/incidents" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
              </div>
              {incidents.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">No incidents at this site.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {incidents.slice(0, 5).map((i: any) => (
                    <li key={i.id}>
                      <Link to={`/safety/incidents/${i.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                        <span className="text-sm font-medium text-neutral-900 dark:text-white">{i.title}</span>
                        <Badge variant="default">{i.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card padding="md" className="lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <CardHeader className="text-base mb-0">Injury Reports at This Site</CardHeader>
                <Link to="/injury-reports" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
              </div>
              {injuries.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">No injury reports at this site.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {injuries.slice(0, 5).map((r: any) => (
                    <li key={r.id}>
                      <Link to={`/injury-reports/${r.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                        <span className="text-sm font-medium text-neutral-900 dark:text-white">{(r.injuredPersonName || r.description || '').slice(0, 40)}{(r.description && r.description.length > 40) ? '…' : ''}</span>
                        <Badge variant={r.severity === 'major' ? 'danger' : 'warning'}>{r.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'personnel' && (
        <div className="space-y-6 animate-fade-in">
          {!job ? (
            <>
              <p className="text-neutral-600 dark:text-neutral-400">Assign supervisors and labourers to this site. Creating a job is optional — you can add personnel to the site even without a job (e.g. Via Rail).</p>
              {isOwnerOrHr && (
                <>
                  <Card padding="lg">
                    <CardHeader>Site Supervisors</CardHeader>
                    <CardDescription>Supervisors assigned to this site. They can manage labourers and check-ins when a job exists.</CardDescription>
                    <ul className="mt-4 space-y-3">
                      {siteSupervisors.length === 0 ? (
                        <li className="text-sm text-neutral-500 dark:text-neutral-400">No supervisors assigned to this site.</li>
                      ) : (
                        siteSupervisors.map((s) => (
                          <li key={s.userId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                            <Link to={`/employees/${s.userId}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">{s.userName}</Link>
                            <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => removeSiteSupervisorFromSite(s.userId)} disabled={!!actionLoading}>Remove</Button>
                          </li>
                        ))
                      )}
                    </ul>
                    {supervisorsNotOnSite.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Add supervisors</p>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <button type="button" className="text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setSelectedSupervisorIds(supervisorsNotOnSite.map((u) => u.id))}>Select all</button>
                          <span className="text-neutral-400">|</span>
                          <button type="button" className="text-xs text-neutral-600 dark:text-neutral-400 hover:underline" onClick={() => setSelectedSupervisorIds([])}>Deselect all</button>
                          {selectedSupervisorIds.length > 0 && <span className="text-sm text-neutral-500">({selectedSupervisorIds.length} selected)</span>}
                        </div>
                        <ul className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-2 space-y-1 mb-3">
                          {supervisorsNotOnSite.map((u) => (
                            <li key={u.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                              <input type="checkbox" id={`site-sup-${u.id}`} checked={selectedSupervisorIds.includes(u.id)} onChange={(e) => setSelectedSupervisorIds((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id))} className="rounded border-neutral-300 dark:border-neutral-600 text-brand-600" />
                              <label htmlFor={`site-sup-${u.id}`} className="text-sm cursor-pointer flex-1">{u.name}</label>
                            </li>
                          ))}
                        </ul>
                        <Button size="sm" variant="outline" onClick={() => assignSiteSupervisorsBulk(selectedSupervisorIds)} disabled={!!actionLoading || selectedSupervisorIds.length === 0}>Add selected ({selectedSupervisorIds.length})</Button>
                      </div>
                    )}
                  </Card>
                  <Card padding="lg">
                    <CardHeader>Site Labourers</CardHeader>
                    <CardDescription>Field crew (labourers) assigned to this site. When you create a job, you can assign them to that job too.</CardDescription>
                    <ul className="mt-4 space-y-3">
                      {siteLabourersOnly.length === 0 ? (
                        <li className="text-sm text-neutral-500 dark:text-neutral-400">No labourers assigned to this site.</li>
                      ) : (
                        siteLabourersOnly.map((l) => (
                          <li key={l.userId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                            <div>
                              <Link to={`/employees/${l.userId}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">{l.userName}</Link>
                              <div className="text-xs text-neutral-500 mt-1">Assigned {new Date(l.assignedAt).toLocaleDateString()}</div>
                            </div>
                            <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => removeSiteLabourerFromSite(l.userId)} disabled={!!actionLoading}>Remove</Button>
                          </li>
                        ))
                      )}
                    </ul>
                    {labourersNotOnSite.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Add labourers</p>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <button type="button" className="text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setSelectedLabourerIds(labourersNotOnSite.map((u) => u.id))}>Select all</button>
                          <span className="text-neutral-400">|</span>
                          <button type="button" className="text-xs text-neutral-600 dark:text-neutral-400 hover:underline" onClick={() => setSelectedLabourerIds([])}>Deselect all</button>
                          {selectedLabourerIds.length > 0 && <span className="text-sm text-neutral-500">({selectedLabourerIds.length} selected)</span>}
                        </div>
                        <ul className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-2 space-y-1 mb-3">
                          {labourersNotOnSite.map((u) => (
                            <li key={u.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                              <input type="checkbox" id={`site-lab-${u.id}`} checked={selectedLabourerIds.includes(u.id)} onChange={(e) => setSelectedLabourerIds((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id))} className="rounded border-neutral-300 dark:border-neutral-600 text-brand-600" />
                              <label htmlFor={`site-lab-${u.id}`} className="text-sm cursor-pointer flex-1">{u.name}</label>
                            </li>
                          ))}
                        </ul>
                        <Button size="sm" variant="outline" onClick={() => assignSiteLabourersBulk(selectedLabourerIds)} disabled={!!actionLoading || selectedLabourerIds.length === 0}>Add selected ({selectedLabourerIds.length})</Button>
                      </div>
                    )}
                  </Card>
                  <Card padding="lg">
                    <CardHeader>HR &amp; Admin (office staff)</CardHeader>
                    <CardDescription>Owner and HR accounts associated with this site (e.g. head office).</CardDescription>
                    <ul className="mt-4 space-y-3">
                      {siteAdminOnly.length === 0 ? (
                        <li className="text-sm text-neutral-500 dark:text-neutral-400">No HR/Admin staff assigned to this site.</li>
                      ) : (
                        siteAdminOnly.map((l) => (
                          <li key={l.userId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Link to={`/employees/${l.userId}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">{l.userName}</Link>
                                {roleForUserId(l.userId) ? (
                                  <Badge variant="default">{roleForUserId(l.userId) === 'owner' ? 'Owner' : 'HR'}</Badge>
                                ) : null}
                              </div>
                              <div className="text-xs text-neutral-500 mt-1">Assigned {new Date(l.assignedAt).toLocaleDateString()}</div>
                            </div>
                            <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => removeSiteLabourerFromSite(l.userId)} disabled={!!actionLoading}>Remove</Button>
                          </li>
                        ))
                      )}
                    </ul>
                    {adminStaffNotOnSite.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Add HR / Admin</p>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <button type="button" className="text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setSelectedAdminStaffIds(adminStaffNotOnSite.map((u) => u.id))}>Select all</button>
                          <span className="text-neutral-400">|</span>
                          <button type="button" className="text-xs text-neutral-600 dark:text-neutral-400 hover:underline" onClick={() => setSelectedAdminStaffIds([])}>Deselect all</button>
                          {selectedAdminStaffIds.length > 0 && <span className="text-sm text-neutral-500">({selectedAdminStaffIds.length} selected)</span>}
                        </div>
                        <ul className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-2 space-y-1 mb-3">
                          {adminStaffNotOnSite.map((u) => (
                            <li key={u.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                              <input
                                type="checkbox"
                                id={`site-admin-${u.id}`}
                                checked={selectedAdminStaffIds.includes(u.id)}
                                onChange={(e) => setSelectedAdminStaffIds((prev) => (e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)))}
                                className="rounded border-neutral-300 dark:border-neutral-600 text-brand-600"
                              />
                              <label htmlFor={`site-admin-${u.id}`} className="text-sm cursor-pointer flex-1">
                                {u.name}{' '}
                                <span className="text-neutral-500">({u.role === 'owner' ? 'Owner' : 'HR'})</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                        <Button size="sm" variant="outline" onClick={() => assignSiteAdminStaffBulk(selectedAdminStaffIds)} disabled={!!actionLoading || selectedAdminStaffIds.length === 0}>
                          Add selected ({selectedAdminStaffIds.length})
                        </Button>
                      </div>
                    )}
                  </Card>
                </>
              )}
            </>
          ) : (
            <>
              <Card padding="lg">
                <CardHeader>Direct Employees (Labourers)</CardHeader>
                <CardDescription>Manage labourers assigned to this site and track daily check-ins.</CardDescription>
                <ul className="mt-4 space-y-3">
                  {jobLabourerAssignments.length === 0 ? (
                    <li className="text-sm text-neutral-500 dark:text-neutral-400">No labourers assigned.</li>
                  ) : (
                    jobLabourerAssignments.map((l: any) => {
                      const checkInRecord = (job.checkInsToday ?? []).find((c: any) => c.userId === l.userId && c.date === TODAY)
                      return (
                        <li key={l.userId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                          <div>
                            <Link to={`/employees/${l.userId}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">{l.userName ?? l.userId}</Link>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              Assigned {new Date(l.assignedAt).toLocaleDateString()}
                              {checkInRecord && ` · In: ${formatCheckInTime(checkInRecord.checkedInAt)}`}
                              {checkInRecord?.checkedOutAt && ` · Out: ${formatCheckInTime(checkInRecord.checkedOutAt)}`}
                            </div>
                            <div className="mt-1">
                              <Badge variant="success">Training: Up to date</Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {canCheckIn && (
                              <>
                                {!checkInRecord ? (
                                  <Button size="sm" onClick={() => handleCheckIn(l.userId)} disabled={!!actionLoading}>Check in</Button>
                                ) : (
                                  <Button size="sm" variant="secondary" onClick={() => handleResetCheckIn(l.userId)} disabled={!!actionLoading}>Reset check-in</Button>
                                )}
                              </>
                            )}
                            {canAssignLabourers && (
                              <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300" onClick={() => removeLabourerFromJob(l.userId)} disabled={!!actionLoading}>Remove</Button>
                            )}
                          </div>
                        </li>
                      )
                    })
                  )}
                </ul>
                {canAssignLabourers && labourersNotOnJob.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Assign new labourers</p>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <button type="button" className="text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setSelectedLabourerIds(labourersNotOnJob.map((u) => u.id))}>Select all</button>
                      <span className="text-neutral-400">|</span>
                      <button type="button" className="text-xs text-neutral-600 dark:text-neutral-400 hover:underline" onClick={() => setSelectedLabourerIds([])}>Deselect all</button>
                      {selectedLabourerIds.length > 0 && (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">({selectedLabourerIds.length} selected)</span>
                      )}
                    </div>
                    <ul className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-2 space-y-1 mb-3">
                      {labourersNotOnJob.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                          <input
                            type="checkbox"
                            id={`labourer-${u.id}`}
                            checked={selectedLabourerIds.includes(u.id)}
                            onChange={(e) => setSelectedLabourerIds((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id))}
                            className="rounded border-neutral-300 dark:border-neutral-600 text-brand-600"
                          />
                          <label htmlFor={`labourer-${u.id}`} className="text-sm cursor-pointer flex-1">{u.name}</label>
                        </li>
                      ))}
                    </ul>
                    <Button size="sm" variant="outline" onClick={() => assignLabourersBulk(selectedLabourerIds)} disabled={!!actionLoading || selectedLabourerIds.length === 0}>
                      Add selected ({selectedLabourerIds.length})
                    </Button>
                  </div>
                )}
              </Card>

              <Card padding="lg">
                <CardHeader>HR &amp; Admin (office staff)</CardHeader>
                <CardDescription>
                  Owner and HR accounts tied to this job (e.g. office or yard). Same assignment as labourers; use this list so admin staff appear separately from field crews.
                </CardDescription>
                <ul className="mt-4 space-y-3">
                  {jobAdminAssignments.length === 0 ? (
                    <li className="text-sm text-neutral-500 dark:text-neutral-400">No HR/Admin staff assigned to this job.</li>
                  ) : (
                    jobAdminAssignments.map((l: any) => {
                      const checkInRecord = (job.checkInsToday ?? []).find((c: any) => c.userId === l.userId && c.date === TODAY)
                      const r = roleForUserId(l.userId)
                      return (
                        <li key={l.userId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link to={`/employees/${l.userId}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">{l.userName ?? l.userId}</Link>
                              {r ? (
                                <Badge variant="default">{r === 'owner' ? 'Owner' : 'HR'}</Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              Assigned {new Date(l.assignedAt).toLocaleDateString()}
                              {checkInRecord && ` · In: ${formatCheckInTime(checkInRecord.checkedInAt)}`}
                              {checkInRecord?.checkedOutAt && ` · Out: ${formatCheckInTime(checkInRecord.checkedOutAt)}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {canCheckIn && (
                              <>
                                {!checkInRecord ? (
                                  <Button size="sm" onClick={() => handleCheckIn(l.userId)} disabled={!!actionLoading}>Check in</Button>
                                ) : (
                                  <Button size="sm" variant="secondary" onClick={() => handleResetCheckIn(l.userId)} disabled={!!actionLoading}>Reset check-in</Button>
                                )}
                              </>
                            )}
                            {canAssignLabourers && (
                              <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300" onClick={() => removeLabourerFromJob(l.userId)} disabled={!!actionLoading}>Remove</Button>
                            )}
                          </div>
                        </li>
                      )
                    })
                  )}
                </ul>
                {isOwnerOrHr && adminStaffNotOnJob.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Assign HR / Admin</p>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <button type="button" className="text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setSelectedAdminStaffIds(adminStaffNotOnJob.map((u) => u.id))}>Select all</button>
                      <span className="text-neutral-400">|</span>
                      <button type="button" className="text-xs text-neutral-600 dark:text-neutral-400 hover:underline" onClick={() => setSelectedAdminStaffIds([])}>Deselect all</button>
                      {selectedAdminStaffIds.length > 0 && (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">({selectedAdminStaffIds.length} selected)</span>
                      )}
                    </div>
                    <ul className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-2 space-y-1 mb-3">
                      {adminStaffNotOnJob.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                          <input
                            type="checkbox"
                            id={`admin-job-${u.id}`}
                            checked={selectedAdminStaffIds.includes(u.id)}
                            onChange={(e) => setSelectedAdminStaffIds((prev) => (e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)))}
                            className="rounded border-neutral-300 dark:border-neutral-600 text-brand-600"
                          />
                          <label htmlFor={`admin-job-${u.id}`} className="text-sm cursor-pointer flex-1">
                            {u.name}{' '}
                            <span className="text-neutral-500">({u.role === 'owner' ? 'Owner' : 'HR'})</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <Button size="sm" variant="outline" onClick={() => assignAdminStaffBulk(selectedAdminStaffIds)} disabled={!!actionLoading || selectedAdminStaffIds.length === 0}>
                      Add selected ({selectedAdminStaffIds.length})
                    </Button>
                  </div>
                )}
              </Card>

              {isOwnerOrHr && (
                <Card padding="lg">
                  <CardHeader>Supervisors</CardHeader>
                  <CardDescription>Assign one or more supervisors to this job/site. They can manage labourers and daily check-ins.</CardDescription>
                  <ul className="mt-4 space-y-3">
                    {assignedSupervisorIds.length === 0 ? (
                      <li className="text-sm text-neutral-500 dark:text-neutral-400">No supervisors assigned.</li>
                    ) : (
                      assignedSupervisorIds.map((userId) => {
                        const sup = supervisors.find((s) => s.id === userId)
                        return (
                          <li key={userId} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                            <Link to={`/employees/${userId}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">{sup?.name ?? userId}</Link>
                            <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => removeSupervisorFromJob(userId)} disabled={!!actionLoading}>Remove</Button>
                          </li>
                        )
                      })
                    )}
                  </ul>
                  {supervisorsNotOnJob.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Assign supervisors</p>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <button type="button" className="text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setSelectedSupervisorIds(supervisorsNotOnJob.map((s) => s.id))}>Select all</button>
                        <span className="text-neutral-400">|</span>
                        <button type="button" className="text-xs text-neutral-600 dark:text-neutral-400 hover:underline" onClick={() => setSelectedSupervisorIds([])}>Deselect all</button>
                        {selectedSupervisorIds.length > 0 && (
                          <span className="text-sm text-neutral-500 dark:text-neutral-400">({selectedSupervisorIds.length} selected)</span>
                        )}
                      </div>
                      <ul className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-2 space-y-1 mb-3">
                        {supervisorsNotOnJob.map((s) => (
                          <li key={s.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                            <input
                              type="checkbox"
                              id={`supervisor-${s.id}`}
                              checked={selectedSupervisorIds.includes(s.id)}
                              onChange={(e) => setSelectedSupervisorIds((prev) => e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id))}
                              className="rounded border-neutral-300 dark:border-neutral-600 text-brand-600"
                            />
                            <label htmlFor={`supervisor-${s.id}`} className="text-sm cursor-pointer flex-1">{s.name}</label>
                          </li>
                        ))}
                      </ul>
                      <Button size="sm" variant="outline" onClick={() => assignSupervisorsBulk(selectedSupervisorIds)} disabled={!!actionLoading || selectedSupervisorIds.length === 0}>
                        Add selected ({selectedSupervisorIds.length})
                      </Button>
                    </div>
                  )}
                </Card>
              )}

              {isOwnerOrHr && (
                <Card padding="lg">
                  <CardHeader>Subcontractors</CardHeader>
                  <CardDescription>External companies assigned to this job/site. Compliance score reflects certs and insurance.</CardDescription>
                  <ul className="mt-4 space-y-6">
                    {(job.subcontractors ?? []).length === 0 ? (
                      <li className="text-sm text-neutral-500 dark:text-neutral-400">No subcontractors assigned.</li>
                    ) : (
                      job.subcontractors.map((s: any) => {
                        // find personnel assigned to this job from this subcontractor
                        const assignedWorkerIds = personnelJobAssignments.filter((a: any) => a.jobId === job.id).map((a: any) => a.personnelId)
                        const assignedWorkers = personnel.filter((p: any) => p.subcontractorId === s.id && assignedWorkerIds.includes(p.id))
                        const rosterForSub = personnel.filter((p: any) => p.subcontractorId === s.id)
                        const subPersonnelNotOnJob = rosterForSub.filter(
                          (p: any) =>
                            !assignedWorkerIds.includes(p.id) && (p.status == null || p.status === 'active' || p.status === 'on-leave' || p.status === 'inactive')
                        )

                        return (
                          <li key={s.id} className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-3 border-b border-neutral-200 dark:border-neutral-700">
                              <div>
                                <Link to={`/subcontractors/${s.id}`} className="text-brand-600 dark:text-brand-400 hover:underline font-bold text-lg">
                                  {s.companyName}
                                </Link>
                                <div className="mt-1 flex items-center gap-2">
                                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Company Compliance:</span>
                                  {s.compliant === true ? (
                                    <Badge variant="success">100%</Badge>
                                  ) : (
                                    <Badge variant="danger">Attention Needed</Badge>
                                  )}
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => removeSubcontractorFromJob(s.id)} disabled={!!actionLoading}>Remove</Button>
                            </div>

                            <div>
                              <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-2">Assigned Personnel</h4>
                              {assignedWorkers.length === 0 ? (
                                <p className="text-sm text-neutral-500">No specific workers assigned to this job yet.</p>
                              ) : (
                                <ul className="space-y-2">
                                  {assignedWorkers.map((w: any) => {
                                    const assignment = personnelJobAssignments.find((a: any) => a.personnelId === w.id && a.jobId === job.id)
                                    return (
                                      <li key={w.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
                                        <div className="min-w-0 flex-1">
                                          <Link to={`/subcontractors/${s.id}/personnel/${w.id}`} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
                                            {w.name}
                                          </Link>
                                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                            <span className="text-neutral-500">Orientation:</span>
                                            {w.orientationCompletedAt ? (
                                              <Badge variant="success">Completed {w.orientationLocation ? `at ${w.orientationLocation}` : ''}</Badge>
                                            ) : (
                                              <Badge variant="default">Not completed</Badge>
                                            )}
                                            {isOwnerOrHr && assignment?.id && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-red-600 dark:text-red-400 h-6 text-xs px-2"
                                                onClick={() => removeSubcontractorPersonnelFromJob(s.id, w.id, assignment.id)}
                                                disabled={!!actionLoading}
                                              >
                                                Remove from job
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                              {isOwnerOrHr && (
                                <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-600">
                                  <label className="flex flex-col gap-1.5 sm:flex-row sm:items-end gap-2">
                                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Add worker to this job</span>
                                    <select
                                      className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white min-w-[220px] text-sm"
                                      value=""
                                      onChange={(e) => {
                                        const personnelId = e.target.value
                                        e.target.value = ''
                                        if (!personnelId) return
                                        void addSubcontractorPersonnelToJob(s.id, personnelId)
                                      }}
                                      disabled={!!actionLoading}
                                      aria-label="Add subcontractor worker to this job"
                                    >
                                      <option value="">Select person…</option>
                                      {subPersonnelNotOnJob.map((p: any) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name}
                                          {p.email ? ` (${p.email})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  {rosterForSub.length === 0 && (
                                    <p className="text-xs text-neutral-500 mt-2">
                                      No workers on file for this company. Add them on the{' '}
                                      <Link to={`/subcontractors/${s.id}`} className="text-brand-600 dark:text-brand-400 hover:underline">subcontractor profile</Link>.
                                    </p>
                                  )}
                                  {rosterForSub.length > 0 && subPersonnelNotOnJob.length === 0 && (
                                    <p className="text-xs text-neutral-500 mt-2">All roster workers are already assigned to this job.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </li>
                        )
                      })
                    )}
                  </ul>
                  {subcontractorsNotOnJob.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Assign subcontractors</p>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <button type="button" className="text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setSelectedSubcontractorIds(subcontractorsNotOnJob.map((sub) => sub.id))}>Select all</button>
                        <span className="text-neutral-400">|</span>
                        <button type="button" className="text-xs text-neutral-600 dark:text-neutral-400 hover:underline" onClick={() => setSelectedSubcontractorIds([])}>Deselect all</button>
                        {selectedSubcontractorIds.length > 0 && (
                          <span className="text-sm text-neutral-500 dark:text-neutral-400">({selectedSubcontractorIds.length} selected)</span>
                        )}
                      </div>
                      <ul className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-2 space-y-1 mb-3">
                        {subcontractorsNotOnJob.map((sub) => (
                          <li key={sub.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                            <input
                              type="checkbox"
                              id={`subcontractor-${sub.id}`}
                              checked={selectedSubcontractorIds.includes(sub.id)}
                              onChange={(e) => setSelectedSubcontractorIds((prev) => e.target.checked ? [...prev, sub.id] : prev.filter((id) => id !== sub.id))}
                              className="rounded border-neutral-300 dark:border-neutral-600 text-brand-600"
                            />
                            <label htmlFor={`subcontractor-${sub.id}`} className="text-sm cursor-pointer flex-1">{sub.companyName}</label>
                          </li>
                        ))}
                      </ul>
                      <Button size="sm" variant="outline" onClick={() => assignSubcontractorsBulk(selectedSubcontractorIds)} disabled={!!actionLoading || selectedSubcontractorIds.length === 0}>
                        Add selected ({selectedSubcontractorIds.length})
                      </Button>
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'details' && (
        <div className="space-y-6 animate-fade-in">
          <Card padding="lg">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardHeader>Core Details</CardHeader>
                <CardDescription>Edit site name and, when available, address and emergency info.</CardDescription>
              </div>
              {isOwnerOrHr && !editingSite && (
                <Button variant="secondary" onClick={() => { setEditSiteForm({ name: site.name || '', address: site.address || '', meetingPoint: site.meetingPoint || '', nearestHospital: site.nearestHospital || '', firstAiderName: site.firstAiderName || '', firstAiderPhone: site.firstAiderPhone || '', emergencyContact: site.emergencyContact || '' }); setEditingSite(true) }}>Edit core details</Button>
              )}
            </div>
            <div className="mt-6 space-y-4 text-sm">
              {editingSite ? (
                <div className="space-y-4 max-w-xl">
                  <Input label="Site name" value={editSiteForm.name} onChange={(e) => setEditSiteForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. North Site" />
                  <Input label="Address" value={editSiteForm.address} onChange={(e) => setEditSiteForm((f) => ({ ...f, address: e.target.value }))} placeholder="Full site address" />
                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
                    <p className="text-xs font-semibold text-neutral-500 uppercase mb-2">Emergency info (optional)</p>
                    <div className="space-y-3">
                      <Input label="Meeting point" value={editSiteForm.meetingPoint} onChange={(e) => setEditSiteForm((f) => ({ ...f, meetingPoint: e.target.value }))} placeholder="Muster / meeting point" />
                      <Input label="Nearest hospital" value={editSiteForm.nearestHospital} onChange={(e) => setEditSiteForm((f) => ({ ...f, nearestHospital: e.target.value }))} placeholder="Hospital name and address" />
                      <Input label="First aider name" value={editSiteForm.firstAiderName} onChange={(e) => setEditSiteForm((f) => ({ ...f, firstAiderName: e.target.value }))} placeholder="Name" />
                      <Input label="First aider phone" value={editSiteForm.firstAiderPhone} onChange={(e) => setEditSiteForm((f) => ({ ...f, firstAiderPhone: e.target.value }))} placeholder="Phone" />
                      <Input label="Emergency contact" value={editSiteForm.emergencyContact} onChange={(e) => setEditSiteForm((f) => ({ ...f, emergencyContact: e.target.value }))} placeholder="Contact name / number" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={savingSite || !editSiteForm.name.trim()}
                      onClick={async () => {
                        if (!id || !editSiteForm.name.trim()) return
                        setSavingSite(true)
                        setError(null)
                        try {
                          await updateSite(id, { name: editSiteForm.name.trim(), address: editSiteForm.address.trim() || undefined, meetingPoint: editSiteForm.meetingPoint.trim() || undefined, nearestHospital: editSiteForm.nearestHospital.trim() || undefined, firstAiderName: editSiteForm.firstAiderName.trim() || undefined, firstAiderPhone: editSiteForm.firstAiderPhone.trim() || undefined, emergencyContact: editSiteForm.emergencyContact.trim() || undefined })
                          setSite((prev: any) => prev ? { ...prev, ...editSiteForm, name: editSiteForm.name.trim() } : null)
                          setEditingSite(false)
                        } catch (err: any) {
                          setError(err?.response?.data?.message ?? err?.message ?? 'Failed to update site')
                        } finally {
                          setSavingSite(false)
                        }
                      }}
                    >
                      {savingSite ? 'Saving…' : 'Save'}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingSite(false)} disabled={savingSite}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <span className="block font-medium text-neutral-700 dark:text-neutral-300">Site name</span>
                    <span className="text-neutral-900 dark:text-white">{site.name}</span>
                  </div>
                  {(site.address || site.meetingPoint || site.nearestHospital || site.firstAiderName || site.emergencyContact) && (
                    <>
                      {site.address && (
                        <div>
                          <span className="block font-medium text-neutral-700 dark:text-neutral-300">Address</span>
                          <span className="text-neutral-900 dark:text-white">{site.address}</span>
                        </div>
                      )}
                      {site.meetingPoint && (
                        <div>
                          <span className="block font-medium text-neutral-700 dark:text-neutral-300">Meeting point</span>
                          <span className="text-neutral-900 dark:text-white">{site.meetingPoint}</span>
                        </div>
                      )}
                      {site.nearestHospital && (
                        <div>
                          <span className="block font-medium text-neutral-700 dark:text-neutral-300">Nearest hospital</span>
                          <span className="text-neutral-900 dark:text-white">{site.nearestHospital}</span>
                        </div>
                      )}
                      {site.firstAiderName && (
                        <div>
                          <span className="block font-medium text-neutral-700 dark:text-neutral-300">First aider</span>
                          <span className="text-neutral-900 dark:text-white">{site.firstAiderName}{site.firstAiderPhone ? ` · ${site.firstAiderPhone}` : ''}</span>
                        </div>
                      )}
                      {site.emergencyContact && (
                        <div>
                          <span className="block font-medium text-neutral-700 dark:text-neutral-300">Emergency contact</span>
                          <span className="text-neutral-900 dark:text-white">{site.emergencyContact}</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
