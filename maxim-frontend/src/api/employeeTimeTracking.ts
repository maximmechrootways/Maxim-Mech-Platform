import { api } from '@/api'

export interface EmployeeWorkSessionRow {
  id: string
  userId: string
  userName?: string
  /** Maxim user whose account performed clock-in / bulk */
  clockInByUserId?: string | null
  clockInByDisplayName?: string | null
  clockOutByUserId?: string | null
  clockOutByDisplayName?: string | null
  siteId: string | null
  siteName: string | null
  jobId: string | null
  jobTitle: string | null
  subcontractorId: string | null
  subcontractorCompanyName: string | null
  subcontractorPersonnelId: string | null
  subcontractorPersonnelName: string | null
  startedAt: string
  endedAt: string | null
  startNote: string | null
  endNote: string | null
  startLatitude?: number | null
  startLongitude?: number | null
  durationSeconds: number | null
  createdAt: string
  updatedAt: string
}

export async function fetchActiveWorkSession(params?: {
  /** Owner / HR: read this user’s open session instead of yours. */
  userId?: string
}): Promise<EmployeeWorkSessionRow | null> {
  const { data } = await api.get<EmployeeWorkSessionRow | null>('/employee-time-tracking/sessions/active', {
    params: params?.userId ? { userId: params.userId } : undefined,
  })
  return data
}

export async function listWorkSessions(params?: {
  userId?: string
  from?: string
  to?: string
}): Promise<EmployeeWorkSessionRow[]> {
  const { data } = await api.get<EmployeeWorkSessionRow[]>('/employee-time-tracking/sessions', { params })
  return Array.isArray(data) ? data : []
}

export async function startWorkSession(payload: {
  /** Owner / HR: start a session for this employee instead of yourself. */
  forUserId?: string | null
  siteId?: string | null
  jobId?: string | null
  subcontractorId?: string | null
  subcontractorPersonnelId?: string | null
  startNote?: string | null
  startLatitude?: number | null
  startLongitude?: number | null
  startAccuracyM?: number | null
}): Promise<EmployeeWorkSessionRow> {
  const { data } = await api.post<EmployeeWorkSessionRow>('/employee-time-tracking/sessions/start', payload)
  return data
}

export async function endWorkSession(
  id: string,
  payload?: {
    endNote?: string | null
    endLatitude?: number | null
    endLongitude?: number | null
    endAccuracyM?: number | null
  }
): Promise<EmployeeWorkSessionRow> {
  const { data } = await api.post<EmployeeWorkSessionRow>(`/employee-time-tracking/sessions/${id}/end`, payload ?? {})
  return data
}

export interface SiteWorkRosterPerson {
  userId: string
  name: string
  role: string
  email: string | null
  activeSession: { id: string; startedAt: string; jobTitle: string | null } | null
}

export interface SiteWorkRosterResponse {
  site: { id: string; name: string }
  people: SiteWorkRosterPerson[]
}

export async function fetchSiteWorkRoster(siteId: string): Promise<SiteWorkRosterResponse> {
  const { data } = await api.get<SiteWorkRosterResponse>(`/employee-time-tracking/site/${siteId}/roster`)
  return data
}

export async function bulkStartSessionsAtSite(payload: {
  siteId: string
  userIds: string[]
  jobId?: string | null
  startNote?: string | null
  startLatitude?: number | null
  startLongitude?: number | null
  startAccuracyM?: number | null
}): Promise<{
  siteId: string
  results: Array<{
    userId: string
    ok: boolean
    error?: string
    session?: EmployeeWorkSessionRow
  }>
}> {
  const { data } = await api.post('/employee-time-tracking/site/bulk-start', payload)
  return data
}
