import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  fetchJobDetail,
  addLabourer,
  removeLabourer,
  addSubcontractor,
  removeSubcontractor,
  checkIn,
  resetCheckIn,
  fetchUsers,
  fetchUsersForAssignment,
  fetchSubcontractors,
} from '@/api/jobs'

const TODAY = new Date().toISOString().slice(0, 10)

function formatCheckInTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

export function JobDetail() {
  const { id } = useParams()
  const { user } = useUser()
  const [job, setJob] = useState<any>(null)
  const [users, setUsers] = useState<{ id: string; name: string; role: string; employmentStatus?: string }[]>([])
  const [subcontractors, setSubcontractors] = useState<{ id: string; companyName: string; primaryContactName: string; status: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadJob = useCallback(() => {
    if (!id) return
    fetchJobDetail(id)
      .then(setJob)
      .catch((err) => setError(err.response?.data?.error || 'Failed to load job'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    loadJob()
  }, [id, loadJob])

  useEffect(() => {
    if (user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor') {
      // Owner/HR: use admin list so we get employmentStatus and can exclude people on leave from assignment
      if (user?.role === 'owner' || user?.role === 'hr') {
        fetchUsersForAssignment().then(setUsers).catch(() => fetchUsers().then(setUsers))
      } else {
        fetchUsers().then(setUsers).catch(() => {})
      }
      if (user?.role === 'owner' || user?.role === 'hr') {
        fetchSubcontractors().then(setSubcontractors).catch(() => {})
      }
    }
  }, [user?.role])

  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  const isSupervisor = user?.role === 'supervisor' && job?.assignedSupervisorIds?.includes(user?.id ?? '')
  const canCheckIn = isOwnerOrHr || isSupervisor

  const labourerIds = (job?.labourers ?? []).map((l: any) => l.userId)
  // Do not offer people on leave or terminated for assignment
  const assignableLabourers = users.filter(
    (u) =>
      u.role === 'labourer' &&
      u.employmentStatus !== 'on-leave' &&
      u.employmentStatus !== 'terminated'
  )
  const labourersNotOnJob = assignableLabourers.filter((u) => !labourerIds.includes(u.id))

  const assignLabourer = async (userId: string) => {
    if (!id) return
    setActionLoading('assign-' + userId)
    try {
      await addLabourer(id, userId)
      loadJob()
    } catch (err) {
      setError((err as any)?.response?.data?.error || 'Failed to assign')
    } finally {
      setActionLoading(null)
    }
  }

  const removeLabourerFromJob = async (userId: string) => {
    if (!id) return
    setActionLoading('remove-' + userId)
    try {
      await removeLabourer(id, userId)
      loadJob()
    } catch (err) {
      setError((err as any)?.response?.data?.error || 'Failed to remove')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCheckIn = async (userId: string) => {
    if (!id) return
    setActionLoading('checkin-' + userId)
    try {
      await checkIn(id, userId, TODAY)
      loadJob()
    } catch (err) {
      setError((err as any)?.response?.data?.error || 'Failed to check in')
    } finally {
      setActionLoading(null)
    }
  }

  const handleResetCheckIn = async (userId: string) => {
    if (!id) return
    setActionLoading('reset-' + userId)
    try {
      await resetCheckIn(id, userId, TODAY)
      loadJob()
    } catch (err) {
      setError((err as any)?.response?.data?.error || 'Failed to reset')
    } finally {
      setActionLoading(null)
    }
  }

  const getCheckIn = (userId: string) =>
    (job?.checkInsToday ?? []).find((c: any) => c.userId === userId)

  if (loading && !job) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    )
  }

  if (!job && !loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Job not found.</p>
        <Link to="/jobs" className="text-brand-600 dark:text-brand-400 hover:underline">Back to jobs</Link>
      </div>
    )
  }

  const canAssignLabourers = isOwnerOrHr || isSupervisor
  const emergencyInfo: any = undefined

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link to={isSupervisor ? '/my-jobs' : '/jobs'} className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">{job.title}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">
            {job.siteName} · {job.status}
            {job.siteId && (
              <>
                {' · '}
                <Link to={`/safety/sites/${job.siteId}`} className="text-brand-600 dark:text-brand-400 hover:underline">
                  Manage site
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {job.siteId && (
        <Card padding="lg">
          <CardHeader>Job Site Documentation</CardHeader>
          <CardDescription>Site-specific documentation and compliance. Manage site opens the site page with full details.</CardDescription>
          <Link to={`/safety/sites/${job.siteId}`}>
            <Button variant="secondary" size="sm">Open Site Page</Button>
          </Link>
        </Card>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <Card padding="lg">
        <CardHeader>Assigned Labourers</CardHeader>
        <CardDescription>Labourers on this job; supervisor shown beside each. {canAssignLabourers ? 'Assign more below.' : ''}</CardDescription>
        <ul className="mt-4 space-y-2">
          {(job.labourers ?? []).length === 0 ? (
            <li className="text-sm text-neutral-500">No labourers assigned yet.</li>
          ) : (
            job.labourers.map((a: any) => {
              const checkInRecord = getCheckIn(a.userId)
              const inTime = formatCheckInTime(checkInRecord?.checkedInAt)
              const outTime = formatCheckInTime(checkInRecord?.checkedOutAt)
              const supervisorId = (job.assignedSupervisorIds ?? [])[0]
              const supervisorName = supervisorId ? users.find((u) => u.id === supervisorId)?.name : null
              return (
                <li key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                  <div className="min-w-0">
                    <span className="font-medium text-neutral-900 dark:text-white">{a.userName ?? a.userId}</span>
                    {supervisorName && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">Supervisor: {supervisorName}</p>
                    )}
                    {(inTime || outTime) && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {inTime && <>In at {inTime}</>}
                        {inTime && outTime && ' · '}
                        {outTime && <>Out at {outTime}</>}
                      </p>
                    )}
                  </div>
                  {canCheckIn && (
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Button
                        size="sm"
                        variant={checkInRecord?.checkedInAt ? 'secondary' : 'primary'}
                        onClick={() => handleCheckIn(a.userId)}
                        disabled={!!(checkInRecord?.checkedInAt && checkInRecord?.checkedOutAt) || actionLoading !== null}
                      >
                        {!checkInRecord?.checkedInAt ? 'Check in' : checkInRecord.checkedOutAt ? 'Checked out' : 'Check out'}
                      </Button>
                      {checkInRecord && (
                        <button
                          type="button"
                          onClick={() => handleResetCheckIn(a.userId)}
                          className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 underline"
                          aria-label="Reset check-in for today"
                        >
                          Reset
                        </button>
                      )}
                      {canAssignLabourers && (
                        <Button size="sm" variant="ghost" onClick={() => removeLabourerFromJob(a.userId)} disabled={!!actionLoading}>
                          Remove
                        </Button>
                      )}
                    </div>
                  )}
                  {!canCheckIn && checkInRecord && (
                    <Badge variant={checkInRecord.checkedInAt ? 'success' : 'default'}>
                      {checkInRecord.checkedOutAt ? 'Out' : 'In'}
                    </Badge>
                  )}
                </li>
              )
            })
          )}
        </ul>
        {canAssignLabourers && labourersNotOnJob.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Add labourer</p>
            <div className="flex flex-wrap gap-2">
              {labourersNotOnJob.map((u) => (
                <Button
                  key={u.id}
                  size="sm"
                  variant="outline"
                  onClick={() => assignLabourer(u.id)}
                  disabled={!!actionLoading}
                >
                  + {u.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {isOwnerOrHr && (job.subcontractors ?? []).length > 0 && (
        <Card padding="lg">
          <CardHeader>Subcontractors on This Job</CardHeader>
          <CardDescription>External companies assigned to this job/site. Compliance score reflects certs and insurance.</CardDescription>
          <ul className="mt-4 space-y-3">
            {job.subcontractors.map((s: any) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                <div>
                  <Link to={`/subcontractors/${s.id}`} className="text-brand-600 dark:text-brand-400 hover:underline font-medium">
                    {s.companyName}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Compliance Score</span>
                    {s.compliant === true ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-sm font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                        Compliant
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">
                        <span aria-hidden>✕</span> Non-compliant
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {emergencyInfo && (
        <Card padding="lg" className="border-l-4 border-red-500/50">
          <CardHeader>Emergency info — {emergencyInfo.siteName}</CardHeader>
          <CardDescription>First aider, meeting point, nearest hospital</CardDescription>
          <ul className="mt-4 space-y-2 text-sm">
            {emergencyInfo.firstAiderName && <li><span className="text-neutral-500">First aider:</span> {emergencyInfo.firstAiderName}{emergencyInfo.firstAiderPhone ? ` · ${emergencyInfo.firstAiderPhone}` : ''}</li>}
            {emergencyInfo.emergencyContact && <li><span className="text-neutral-500">Emergency contact:</span> {emergencyInfo.emergencyContact}</li>}
            {emergencyInfo.meetingPoint && <li><span className="text-neutral-500">Meeting point:</span> {emergencyInfo.meetingPoint}</li>}
            {emergencyInfo.nearestHospital && <li><span className="text-neutral-500">Nearest hospital:</span> {emergencyInfo.nearestHospital}</li>}
          </ul>
        </Card>
      )}

      {canCheckIn && (
        <Card padding="lg">
          <CardHeader>Today&apos;s check-in</CardHeader>
          <CardDescription>Mark who is on site today ({TODAY})</CardDescription>
          <p className="mt-2 text-sm text-neutral-500">Use the Check in / Check out buttons above for each assigned labourer.</p>
        </Card>
      )}
    </div>
  )
}
