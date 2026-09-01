import { api } from '@/api'

export async function fetchComplianceEvents(params?: { from?: string; to?: string; type?: string }) {
  const { data } = await api.get('/compliance-calendar', { params: params ?? {} })
  return data
}

export async function fetchComplianceDue(asOf?: string) {
  const { data } = await api.get('/compliance-calendar/due', { params: asOf ? { asOf } : {} })
  return data
}
