import { api } from '@/api'

export interface TimeOffEntryRecord {
  id: string
  labourerId: string
  labourerName: string
  createdById: string
  createdByName: string
  reason: string
  compensation?: 'paid' | 'unpaid' | string
  isPaid?: boolean
  startDate: string | null
  endDate: string | null
  totalDays: number
  notes: string | null
  createdAt: string
}

export interface TimeOffYearlyTotal {
  labourerId: string
  labourerName: string
  totalDays: number
}

export interface TimeOffListResponse {
  entries: TimeOffEntryRecord[]
  labourers: Array<{ id: string; name: string }>
  reasons: string[]
  year: number
  holidays: Array<{ date: string; name: string }>
  yearlyTotals: TimeOffYearlyTotal[]
  yearlyTotalDays: number
}

export type TimeOffRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

export interface TimeOffRequestRecord {
  id: string
  requesterId: string
  requesterName: string
  reason: string
  compensation: 'paid' | 'unpaid' | string
  startDate: string | null
  endDate: string | null
  totalDays: number
  notes: string | null
  status: TimeOffRequestStatus | string
  reviewedById: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  timeOffEntryId: string | null
  createdAt: string
  updatedAt: string
}

export interface TimeOffRequestsResponse {
  requests: TimeOffRequestRecord[]
  reasons: string[]
  canApprove: boolean
}

export async function fetchTimeOffTeamLabourers() {
  const { data } = await api.get<Array<{ id: string; name: string }>>('/time-off/team-labourers')
  return Array.isArray(data) ? data : []
}

export async function fetchTimeOffEntries(params?: { year?: number; labourerId?: string }) {
  const { data } = await api.get<TimeOffListResponse>('/time-off', { params })
  return data
}

export async function createTimeOffEntry(payload: {
  labourerId: string
  reason: string
  startDate: string
  endDate: string
  notes?: string
  compensation?: 'paid' | 'unpaid'
}) {
  const { data } = await api.post<TimeOffEntryRecord>('/time-off', payload)
  return data
}

export async function updateTimeOffEntry(
  id: string,
  payload: {
    labourerId: string
    reason: string
    startDate: string
    endDate: string
    notes?: string
    compensation?: 'paid' | 'unpaid'
  }
) {
  const { data } = await api.patch<TimeOffEntryRecord>(`/time-off/${id}`, payload)
  return data
}

export async function deleteTimeOffEntry(id: string) {
  const { data } = await api.delete<{ deleted: true; requestCancelled?: boolean }>(`/time-off/${id}`)
  return data
}

export async function fetchTimeOffRequests(params?: { status?: string; mine?: boolean }) {
  const { data } = await api.get<TimeOffRequestsResponse>('/time-off/requests', {
    params: {
      ...params,
      ...(params?.mine ? { mine: '1' } : {}),
    },
  })
  return data
}

export async function createTimeOffRequest(payload: {
  reason: string
  startDate: string
  endDate: string
  notes?: string
  compensation?: 'paid' | 'unpaid'
}) {
  const { data } = await api.post<TimeOffRequestRecord>('/time-off/requests', payload)
  return data
}

export async function cancelTimeOffRequest(id: string) {
  const { data } = await api.post<TimeOffRequestRecord>(`/time-off/requests/${id}/cancel`)
  return data
}

export async function approveTimeOffRequest(id: string, payload?: { compensation?: 'paid' | 'unpaid'; reviewNotes?: string }) {
  const { data } = await api.post<TimeOffRequestRecord>(`/time-off/requests/${id}/approve`, payload ?? {})
  return data
}

export async function denyTimeOffRequest(id: string, payload?: { reviewNotes?: string }) {
  const { data } = await api.post<TimeOffRequestRecord>(`/time-off/requests/${id}/deny`, payload ?? {})
  return data
}
