import { api } from '@/api'

export interface ObservationPayload {
  siteId?: string
  siteName?: string
  type: 'positive' | 'corrective'
  description?: string
  observedBy?: string
  observedAt?: string
}

export async function fetchObservations(params?: { type?: string; siteId?: string }) {
  const { data } = await api.get('/observations', { params })
  return data
}

export async function fetchObservation(id: string) {
  const { data } = await api.get(`/observations/${id}`)
  return data
}

export async function createObservation(payload: ObservationPayload) {
  const { data } = await api.post('/observations', payload)
  return data
}

export async function updateObservation(id: string, payload: Partial<ObservationPayload>) {
  const { data } = await api.patch(`/observations/${id}`, payload)
  return data
}

export async function deleteObservation(id: string) {
  await api.delete(`/observations/${id}`)
}
