import { api } from '@/api'

export interface InjuryReportPayload {
  jobId?: string
  siteId?: string
  siteName: string
  reportedBy?: string
  status?: string
  severity?: string
  description: string
  followUpNotes?: string
  injuredPersonName?: string
  injuredPersonId?: string
  injuryType?: string
  bodyPart?: string
  mechanism?: string
  dateOfInjury?: string
  lostTime?: boolean
  daysAwayFromWork?: number
  restrictedDutyDays?: number
  wsibReported?: boolean
  wsibClaimNumber?: string
  wsibReportedAt?: string
  subcontractorId?: string
  photoUrl?: string
}

export interface RootCausePayload {
  immediateCause: string
  contributingCauses?: string[]
  underlyingCause?: string
}

export async function fetchInjuryReports(params?: { status?: string; jobId?: string; subcontractorId?: string }) {
  const { data } = await api.get('/injury-reports', { params })
  return data
}

export async function fetchInjuryReport(id: string) {
  const { data } = await api.get(`/injury-reports/${id}`)
  return data
}

export async function createInjuryReport(payload: InjuryReportPayload) {
  const { data } = await api.post('/injury-reports', payload)
  return data
}

export async function updateInjuryReport(id: string, payload: Partial<InjuryReportPayload>) {
  const { data } = await api.patch(`/injury-reports/${id}`, payload)
  return data
}

export async function deleteInjuryReport(id: string) {
  await api.delete(`/injury-reports/${id}`)
}

export async function fetchRootCause(injuryId: string) {
  try {
    const { data } = await api.get(`/injury-reports/${injuryId}/root-cause`)
    return data
  } catch (err: any) {
    if (err?.response?.status === 404) return null
    throw err
  }
}

export async function putRootCause(injuryId: string, payload: RootCausePayload) {
  const { data } = await api.put(`/injury-reports/${injuryId}/root-cause`, payload)
  return data
}
