import { api } from '@/api'

export async function fetchAuditLog(params?: {
  entityType?: string
  entityId?: string
  userId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
  sortOrder?: 'asc' | 'desc'
}) {
  const { data } = await api.get('/audit-log', { params: params ?? {} })
  return data
}
