import { api } from '@/api'

export interface SafetyAlertPayload {
  title: string
  body: string
  siteNames?: string[]
  roles?: string[]
  expiresAt?: string
}

export async function fetchSafetyAlerts() {
  const { data } = await api.get('/safety-alerts')
  return data
}

export async function fetchSafetyAlert(id: string) {
  const { data } = await api.get(`/safety-alerts/${id}`)
  return data
}

export async function createSafetyAlert(payload: SafetyAlertPayload) {
  const { data } = await api.post('/safety-alerts', payload)
  return data
}

export async function updateSafetyAlert(id: string, payload: Partial<SafetyAlertPayload>) {
  const { data } = await api.patch(`/safety-alerts/${id}`, payload)
  return data
}

export async function deleteSafetyAlert(id: string) {
  await api.delete(`/safety-alerts/${id}`)
}

export async function markSafetyAlertRead(id: string) {
  const { data } = await api.post(`/safety-alerts/${id}/read`)
  return data
}

export async function acknowledgeSafetyAlert(id: string) {
  const { data } = await api.post(`/safety-alerts/${id}/acknowledge`)
  return data
}
