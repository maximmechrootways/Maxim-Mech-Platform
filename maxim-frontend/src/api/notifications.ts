import { api } from '@/api'

export async function fetchNotifications(params?: { unreadOnly?: string; limit?: number }) {
  const { data } = await api.get('/notifications', { params: params ?? {} })
  return data
}

export async function markNotificationRead(id: string) {
  const { data } = await api.post(`/notifications/${id}/read`)
  return data
}

export async function markAllNotificationsRead() {
  await api.post('/notifications/read-all')
}

export async function postTestFormsDigest() {
  const { data } = await api.post<{
    enqueued: boolean
    itemCount: number
    digestDateLabel: string
  }>('/notifications/test-forms-digest', {})
  return data
}
