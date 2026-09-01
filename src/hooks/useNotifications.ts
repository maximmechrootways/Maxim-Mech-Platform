import { useState, useMemo, useEffect } from 'react'
import type { NotificationItem } from '@/types'
import { listNotifications } from '@/api/notifications'

export function useNotifications() {
  const [list, setList] = useState<NotificationItem[]>([])
  useEffect(() => { listNotifications().then(setList) }, [])
  const [open, setOpen] = useState(false)

  const unreadCount = useMemo(() => list.filter((n) => !n.read).length, [list])

  const markRead = (id: string) => {
    setList((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllRead = () => {
    setList((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  return { notifications: list, unreadCount, markRead, markAllRead, open, setOpen }
}
