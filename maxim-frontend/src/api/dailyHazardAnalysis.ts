import { api } from '@/api'

export interface DailyHazardSubmissionSummary {
  id: string
  date: string
  projectId: string
  projectTitle?: string | null
  siteName?: string | null
  supervisorName?: string | null
  jobNumber?: string | null
  submittedById?: string | null
  submittedBy?: string | null
  submittedAt?: string
  approved?: boolean
  approvedAt?: string | null
  approvedById?: string | null
  approvedByName?: string | null
}

export interface DailyHazardSubmissionDetail extends DailyHazardSubmissionSummary {
  musterPoint?: string | null
  weatherTemp?: string | null
  weatherConditions?: string[]
  nearestHospital?: string | null
  emergencyCoordinator?: string | null
  activities: string[]
  hazards: string[]
  controls: string[]
  ppe: string[]
  jobHazardAssessment?: Array<{
    job: string
    hazard?: string
    control?: string
    riskRatingRequired?: string
    hazards?: string[]
    controls?: string[]
    riskBeforeControls?: string
    riskAfterControls?: string
  }>
  workplaceViolence?: { question: string; answer: string }[]
  workplaceViolenceActions?: string | null
  toolsReplaced?: string | null
  additionalComments?: string | null
  signatures: { id: string; name: string; timestamp: string; dataUrl: string }[]
}

export async function listDailyHazardSubmissions(params?: { projectId?: string; fromDate?: string; toDate?: string }): Promise<DailyHazardSubmissionSummary[]> {
  const { data } = await api.get<DailyHazardSubmissionSummary[]>('/daily-hazard-analysis', { params })
  return Array.isArray(data) ? data : []
}

export async function getDailyHazardSubmission(id: string): Promise<DailyHazardSubmissionDetail> {
  const { data } = await api.get<DailyHazardSubmissionDetail>(`/daily-hazard-analysis/${id}`)
  return data
}

export async function createDailyHazardSubmission(payload: {
  date: string
  projectId: string
  projectTitle?: string
  siteName?: string
  musterPoint?: string
  supervisorId?: string
  supervisorName?: string
  jobNumber?: string
  weatherTemp?: string
  weatherConditions?: string[]
  nearestHospital?: string
  emergencyCoordinator?: string
  activities: string[]
  hazards: string[]
  controls: string[]
  ppe: string[]
  jobHazardAssessment?: Array<{
    job: string
    hazard?: string
    control?: string
    riskRatingRequired?: string
    hazards?: string[]
    controls?: string[]
    riskBeforeControls?: string
    riskAfterControls?: string
  }>
  workplaceViolence?: { question: string; answer: string }[]
  workplaceViolenceActions?: string
  toolsReplaced?: string
  additionalComments?: string
  signatures: { id: string; name: string; timestamp: string; dataUrl: string }[]
}): Promise<DailyHazardSubmissionSummary> {
  const { data } = await api.post<DailyHazardSubmissionSummary>('/daily-hazard-analysis', payload)
  return data
}

export async function deleteDailyHazardSubmission(id: string): Promise<{ success: true }> {
  const { data } = await api.delete<{ success: true }>(`/daily-hazard-analysis/${id}`)
  return data
}

export async function setDailyHazardSubmissionApproval(id: string, approved: boolean): Promise<DailyHazardSubmissionDetail> {
  const { data } = await api.patch<DailyHazardSubmissionDetail>(`/daily-hazard-analysis/${id}/approval`, { approved })
  return data
}
