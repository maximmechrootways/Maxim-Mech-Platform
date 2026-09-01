import { api } from '@/api'

export interface JobListItem {
  id: string
  title: string
  siteId: string
  siteName: string
  status: string
  progressStage?: string
  createdBy: string
  createdAt: string
  assignedSupervisorIds: string[]
  labourerCount: number
  /** Subcontractor companies linked to the job (from list endpoint; avoids N+1 fetches) */
  subcontractorCount?: number
  /** Subcontractor workers assigned to this job (personnel job assignments) */
  subcontractorPersonnelCount?: number
}

export interface SiteOption {
  id: string
  name: string
  jobId: string | null
  activeJobTitle: string | null
}

export interface SupervisorOption {
  id: string
  name: string
  role: string
}

export async function fetchJobs(params?: { status?: string; siteId?: string }): Promise<JobListItem[]> {
  const { data } = await api.get<JobListItem[]>('/jobs', { params })
  return data
}

export async function fetchMyJobs(): Promise<{ id: string; title: string; siteName: string; status: string; progressStage?: string; labourerCount: number }[]> {
  const { data } = await api.get('/jobs/my-jobs')
  return data
}

export async function fetchJobDetail(id: string) {
  const { data } = await api.get(`/jobs/${id}`)
  return data
}

export async function createJob(payload: { title: string; siteId: string }) {
  const { data } = await api.post('/jobs', payload)
  return data
}

export async function updateJob(id: string, payload: { title?: string; status?: string; progressStage?: string; siteId?: string; gate?: string }) {
  const { data } = await api.patch(`/jobs/${id}`, payload)
  return data
}

export async function deleteJob(id: string) {
  await api.delete(`/jobs/${id}`)
}

export async function addSupervisor(jobId: string, userId: string) {
  await api.post(`/jobs/${jobId}/supervisors`, { userId })
}

export async function removeSupervisor(jobId: string, userId: string) {
  await api.delete(`/jobs/${jobId}/supervisors/${userId}`)
}

export async function addLabourer(jobId: string, userId: string) {
  await api.post(`/jobs/${jobId}/labourers`, { userId })
}

export async function removeLabourer(jobId: string, userId: string) {
  await api.delete(`/jobs/${jobId}/labourers/${userId}`)
}

export async function addSubcontractor(jobId: string, subcontractorId: string) {
  await api.post(`/jobs/${jobId}/subcontractors`, { subcontractorId })
}

export async function removeSubcontractor(jobId: string, subcontractorId: string) {
  await api.delete(`/jobs/${jobId}/subcontractors/${subcontractorId}`)
}

export async function checkIn(jobId: string, targetUserId: string, date?: string) {
  const { data } = await api.post(`/jobs/${jobId}/check-in`, { targetUserId, date })
  return data
}

export async function resetCheckIn(jobId: string, targetUserId: string, date?: string) {
  await api.post(`/jobs/${jobId}/check-in/reset`, { targetUserId, date })
}

export async function fetchSites(activeOnly: boolean = true): Promise<SiteOption[]> {
  const { data } = await api.get<SiteOption[]>('/sites', { params: { activeOnly: activeOnly ? 'true' : 'false' } })
  return data
}

export async function fetchSiteDetail(id: string) {
  const { data } = await api.get(`/sites/${id}`)
  return data
}

export async function createSite(payload: { name: string; address?: string }): Promise<{ id: string; name: string; address?: string }> {
  const { data } = await api.post('/sites', payload)
  return data
}

export interface SiteUpdatePayload {
  name?: string
  address?: string
  meetingPoint?: string
  nearestHospital?: string
  firstAiderName?: string
  firstAiderPhone?: string
  emergencyContact?: string
  active?: boolean
}

export async function updateSite(id: string, payload: SiteUpdatePayload): Promise<{ id: string; name: string; address?: string; meetingPoint?: string; nearestHospital?: string; firstAiderName?: string; firstAiderPhone?: string; emergencyContact?: string }> {
  const { data } = await api.patch(`/sites/${id}`, payload)
  return data
}

export async function deleteSite(id: string): Promise<void> {
  await api.delete(`/sites/${id}`)
}

export async function addSiteSupervisor(siteId: string, userId: string): Promise<{ id: string; userId: string; userName: string }> {
  const { data } = await api.post(`/sites/${siteId}/supervisors`, { userId })
  return data
}

export async function removeSiteSupervisor(siteId: string, userId: string): Promise<void> {
  await api.delete(`/sites/${siteId}/supervisors/${userId}`)
}

export async function addSiteLabourer(siteId: string, userId: string): Promise<{ id: string; userId: string; userName: string; assignedAt: string }> {
  const { data } = await api.post(`/sites/${siteId}/labourers`, { userId })
  return data
}

export async function removeSiteLabourer(siteId: string, userId: string): Promise<void> {
  await api.delete(`/sites/${siteId}/labourers/${userId}`)
}

export async function fetchSupervisors(): Promise<SupervisorOption[]> {
  const { data } = await api.get<SupervisorOption[]>('/users/supervisors')
  return data
}

export async function fetchUsers(): Promise<{ id: string; name: string; role: string; employmentStatus?: string }[]> {
  const { data } = await api.get('/users')
  return data
}

/** Owner/HR: full user list including employmentStatus so we can exclude on-leave from assignment */
export async function fetchUsersForAssignment(): Promise<{ id: string; name: string; role: string; employmentStatus?: string }[]> {
  const { data } = await api.get('/users/admin')
  return Array.isArray(data) ? data.map((u: { id: string; firstName?: string; lastName?: string; name?: string; role: string; employmentStatus?: string; isActive?: boolean }) => ({
    id: u.id,
    name: u.name ?? ([u.firstName, u.lastName].filter(Boolean).join(' ') || ''),
    role: u.role,
    employmentStatus: u.employmentStatus ?? (u.isActive === false ? 'terminated' : 'active'),
  })) : []
}

export async function fetchSubcontractors(): Promise<{ id: string; companyName: string; primaryContactName: string; status: string }[]> {
  const { data } = await api.get('/subcontractors')
  return data
}
