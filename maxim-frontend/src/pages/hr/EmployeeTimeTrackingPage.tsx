import { useCallback, useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useUser } from '@/contexts/UserContext'
import {
  bulkStartSessionsAtSite,
  endWorkSession,
  fetchActiveWorkSession,
  fetchSiteWorkRoster,
  listWorkSessions,
  startWorkSession,
  type EmployeeWorkSessionRow,
  type SiteWorkRosterPerson,
} from '@/api/employeeTimeTracking'
import { fetchJobs, fetchMyJobs, fetchSites, fetchUsersForAssignment, fetchSubcontractors } from '@/api/jobs'
import { fetchTimeOffTeamLabourers } from '@/api/timeOff'
import { listSubcontractorPersonnel } from '@/api/subcontractors'

/**
 * Native <select>: closed row uses translucent dark styling; popup on Windows/Chromium often
 * renders a light list while still inheriting light text → white-on-white. Prefer light UA chrome
 * for the control and pin option colors ([&>option]), which many engines respect in the list.
 */
const CLOCK_CARD_SELECT_CLASS =
  'w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-neutral-100 [color-scheme:light] shadow-inner shadow-black/25 [&>option]:bg-white [&>option]:text-neutral-900'

function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfWeekMonday(now: Date): Date {
  const x = new Date(now)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function formatRunning(startedIso: string): string {
  const s = new Date(startedIso).getTime()
  const diff = Math.max(0, Math.floor((Date.now() - s) / 1000))
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const sec = diff % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function EmployeeTimeTrackingPage() {
  const { user } = useUser()
  const [searchParams] = useSearchParams()
  const qpUserId = searchParams.get('userId')

  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  const hasHrLevelEmployeeTimeAccess =
    user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'

  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const weekStart = useMemo(() => startOfWeekMonday(weekAnchor), [weekAnchor])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const fromStr = useMemo(() => toLocalISODate(weekStart), [weekStart])
  const toStr = useMemo(() => toLocalISODate(weekEnd), [weekEnd])

  const [filterUserId, setFilterUserId] = useState(() => qpUserId || user?.id || '')
  const [employeeOptions, setEmployeeOptions] = useState<Array<{ id: string; name: string }>>([])

  const [jobs, setJobs] = useState<Array<{ id: string; title: string; siteId: string; siteName?: string }>>([])
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([])
  const [subs, setSubs] = useState<Array<{ id: string; companyName: string }>>([])
  const [personnel, setPersonnel] = useState<Array<{ id: string; name: string }>>([])
  const [personnelLoading, setPersonnelLoading] = useState(false)

  const [jobId, setJobId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [subcontractorId, setSubcontractorId] = useState('')
  const [personnelId, setPersonnelId] = useState('')
  const [startNote, setStartNote] = useState('')

  const [myActive, setMyActive] = useState<EmployeeWorkSessionRow | null>(null)
  const [sessions, setSessions] = useState<EmployeeWorkSessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const showLocationTab = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'
  const [mainTab, setMainTab] = useState<'time' | 'location'>('time')
  const [locSiteId, setLocSiteId] = useState('')
  const [locJobId, setLocJobId] = useState('')
  const [roster, setRoster] = useState<SiteWorkRosterPerson[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set())
  const [bulkNote, setBulkNote] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkSummary, setBulkSummary] = useState<string | null>(null)

  const viewerUserId = user?.id ?? ''
  const listUserId = hasHrLevelEmployeeTimeAccess && filterUserId ? filterUserId : viewerUserId

  useEffect(() => {
    let t: ReturnType<typeof setInterval>
    if (myActive) t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [myActive])

  useEffect(() => {
    if (qpUserId) setFilterUserId(qpUserId)
  }, [qpUserId])

  const loadRefs = useCallback(async () => {
    try {
      const [sitesData, subsData] = await Promise.all([
        fetchSites(true).catch(() => []),
        hasHrLevelEmployeeTimeAccess ? fetchSubcontractors().catch(() => []) : Promise.resolve([]),
      ])
      setSites((sitesData as { id: string; name: string }[]) || [])
      setSubs(Array.isArray(subsData) ? subsData.map((s) => ({ id: s.id, companyName: s.companyName })) : [])

      if (user?.role === 'supervisor') {
        const [my, full] = await Promise.all([
          fetchMyJobs().catch(() => []),
          fetchJobs({ status: 'active' }).catch(() => []),
        ])
        const byId = new Map((full || []).map((j) => [j.id, j]))
        setJobs(
          (my || []).map((j) => ({
            id: j.id,
            title: j.title,
            siteId: byId.get(j.id)?.siteId ?? '',
            siteName: j.siteName,
          }))
        )
      } else {
        const full = await fetchJobs({ status: 'active' }).catch(() => [])
        setJobs((full || []).map((j) => ({ id: j.id, title: j.title, siteId: j.siteId, siteName: j.siteName })))
      }

      if (user?.role === 'owner' || user?.role === 'hr') {
        const em = await fetchUsersForAssignment().catch(() => [])
        setEmployeeOptions(
          em
            .filter((e: { employmentStatus?: string }) => e.employmentStatus !== 'terminated')
            .map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }))
            .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
        )
      } else if (user?.role === 'supervisor') {
        const team = await fetchTimeOffTeamLabourers().catch(() => [])
        setEmployeeOptions(team.map((e) => ({ id: e.id, name: e.name })))
      }
    } catch {
      setSites([])
      setSubs([])
      setJobs([])
    }
  }, [user?.role, hasHrLevelEmployeeTimeAccess])

  const refreshSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listWorkSessions({ userId: listUserId || undefined, from: fromStr, to: toStr })
      setSessions(list)
      if (!viewerUserId) {
        setMyActive(null)
      } else if (hasHrLevelEmployeeTimeAccess) {
        const open = await fetchActiveWorkSession({ userId: listUserId })
        setMyActive(open)
      } else if (listUserId === viewerUserId) {
        const open = await fetchActiveWorkSession()
        setMyActive(open)
      } else {
        setMyActive(null)
      }
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const d = err.response?.data as { error?: string } | undefined
        setError(d?.error || err.message || 'Could not load time data.')
      } else {
        setError(err instanceof Error ? err.message : 'Could not load time data.')
      }
    } finally {
      setLoading(false)
    }
  }, [viewerUserId, listUserId, fromStr, toStr, hasHrLevelEmployeeTimeAccess])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    if (!subcontractorId) {
      setPersonnel([])
      setPersonnelId('')
      setPersonnelLoading(false)
      return
    }
    if (!hasHrLevelEmployeeTimeAccess) return
    setPersonnelLoading(true)
    void listSubcontractorPersonnel(subcontractorId)
      .then((list: { id: string; name?: string }[]) =>
        setPersonnel(Array.isArray(list) ? list.map((p) => ({ id: p.id, name: p.name || 'Personnel' })) : [])
      )
      .catch(() => setPersonnel([]))
      .finally(() => setPersonnelLoading(false))
  }, [subcontractorId, hasHrLevelEmployeeTimeAccess])

  useEffect(() => {
    if (!jobId) return
    const j = jobs.find((x) => x.id === jobId)
    if (j?.siteId && !siteId) setSiteId(j.siteId)
  }, [jobId, jobs, siteId])

  const hoursByDay = useMemo(() => {
    const map: Record<string, number> = {}
    for (let i = 0; i < 7; i += 1) {
      map[toLocalISODate(addDays(weekStart, i))] = 0
    }
    for (const s of sessions) {
      if (!s.endedAt || s.durationSeconds == null) continue
      const day = toLocalISODate(new Date(s.startedAt))
      map[day] = (map[day] || 0) + s.durationSeconds
    }
    return map
  }, [sessions, weekStart])

  const jobsAtSite = useMemo(
    () => (locSiteId ? jobs.filter((j) => j.siteId === locSiteId) : []),
    [jobs, locSiteId],
  )

  const bulkEligibleIds = useMemo(
    () => roster.filter((p) => !p.activeSession).map((p) => p.userId),
    [roster],
  )

  useEffect(() => {
    if (sites.length === 0 || locSiteId) return
    setLocSiteId(sites[0].id)
  }, [sites, locSiteId])

  useEffect(() => {
    if (!locSiteId || !locJobId) return
    const ok = jobs.some((j) => j.id === locJobId && j.siteId === locSiteId)
    if (!ok) setLocJobId('')
  }, [locSiteId, locJobId, jobs])

  useEffect(() => {
    if (mainTab !== 'location' || !locSiteId) return
    setRosterLoading(true)
    setRosterError(null)
    void fetchSiteWorkRoster(locSiteId)
      .then((r) => {
        setRoster(r.people ?? [])
        setBulkSelected(new Set())
        setBulkSummary(null)
      })
      .catch((err: unknown) => {
        if (isAxiosError(err)) {
          const d = err.response?.data as { error?: string } | undefined
          setRosterError(d?.error || err.message || 'Could not load roster.')
        } else {
          setRosterError(err instanceof Error ? err.message : 'Could not load roster.')
        }
        setRoster([])
      })
      .finally(() => setRosterLoading(false))
  }, [mainTab, locSiteId])

  const attachGeo =
    (): Promise<{ latitude: number | null; longitude: number | null; accuracyM: number | null }> =>
      new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve({ latitude: null, longitude: null, accuracyM: null })
          return
        }
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracyM: pos.coords.accuracy ?? null,
            }),
          () => resolve({ latitude: null, longitude: null, accuracyM: null }),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
        )
      })

  const onClockIn = async () => {
    setBusy(true)
    setError(null)
    try {
      const geo = await attachGeo()
      await startWorkSession({
        ...(hasHrLevelEmployeeTimeAccess ? { forUserId: listUserId } : {}),
        jobId: jobId || null,
        siteId: siteId || null,
        subcontractorId: hasHrLevelEmployeeTimeAccess && subcontractorId ? subcontractorId : null,
        subcontractorPersonnelId: hasHrLevelEmployeeTimeAccess && personnelId ? personnelId : null,
        startNote: startNote.trim() || null,
        startLatitude: geo.latitude,
        startLongitude: geo.longitude,
        startAccuracyM: geo.accuracyM,
      })
      await refreshSessions()
      setStartNote('')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Could not start session.')
    } finally {
      setBusy(false)
    }
  }

  const onClockOut = async () => {
    if (!myActive?.id) return
    setBusy(true)
    setError(null)
    try {
      const geo = await attachGeo()
      await endWorkSession(myActive.id, {
        endLatitude: geo.latitude,
        endLongitude: geo.longitude,
        endAccuracyM: geo.accuracyM,
      })
      await refreshSessions()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Could not end session.')
    } finally {
      setBusy(false)
    }
  }

  const toggleBulkRow = useCallback((id: string, canSelect: boolean) => {
    if (!canSelect) return
    setBulkSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleBulkSelectAll = useCallback(() => {
    const allOn = bulkEligibleIds.length > 0 && bulkEligibleIds.every((id) => bulkSelected.has(id))
    if (allOn) setBulkSelected(new Set())
    else setBulkSelected(new Set(bulkEligibleIds))
  }, [bulkEligibleIds, bulkSelected])

  const onBulkClockIn = async () => {
    if (!locSiteId || bulkSelected.size === 0) return
    setBulkBusy(true)
    setBulkSummary(null)
    setRosterError(null)
    try {
      const geo = await attachGeo()
      const { results } = await bulkStartSessionsAtSite({
        siteId: locSiteId,
        userIds: [...bulkSelected],
        jobId: locJobId || null,
        startNote: bulkNote.trim() || null,
        startLatitude: geo.latitude,
        startLongitude: geo.longitude,
        startAccuracyM: geo.accuracyM,
      })
      const okCount = results.filter((r) => r.ok).length
      const failCount = results.length - okCount
      const failures = results
        .filter((r) => !r.ok)
        .map((r) => `${roster.find((p) => p.userId === r.userId)?.name ?? 'Employee'} — ${r.error ?? 'failed'}`)
      setBulkSummary(
        `${okCount} signed on${failCount ? ` · ${failCount} skipped` : ''}${
          failures.length ? `\n${failures.join('\n')}` : ''
        }`,
      )
      const refreshed = await fetchSiteWorkRoster(locSiteId)
      setRoster(refreshed.people ?? [])
      setBulkSelected(new Set())
    } catch (e: unknown) {
      if (isAxiosError(e)) {
        const d = e.response?.data as { error?: string } | undefined
        setRosterError(d?.error || e.message || 'Bulk clock-in failed.')
      } else {
        setRosterError(e instanceof Error ? e.message : 'Bulk clock-in failed.')
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const viewingSelf = listUserId === viewerUserId
  const canPunch = hasHrLevelEmployeeTimeAccess

  const managedDisplayName =
    hasHrLevelEmployeeTimeAccess && !viewingSelf ? employeeOptions.find((e) => e.id === listUserId)?.name ?? 'Employee' : null

  const personnelSelectLocked =
    hasHrLevelEmployeeTimeAccess && (!subcontractorId || personnelLoading || personnel.length === 0)
  const personnelEmptyOptionLabel =
    subcontractorId && personnelLoading
      ? 'Loading workers…'
      : !subcontractorId
        ? 'Pick subcontractor company first…'
        : '(no workers — add under Subcontractors)'

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 pb-24 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-neutral-900 dark:text-white">Employee Time</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1 max-w-2xl">
            Clock in and out tied to{' '}
            <Link className="text-brand-600 dark:text-brand-400 hover:underline" to="/sites">jobs &amp; sites</Link>
            {' '}· Optional{' '}
            <Link className="text-brand-600 dark:text-brand-400 hover:underline" to="/subcontractors">subcontractor</Link>
            {' '}context · Blocks overlap with{' '}
            <Link className="text-brand-600 dark:text-brand-400 hover:underline" to="/hr/time-off">time off</Link>.
          </p>
          {showLocationTab ? (
            <div
              className="mt-4 inline-flex gap-1 p-1 rounded-2xl bg-neutral-100 dark:bg-neutral-800/90 border border-neutral-200/80 dark:border-neutral-700"
              role="tablist"
              aria-label="Employee Time views"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'time'}
                onClick={() => setMainTab('time')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  mainTab === 'time'
                    ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Personal time
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'location'}
                onClick={() => setMainTab('location')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  mainTab === 'location'
                    ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                By location
              </button>
            </div>
          ) : null}
        </div>
        {mainTab === 'time' ? (
          <div className="flex gap-2 flex-wrap shrink-0">
            <Button variant="outline" size="sm" onClick={() => setWeekAnchor(addDays(weekStart, -7))}>
              ← Prev week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekAnchor(new Date())}>
              This week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekAnchor(addDays(weekStart, 7))}>
              Next week →
            </Button>
          </div>
        ) : null}
      </div>

      {mainTab === 'time' ? (
        <>
      {hasHrLevelEmployeeTimeAccess && employeeOptions.length > 0 ? (
        <Card padding="md" className="border-neutral-200 dark:border-neutral-700">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Employee ({user?.role === 'supervisor' ? 'your team · Supervisors' : 'Owners / HR'})
          </label>
          <select
            className="w-full max-w-md rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
          >
            {employeeOptions.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-neutral-500">
            {user?.role === 'supervisor' ? (
              <>Choose someone you supervise (same roster as{' '}
                <Link className="text-brand-600 dark:text-brand-400 hover:underline" to="/hr/time-off">Time Off</Link>
                ). You can clock them in or out and attach subcontractor details, same as Owners and HR.
              </>
            ) : (
              <>
                Open{' '}
                <Link className="text-brand-600 dark:text-brand-400 hover:underline" to="/employees">Employees</Link>
                {' '}to edit profiles. Choose an employee here to review their sessions and clock them in or out.
              </>
            )}
          </p>
        </Card>
      ) : null}

      {/* Week overview strip */}
      <div className="grid grid-cols-7 gap-2 sm:gap-3">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i)
          const key = toLocalISODate(d)
          const sec = hoursByDay[key] ?? 0
          const isToday = key === toLocalISODate(new Date())
          return (
            <div
              key={key}
              className={`rounded-2xl border p-3 text-center transition-colors ${isToday
                ? 'border-brand-400 bg-brand-50/80 dark:bg-brand-950/30'
                : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-900/40'
                }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{d.toLocaleDateString(undefined, { weekday: 'short' })}</p>
              <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-white mt-1">
                {(sec / 3600).toFixed(1)}h
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">{key.slice(5)}</p>
            </div>
          )
        })}
      </div>

      {/* Hero clock card */}
      {canPunch ? (
        <Card
          padding="lg"
          className="relative overflow-hidden border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 text-white shadow-xl"
        >
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.7),transparent_45%)]" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div>
              <p className="text-sm font-medium text-neutral-400">Now</p>
              {managedDisplayName ? (
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-300 mt-2 mb-0.5">
                  Managing · {managedDisplayName}
                </p>
              ) : null}
              {myActive ? (
                <>
                  <p className="text-sm text-neutral-300 mt-1">
                    {managedDisplayName ? `${managedDisplayName} is clocked in` : 'Clocked in'} · started{' '}
                    {new Date(myActive.startedAt).toLocaleString()}
                  </p>
                  <p className="mt-4 text-5xl sm:text-6xl font-mono tabular-nums tracking-tight">
                    {formatRunning(myActive.startedAt)}
                  </p>
                  <p className="mt-3 text-xs text-neutral-400 max-w-sm">
                    {myActive.jobTitle && <span className="text-neutral-200">{myActive.jobTitle}</span>}
                    {myActive.siteName && <span>{myActive.jobTitle ? ' · ' : ''}{myActive.siteName}</span>}
                    {myActive.subcontractorCompanyName && (
                      <span className="block mt-1">Sub: {myActive.subcontractorCompanyName}</span>
                    )}
                  </p>
                  {myActive.clockInByDisplayName ? (
                    <p className="mt-3 text-[11px] text-neutral-400 max-w-md">
                      <span className="inline-flex items-center rounded-lg border border-white/20 bg-white/[0.07] px-2.5 py-1.5">
                        Clock-in recorded by{' '}
                        <span className="font-medium text-neutral-200 ml-1">{myActive.clockInByDisplayName}</span>
                        {myActive.clockInByUserId === myActive.userId ? (
                          <span className="text-neutral-500 ml-1">· self punch</span>
                        ) : (
                          <span className="text-amber-300/90 ml-1">· delegated</span>
                        )}
                      </span>
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold mt-2 text-neutral-200">
                    {managedDisplayName ? `${managedDisplayName} is clocked out` : 'You are clocked out'}
                  </p>
                  <p className="text-sm text-neutral-400 mt-1">
                    {managedDisplayName
                      ? 'Choose job / site below (optional note), then start their shift.'
                      : 'Pick job / site below, optional note, then start.'}
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              {myActive ? (
                <Button size="lg" variant="danger" className="min-w-[160px]" disabled={busy} onClick={() => void onClockOut()}>
                  {busy ? 'Ending…' : 'Clock out'}
                </Button>
              ) : (
                <Button size="lg" className="min-w-[160px] shadow-lg shadow-brand-900/40" disabled={busy} onClick={() => void onClockIn()}>
                  {busy ? 'Starting…' : 'Clock in'}
                </Button>
              )}
            </div>
          </div>

          {!myActive ? (
            <div className="relative mt-8 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-neutral-400 mb-1 block">Job</span>
                <select
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  className={CLOCK_CARD_SELECT_CLASS}
                >
                  <option value="">(optional)</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.title}{j.siteName ? ` · ${j.siteName}` : ''}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-neutral-400 mb-1 block">Site</span>
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className={CLOCK_CARD_SELECT_CLASS}
                >
                  <option value="">(optional)</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              {hasHrLevelEmployeeTimeAccess ? (
                <>
                  <label className="block text-sm">
                    <span className="text-neutral-400 mb-1 block">Subcontractor company</span>
                    <select
                      value={subcontractorId}
                      onChange={(e) => { setSubcontractorId(e.target.value); setPersonnelId('') }}
                      className={CLOCK_CARD_SELECT_CLASS}
                    >
                      <option value="">(optional)</option>
                      {subs.map((s) => (
                        <option key={s.id} value={s.id}>{s.companyName}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-neutral-400 mb-1 block">Subcontractor worker</span>
                    <select
                      value={personnelId}
                      onChange={(e) => setPersonnelId(e.target.value)}
                      disabled={personnelSelectLocked}
                      className={`${CLOCK_CARD_SELECT_CLASS} disabled:cursor-not-allowed disabled:bg-black/50 disabled:border-white/10 disabled:text-neutral-400 disabled:opacity-100`}
                    >
                      <option value="">
                        {personnelSelectLocked ? personnelEmptyOptionLabel : '(optional)'}
                      </option>
                      {personnel.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              <label className="block text-sm sm:col-span-2">
                <span className="text-neutral-400 mb-1 block">Note</span>
                <input
                  value={startNote}
                  onChange={(e) => setStartNote(e.target.value)}
                  placeholder="Short note (optional)"
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white text-sm placeholder:text-neutral-500"
                />
              </label>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card padding="md" className="border-neutral-200 dark:border-neutral-800">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Punch controls should be available once the page loads. If you see this unexpectedly, refresh and try again. Owners, HR, and Supervisors manage people from the Employee control above or use&nbsp;
            <strong className="text-neutral-900 dark:text-neutral-100">By location</strong> for bulk sign-on.
          </p>
        </Card>
      )}

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {/* Session list */}
      <Card padding="lg" className="border-neutral-200/90 dark:border-neutral-800 shadow-sm shadow-neutral-950/5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Sessions</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 tabular-nums">
              Week of {fromStr} – {toStr}
            </p>
          </div>
          {sessions.length > 0 && !loading ? (
            <Badge variant="default">{sessions.length} record{sessions.length === 1 ? '' : 's'}</Badge>
          ) : null}
        </div>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-neutral-500">No sessions in this week&apos;s window yet.</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const hasRangeEnd = Boolean(s.endedAt)
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border border-neutral-200/90 dark:border-neutral-700 bg-neutral-50/40 dark:bg-neutral-900/35 p-4 sm:p-5 transition-colors hover:border-brand-300/60 dark:hover:border-brand-700/50"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {new Date(s.startedAt).toLocaleString()}
                        <span className="font-normal text-neutral-400 dark:text-neutral-500"> → </span>
                        {hasRangeEnd ? (
                          new Date(s.endedAt as string).toLocaleString()
                        ) : (
                          <span className="text-brand-600 dark:text-brand-400 font-medium">In progress</span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 gap-y-1 text-sm">
                        {s.jobId && s.siteId ? (
                          <Link
                            to={`/sites/${s.siteId}/projects/${s.jobId}`}
                            className="text-brand-600 dark:text-brand-400 font-medium hover:underline truncate max-w-[16rem]"
                          >
                            {s.jobTitle || 'Job'}
                          </Link>
                        ) : s.jobId ? (
                          <span className="text-neutral-800 dark:text-neutral-200 truncate max-w-[16rem]">
                            {s.jobTitle || 'Job'}
                          </span>
                        ) : null}
                        {s.siteName ? (
                          <>
                            {(s.jobId || s.siteId) ? (
                              <span className="text-neutral-300 dark:text-neutral-600 hidden sm:inline">·</span>
                            ) : null}
                            <span className="text-neutral-600 dark:text-neutral-300 truncate max-w-[14rem]">
                              {s.siteName}
                            </span>
                          </>
                        ) : null}
                      </div>
                      {s.subcontractorCompanyName ? (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Subcontractor: {s.subcontractorCompanyName}
                        </p>
                      ) : null}
                      {(s.clockInByDisplayName || (hasRangeEnd && s.clockOutByDisplayName)) ? (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {s.clockInByDisplayName ? (
                            <Badge
                              variant={
                                s.clockInByUserId && s.clockInByUserId !== s.userId ? 'info' : 'default'
                              }
                              className="text-[11px] font-normal"
                            >
                              In: {s.clockInByDisplayName}
                              {s.clockInByUserId === s.userId ? ' · self' : ''}
                            </Badge>
                          ) : null}
                          {hasRangeEnd && s.clockOutByDisplayName ? (
                            <Badge
                              variant={
                                s.clockOutByUserId && s.clockOutByUserId !== s.userId ? 'info' : 'default'
                              }
                              className="text-[11px] font-normal"
                            >
                              Out: {s.clockOutByDisplayName}
                              {s.clockOutByUserId === s.userId ? ' · self' : ''}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                      {(s.startNote || s.endNote) && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 italic">
                          {s.startNote ? `Start: ${s.startNote}` : ''}
                          {s.startNote && s.endNote ? ' · ' : ''}
                          {s.endNote ? `End: ${s.endNote}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0">
                      {hasRangeEnd ? (
                        <Badge
                          variant={(s.durationSeconds ?? 0) > 0 ? 'success' : 'default'}
                          className="tabular-nums text-xs sm:text-[13px] px-3 py-1"
                        >
                          {formatDuration(s.durationSeconds)}
                        </Badge>
                      ) : (
                        <Badge variant="info">Running</Badge>
                      )}
                      {isOwnerOrHr && listUserId ? (
                        <Link
                          to={`/employees/${listUserId}`}
                          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          Employee profile →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
        </>
      ) : (
        <Card padding="lg" className="border-neutral-200 dark:border-neutral-800 shadow-sm shadow-neutral-950/5">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Site roster · bulk sign-on</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 max-w-2xl">
                Everyone listed is on this site&apos;s roster (assigned to the site or to a job at this site).{' '}
                {user?.role === 'supervisor'
                  ? 'You only see people from jobs you supervise who are rostered here.'
                  : 'Owners / HR see the full roster.'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              <span className="block mb-1 text-xs uppercase tracking-wide text-neutral-500">Site</span>
              <select
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 [color-scheme:light] dark:[color-scheme:dark]"
                value={locSiteId}
                onChange={(e) => {
                  setLocSiteId(e.target.value)
                  setLocJobId('')
                  setBulkSelected(new Set())
                }}
              >
                {sites.map((si) => (
                  <option key={si.id} value={si.id}>
                    {si.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              <span className="block mb-1 text-xs uppercase tracking-wide text-neutral-500">Job (optional)</span>
              <select
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 [color-scheme:light] dark:[color-scheme:dark]"
                value={locJobId}
                onChange={(e) => setLocJobId(e.target.value)}
              >
                <option value="">Site only · no specific job</option>
                {jobsAtSite.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 sm:col-span-2 lg:col-span-1">
              <span className="block mb-1 text-xs uppercase tracking-wide text-neutral-500">Shared note</span>
              <input
                type="text"
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder="Short note saved on each session (optional)"
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400"
              />
            </label>
          </div>

          {rosterError ? (
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">{rosterError}</p>
          ) : null}
          {bulkSummary ? (
            <pre className="mb-4 whitespace-pre-wrap rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 bg-emerald-50/90 dark:bg-emerald-950/25 p-3 text-sm text-emerald-950 dark:text-emerald-100">
              {bulkSummary}
            </pre>
          ) : null}

          {rosterLoading ? (
            <p className="text-sm text-neutral-500">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No roster for this site. Assign labourers via site staffing or{' '}
              <Link className="text-brand-600 dark:text-brand-400 hover:underline" to="/sites">
                job management
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkEligibleIds.length === 0}
                  onClick={toggleBulkSelectAll}
                >
                  {bulkEligibleIds.length > 0 && bulkEligibleIds.every((id) => bulkSelected.has(id))
                    ? 'Clear selection'
                    : `Select available (${bulkEligibleIds.length})`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={bulkSelected.size === 0 || bulkBusy || !locSiteId}
                  onClick={() => void onBulkClockIn()}
                >
                  {bulkBusy ? 'Signing on…' : `Sign on selected (${bulkSelected.size})`}
                </Button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-700">
                <table className="min-w-[640px] w-full text-sm text-left">
                  <thead className="bg-neutral-100/80 dark:bg-neutral-900/70 text-neutral-600 dark:text-neutral-400">
                    <tr>
                      <th className="p-3 w-10 align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-brand-600"
                          aria-label="Select all available"
                          disabled={bulkEligibleIds.length === 0}
                          checked={
                            bulkEligibleIds.length > 0 &&
                            bulkEligibleIds.every((id) => bulkSelected.has(id))
                          }
                          onChange={toggleBulkSelectAll}
                        />
                      </th>
                      <th className="p-3 font-semibold">Name</th>
                      <th className="p-3 font-semibold">Role</th>
                      <th className="p-3 font-semibold hidden md:table-cell">Email</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3 font-semibold hidden sm:table-cell"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 bg-white/60 dark:bg-neutral-950/20">
                    {roster.map((p) => {
                      const blocked = Boolean(p.activeSession)
                      const checked = bulkSelected.has(p.userId)
                      return (
                        <tr key={p.userId} className="hover:bg-neutral-50/80 dark:hover:bg-neutral-900/40">
                          <td className="p-3 align-middle">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-brand-600 disabled:opacity-40"
                              disabled={blocked}
                              checked={blocked ? false : checked}
                              onChange={() => toggleBulkRow(p.userId, !blocked)}
                              aria-label={`Select ${p.name}`}
                            />
                          </td>
                          <td className="p-3 font-medium text-neutral-900 dark:text-white">{p.name}</td>
                          <td className="p-3 text-neutral-600 dark:text-neutral-300 capitalize">{p.role}</td>
                          <td className="p-3 text-neutral-500 dark:text-neutral-400 hidden md:table-cell max-w-[220px] truncate">
                            {p.email ?? '—'}
                          </td>
                          <td className="p-3">
                            {p.activeSession ? (
                              <div className="flex flex-col gap-0.5">
                                <Badge variant="warning">Clocked in</Badge>
                                <span className="text-[11px] text-neutral-500 tabular-nums">
                                  Since {new Date(p.activeSession.startedAt).toLocaleTimeString(undefined, {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                  {p.activeSession.jobTitle ? ` · ${p.activeSession.jobTitle}` : ''}
                                </span>
                              </div>
                            ) : (
                              <Badge variant="success">Available</Badge>
                            )}
                          </td>
                          <td className="p-3 hidden sm:table-cell text-right">
                            <Link
                              to={`/employees/${p.userId}`}
                              className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              Profile →
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
