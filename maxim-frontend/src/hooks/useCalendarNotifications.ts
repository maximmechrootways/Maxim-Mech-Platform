import { useState, useEffect, useCallback, useRef } from 'react'
import * as googleCalendarApi from '@/api/googleCalendar'

export interface CalendarToast {
  id: string
  eventId: string
  type: 'upcoming' | 'ongoing'
  title: string
  time: string
  htmlLink?: string
  dismissedAt?: number
}

const POLL_INTERVAL_MS = 60_000 // 1 min
const TOAST_AUTO_DISMISS_MS = 20_000 // 20s
const UPCOMING_WINDOW_MS = 10 * 60_000 // 10 min

function formatEventTimeShort(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const hasTime = start.includes('T') && start.length > 10
  if (!hasTime) return 'All day'
  const sTime = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const eTime = e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${sTime} – ${eTime}`
}

export function useCalendarNotifications() {
  const [toasts, setToasts] = useState<CalendarToast[]>([])
  const notifiedRef = useRef<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const checkEvents = useCallback(async () => {
    try {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
      const events = await googleCalendarApi.getCalendarEvents({ from, to })

      const newToasts: CalendarToast[] = []

      for (const ev of events) {
        const start = new Date(ev.start)
        const end = new Date(ev.end)
        const hasTime = ev.start.includes('T') && ev.start.length > 10
        if (!hasTime) continue // Skip all-day events for notifications

        const msUntilStart = start.getTime() - now.getTime()
        const isOngoing = now >= start && now <= end

        // 10-min warning
        const upcomingKey = `${ev.id}:upcoming`
        if (msUntilStart > 0 && msUntilStart <= UPCOMING_WINDOW_MS && !notifiedRef.current.has(upcomingKey)) {
          notifiedRef.current.add(upcomingKey)
          const mins = Math.ceil(msUntilStart / 60_000)
          const toast: CalendarToast = {
            id: upcomingKey,
            eventId: ev.id,
            type: 'upcoming',
            title: ev.summary,
            time: `Starts in ${mins} min · ${formatEventTimeShort(ev.start, ev.end)}`,
            htmlLink: ev.htmlLink,
          }
          newToasts.push(toast)

          // Browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`⏰ ${ev.summary}`, { body: `Starts in ${mins} minutes`, icon: '/favicon.ico' })
          }
        }

        // Ongoing notification
        const ongoingKey = `${ev.id}:ongoing`
        if (isOngoing && !notifiedRef.current.has(ongoingKey)) {
          notifiedRef.current.add(ongoingKey)
          const toast: CalendarToast = {
            id: ongoingKey,
            eventId: ev.id,
            type: 'ongoing',
            title: ev.summary,
            time: `Now · ${formatEventTimeShort(ev.start, ev.end)}`,
            htmlLink: ev.htmlLink,
          }
          newToasts.push(toast)

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`🟢 ${ev.summary} — NOW`, { body: formatEventTimeShort(ev.start, ev.end), icon: '/favicon.ico' })
          }
        }
      }

      if (newToasts.length > 0) {
        setToasts((prev) => [...prev, ...newToasts])
      }
    } catch {
      // Silently fail — user may not have calendar connected
    }
  }, [])

  // Start polling
  useEffect(() => {
    checkEvents()
    intervalRef.current = setInterval(checkEvents, POLL_INTERVAL_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [checkEvents])

  // Auto-dismiss toasts
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => {
      const now = Date.now()
      setToasts((prev) => prev.filter((t) => !t.dismissedAt || now - t.dismissedAt < TOAST_AUTO_DISMISS_MS))
    }, TOAST_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toasts])

  // Auto-dismiss after 20s by marking them
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts
      .filter((t) => !t.dismissedAt)
      .map((t) =>
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id))
        }, TOAST_AUTO_DISMISS_MS)
      )
    return () => timers.forEach(clearTimeout)
  }, [toasts])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, dismissToast }
}
