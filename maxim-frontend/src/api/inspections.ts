import { api } from '@/api'

export async function fetchInspectionSchedules() {
  const { data } = await api.get('/inspections/schedules')
  return data
}

export async function fetchInspectionsDue(asOf?: string) {
  const { data } = await api.get('/inspections/due', { params: asOf ? { asOf } : {} })
  return data
}

export async function fetchInspectionResults(scheduleId?: string) {
  const { data } = await api.get('/inspections/results', { params: scheduleId ? { scheduleId } : {} })
  return data
}
