import { api } from '@/api'

export interface NearMissPayload {
  siteId?: string
  siteName?: string
  reportedBy?: string
  reportedById?: string
  reportedAt?: string
  description?: string
  status?: string
  followUpNotes?: string
  /** Plain text: corrective action to be taken */
  correctiveAction?: string
  /** ISO date string; send null to clear */
  correctiveActionDate?: string | null
  /** Name of person who completed the report */
  reportCompletedBy?: string
}

export type NearMissRecord = NearMissPayload & { id: string }

export async function fetchNearMisses(params?: { status?: string; siteId?: string }) {
  const { data } = await api.get('/near-misses', { params })
  return data
}

export async function fetchNearMiss(id: string) {
  const { data } = await api.get(`/near-misses/${id}`)
  return data
}

export async function createNearMiss(payload: NearMissPayload) {
  const { data } = await api.post('/near-misses', payload)
  return data
}

export async function updateNearMiss(id: string, payload: Partial<NearMissPayload>) {
  const { data } = await api.patch(`/near-misses/${id}`, payload)
  return data
}

export async function deleteNearMiss(id: string) {
  await api.delete(`/near-misses/${id}`)
}

export async function downloadNearMissPdf(id: string): Promise<Blob> {
  const { data } = await api.get(`/near-misses/${id}/pdf`, { responseType: 'blob' })
  return data
}
