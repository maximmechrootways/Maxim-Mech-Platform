import { useState, useMemo, useCallback, useEffect } from 'react'
import * as notificationsApi from '@/api/notifications'

export function useNotifications() {
  const [list, setList] = useState<{ id: string; title: string; body: string; read: boolean; linkTo?: string }[]>([])
  const [open, setOpen] = useState(false)

  const unreadCount = useMemo(() => list.filter((n) => !n.read).length, [list])

  const fetchList = useCallback(async () => {
    try {
      const data = await notificationsApi.fetchNotifications({ limit: 50 })
      setList(Array.isArray(data) ? data : [])
    } catch {
      setList([])
    }
  }, [])

  useEffect(() => {
    fetchList()
    const interval = setInterval(fetchList, 5 * 60 * 1000) // Poll every 5 min to reduce 429 risk
    return () => clearInterval(interval)
  }, [fetchList])

  const markRead = useCallback(async (id: string) => {
    try {
      await notificationsApi.markNotificationRead(id)
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    } catch {
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllNotificationsRead()
      setList((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      setList((prev) => prev.map((n) => ({ ...n, read: true })))
    }
  }, [])

  return { notifications: list, unreadCount, markRead, markAllRead, open, setOpen, refetch: fetchList }
}
