import { api } from '@/api'

export interface HazardPayload {
  siteId?: string
  siteName?: string
  jobId?: string
  title?: string
  description?: string
  reportedBy?: string
  reportedAt?: string
  status?: string
  assignedTo?: string
  dueDate?: string
  likelihood?: number
  impact?: number
  recommendedControls?: { id?: string; description?: string; status?: string; completedAt?: string }[]
}

export async function fetchHazards(params?: { status?: string; siteId?: string }) {
  const { data } = await api.get('/hazards', { params })
  return data
}

export async function fetchHazard(id: string) {
  const { data } = await api.get(`/hazards/${id}`)
  return data
}

export async function createHazard(payload: HazardPayload) {
  const { data } = await api.post('/hazards', payload)
  return data
}

export async function updateHazard(id: string, payload: Partial<HazardPayload>) {
  const { data } = await api.patch(`/hazards/${id}`, payload)
  return data
}

export async function deleteHazard(id: string) {
  await api.delete(`/hazards/${id}`)
}
