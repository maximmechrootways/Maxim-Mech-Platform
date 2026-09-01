import { api } from '@/api'

export interface CapaPayload {
  actionType?: 'corrective' | 'preventive'
  sourceType?: string
  sourceId?: string
  title?: string
  description?: string
  assignedTo?: string
  dueDate?: string
  status?: string
  completedAt?: string
}

export async function fetchCapaList(params?: { status?: string; sourceType?: string }) {
  const { data } = await api.get('/capa', { params })
  return data
}

export async function fetchCapa(id: string) {
  const { data } = await api.get(`/capa/${id}`)
  return data
}

export async function createCapa(payload: CapaPayload) {
  const { data } = await api.post('/capa', payload)
  return data
}

export async function updateCapa(id: string, payload: Partial<CapaPayload>) {
  const { data } = await api.patch(`/capa/${id}`, payload)
  return data
}

export async function deleteCapa(id: string) {
  await api.delete(`/capa/${id}`)
}
