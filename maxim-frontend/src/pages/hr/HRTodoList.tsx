import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useHRTodos } from '@/contexts/HRTodosContext'
import type { HRTodoItem, HRTodoRecurrence } from '@/types'
import * as googleCalendarApi from '@/api/googleCalendar'
import type { GoogleCalendarEvent } from '@/api/googleCalendar'

const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar'
const RECURRENCE_OPTIONS: { value: HRTodoRecurrence; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'once', label: 'One-time' },
]

type ViewFilter = HRTodoRecurrence | 'all'
const VIEW_TABS: { value: ViewFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...RECURRENCE_OPTIONS,
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/** Add calendar days to a YYYY-MM-DD string (matches todayISO / DB dates). */
function addDaysToIsoDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function getWeekStart(d: string) {
  const date = new Date(d + 'T12:00:00Z')
  const day = date.getUTCDay()
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(date)
  monday.setUTCDate(diff)
  return monday.toISOString().slice(0, 10)
}

function getMonthStart(d: string) {
  return d.slice(0, 7) + '-01'
}

/** Format HH:mm to 12h am/pm (e.g. "14:30" -> "2:30 PM") */
function formatTime(hhmm: string) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const hour = h % 12 || 12
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDueDateLabel(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' })
}



export function HRTodoList() {
  const { todos, addTodo, removeTodo, toggleComplete, loadData } = useHRTodos()
  const [searchParams, setSearchParams] = useSearchParams()

  // Fetch HR todos only when this page is visited
  useEffect(() => { loadData() }, [loadData])
  const [view, setView] = useState<ViewFilter>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState(todayISO())
  const [newDueTime, setNewDueTime] = useState('')
  const [newRecurrence, setNewRecurrence] = useState<HRTodoRecurrence>('daily')

  // Calendar month navigation
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  // Google Calendar connection (each person connects their own)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEvent[]>([])
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarConnectError, setCalendarConnectError] = useState<string | null>(null)
  const [calendarMessage, setCalendarMessage] = useState<'connected' | 'error' | null>(null)

  useEffect(() => {
    const q = searchParams.get('calendar')
    if (q === 'connected') setCalendarMessage('connected')
    if (q === 'error') setCalendarMessage('error')
    if (q) {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const fetchCalendarStatus = useCallback(async () => {
    try {
      const status = await googleCalendarApi.getCalendarStatus()
      setCalendarConnected(status.connected)
      setCalendarConnectError(status.configured === false ? 'Google Calendar is not set up on this server.' : null)
    } catch (e: unknown) {
      setCalendarConnected(false)
      const res = e && typeof e === 'object' && 'response' in e ? (e as { response?: { status?: number } }).response : undefined
      const status = res?.status
      if (status === 404) setCalendarConnectError(null)
      else if (status === 503) setCalendarConnectError('Google Calendar is not set up on this server.')
      else setCalendarConnectError('Could not load calendar status')
    } finally {
      setCalendarLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCalendarStatus()
  }, [fetchCalendarStatus])

  useEffect(() => {
    if (!calendarConnected) {
      setCalendarEvents([])
      return
    }
    const from = new Date(calendarMonth.year, calendarMonth.month, 1).toISOString()
    const to = new Date(calendarMonth.year, calendarMonth.month + 1, 0, 23, 59, 59).toISOString()
    googleCalendarApi.getCalendarEvents({ from, to })
      .then(setCalendarEvents)
      .catch(() => setCalendarEvents([]))
  }, [calendarConnected, calendarMonth])

  const handleConnectCalendar = async () => {
    try {
      const { url } = await googleCalendarApi.getCalendarAuthUrl()
      window.location.href = url
    } catch (e: unknown) {
      const res = e && typeof e === 'object' && 'response' in e ? (e as { response?: { status?: number; data?: { error?: string } } }).response : undefined
      if (res?.status === 503) setCalendarConnectError('Google Calendar is not set up on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the backend env.')
      else setCalendarConnectError(res?.data?.error ?? (e instanceof Error ? e.message : 'Could not start connect'))
    }
  }

  const handleDisconnectCalendar = async () => {
    try {
      await googleCalendarApi.disconnectCalendar()
      setCalendarConnected(false)
      setCalendarEvents([])
    } catch {
      setCalendarConnectError('Could not disconnect')
    }
  }

  /** One-time tasks shown on "Daily": overdue, due today, or due within this many days (so next week appears). */
  const DAILY_UPCOMING_DAYS = 14

  const filtered = (() => {
    if (view === 'all') {
      return [...todos].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? '').localeCompare(b.dueTime ?? ''))
    }
    return todos.filter((t) => {
      const tDue = t.dueDate
      const today = todayISO()
      const dailyHorizon = addDaysToIsoDate(today, DAILY_UPCOMING_DAYS)
      if (t.recurrence === 'once') {
        if (view === 'once') return true
        if (view === 'daily') {
          if (t.completed) return tDue === today
          return tDue < today || (tDue >= today && tDue <= dailyHorizon)
        }
        if (view === 'weekly') return getWeekStart(tDue) === getWeekStart(today)
        if (view === 'monthly') return getMonthStart(tDue) === getMonthStart(today)
        return false
      }
      if (t.recurrence !== view) return false
      if (view === 'daily') {
        if (t.completed) return tDue === today
        return tDue < today || (tDue >= today && tDue <= dailyHorizon)
      }
      if (view === 'weekly') return getWeekStart(tDue) === getWeekStart(today)
      if (view === 'monthly') return getMonthStart(tDue) === getMonthStart(today)
      return true
    })
  })()

  const overdueTodos = todos.filter((t) => {
    if (t.completed) return false
    const today = todayISO()
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return t.dueDate < today || (t.dueDate === today && t.dueTime != null && t.dueTime < currentTime)
  })

  const handleClearOverdue = async () => {
    for (const t of overdueTodos) {
      await removeTodo(t.id)
    }
  }

  const handleAdd = async () => {
    const title = newTitle.trim()
    if (!title) return
    const created = await addTodo({
      title,
      recurrence: newRecurrence,
      dueDate: newDue,
      ...(newDueTime.trim() ? { dueTime: newDueTime.trim() } : {}),
      completed: false,
    })
    setNewTitle('')
    setNewDue(todayISO())
    setNewDueTime('')
    setNewRecurrence('daily')
    setShowAdd(false)
    setView('all')
    if (created) {
      window.open(addToGoogleCalendarUrl(created), '_blank', 'noopener,noreferrer')
    }
  }

  const openGoogleCalendarWeek = () => {
    window.open('https://calendar.google.com/calendar/u/0/r/week', '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="animate-fade-in">
      <header className="mb-6">
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">To-Do & Calendar</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-1">Track daily, weekly, and monthly tasks. Calendar is embedded below for live view.</p>
      </header>

      {/* Calendar: connect your own Google Calendar to see your events */}
      <Card padding="md" className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardHeader className="text-base mb-0">Calendar</CardHeader>
          {!calendarLoading && (
            <div className="flex items-center gap-2">
              {calendarConnected ? (
                <>
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">Your calendar is connected</span>
                  <Button variant="secondary" size="sm" onClick={handleDisconnectCalendar}>Disconnect</Button>
                  <a href={GOOGLE_CALENDAR_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Open in new tab</a>
                </>
              ) : (
                <Button size="sm" onClick={handleConnectCalendar}>Connect Your Google Calendar</Button>
              )}
            </div>
          )}
        </div>
        {calendarMessage === 'connected' && (
          <p className="mt-2 text-sm text-green-600 dark:text-green-400" role="status">Google Calendar connected. Your events appear below.</p>
        )}
        {calendarMessage === 'error' && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400" role="alert">Connection failed. You can try again.</p>
        )}
        {calendarConnectError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{calendarConnectError}</p>
        )}
        <CardDescription className="mt-1">
          {calendarConnected
            ? 'Your events from Google Calendar for this and next month.'
            : 'Connect your Google account to see your real events here. Each person connects their own calendar.'}
        </CardDescription>
        {calendarConnected ? (
          <CalendarGrid
            events={calendarEvents}
            month={calendarMonth.month}
            year={calendarMonth.year}
            onPrev={() => setCalendarMonth((p) => p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 })}
            onNext={() => setCalendarMonth((p) => p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 })}
            onToday={() => { const n = new Date(); setCalendarMonth({ year: n.getFullYear(), month: n.getMonth() }) }}
          />
        ) : (
          <>
            <div className="mt-4 min-h-[320px] rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-center">
              <div className="text-center p-6">
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">Connect your Google Calendar to see your events on this page.</p>
                <Button onClick={handleConnectCalendar}>Connect Google Calendar</Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={GOOGLE_CALENDAR_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Open Google Calendar in new tab</a>
              <button type="button" onClick={openGoogleCalendarWeek} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Week view</button>
            </div>
          </>
        )}
      </Card>

      {/* View tabs: All | Daily | Weekly | Monthly | One-time */}
      <Card padding="md" className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-600 p-0.5 bg-neutral-100/50 dark:bg-neutral-800/50">
            {VIEW_TABS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${view === value
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {overdueTodos.length > 0 && (
              <Button variant="secondary" size="sm" onClick={handleClearOverdue}>
                Clear overdue ({overdueTodos.length})
              </Button>
            )}
            <Button onClick={() => setShowAdd(true)}>Add task</Button>
          </div>
        </div>
      </Card>

      {/* Add task form */}
      {showAdd && (
        <Card padding="md" className="mb-6 border-brand-200 dark:border-brand-800">
          <CardHeader className="text-base">New Task</CardHeader>
          <CardDescription className="mt-1">Saving will add the task here and open Google Calendar so you can add it to your calendar in one click.</CardDescription>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="Task"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Review injury reports"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <div>
              <label id="hr-todo-due-label" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5" htmlFor="hr-todo-due">Due Date</label>
              <input
                id="hr-todo-due"
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                aria-labelledby="hr-todo-due-label"
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-500/50 bg-white/90 dark:bg-neutral-800/90 text-neutral-900 dark:text-white"
              />
            </div>
            <div>
              <label id="hr-todo-time-label" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5" htmlFor="hr-todo-time">Time (optional)</label>
              <input
                id="hr-todo-time"
                type="time"
                value={newDueTime}
                onChange={(e) => setNewDueTime(e.target.value)}
                aria-labelledby="hr-todo-time-label"
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-500/50 bg-white/90 dark:bg-neutral-800/90 text-neutral-900 dark:text-white"
              />
            </div>
            <div>
              <label id="hr-todo-cadence-label" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5" htmlFor="hr-todo-cadence">Cadence</label>
              <select
                id="hr-todo-cadence"
                value={newRecurrence}
                onChange={(e) => setNewRecurrence(e.target.value as HRTodoRecurrence)}
                aria-labelledby="hr-todo-cadence-label"
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-500/50 bg-white/90 dark:bg-neutral-800/90 text-neutral-900 dark:text-white"
              >
                {RECURRENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleAdd} disabled={!newTitle.trim()}>Save</Button>
              <Button variant="secondary" onClick={() => { setShowAdd(false); setNewTitle(''); setNewDue(todayISO()); setNewDueTime('') }}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Task list */}
      <Card padding="md">
        <CardHeader className="text-base">
          {view === 'all' ? 'All tasks' : view === 'once' ? 'One-time tasks' : `${view.charAt(0).toUpperCase() + view.slice(1)} tasks`}
        </CardHeader>
        <CardDescription>
          {view === 'all' && 'Every task regardless of cadence'}
          {view === 'daily' &&
            `Overdue, due today, or due within the next ${DAILY_UPCOMING_DAYS} days (one-time & daily cadence). Use All for every task.`}
          {view === 'weekly' && 'Tasks for this week'}
          {view === 'monthly' && 'Tasks for this month'}
          {view === 'once' && 'One-time tasks (no repeat)'}
        </CardDescription>
        <ul className="mt-4 space-y-2">
          {filtered.length === 0 ? (
            <li className="py-8 text-center text-neutral-500 dark:text-neutral-400 text-sm">No tasks in this view. Add one or switch view.</li>
          ) : (
            filtered.map((t) => (
              <TodoRow
                key={t.id}
                item={t}
                onToggle={() => toggleComplete(t.id)}
                onRemove={() => removeTodo(t.id)}
              />
            ))
          )}
        </ul>
      </Card>
    </div>
  )
}

function addToGoogleCalendarUrl(item: HRTodoItem): string {
  const start = item.dueTime
    ? `${item.dueDate.replace(/-/g, '')}T${item.dueTime.replace(':', '')}00`
    : `${item.dueDate.replace(/-/g, '')}T090000`
  const [h] = item.dueTime ? item.dueTime.split(':').map(Number) : [9]
  const endH = String((h + 1) % 24).padStart(2, '0')
  const end = item.dueTime
    ? `${item.dueDate.replace(/-/g, '')}T${endH}${item.dueTime.slice(2)}00`
    : `${item.dueDate.replace(/-/g, '')}T100000`
  const params = new URLSearchParams({ action: 'TEMPLATE', text: item.title, dates: `${start}/${end}` })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function TodoRow({
  item,
  onToggle,
  onRemove,
}: {
  item: HRTodoItem
  onToggle: () => void
  onRemove: () => void
}) {
  const today = todayISO()
  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const isOverdue =
    !item.completed &&
    (item.dueDate < today || (item.dueDate === today && item.dueTime != null && item.dueTime < currentTime))

  const content = (
    <>
      <input
        type="checkbox"
        checked={item.completed}
        onChange={onToggle}
        aria-label={`Mark "${item.title}" as ${item.completed ? 'incomplete' : 'complete'}`}
        className="h-5 w-5 rounded border-neutral-300 dark:border-neutral-600 text-brand-600 focus:ring-brand-500 shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium ${item.completed ? 'line-through text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}>
          {item.title}
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <Badge variant="default" className="text-xs">{item.recurrence}</Badge>
          {isOverdue && <Badge variant="danger" className="text-xs">Overdue</Badge>}
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Due {formatDueDateLabel(item.dueDate)}
            {item.dueTime ? ` · ${formatTime(item.dueTime)}` : ''}
          </span>
        </div>
      </div>
      <a href={addToGoogleCalendarUrl(item)} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 dark:text-brand-400 hover:underline shrink-0">Add to calendar</a>
      {item.linkTo && (
        <Link
          to={item.linkTo}
          className="text-sm text-brand-600 dark:text-brand-400 hover:underline shrink-0"
        >
          Open
        </Link>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 text-sm shrink-0"
        aria-label="Remove task"
      >
        Remove
      </button>
    </>
  )

  return (
    <li className={`flex items-start gap-3 py-3 px-3 rounded-xl border transition-colors ${isOverdue ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10' : 'border-neutral-100 dark:border-neutral-700/50 hover:border-neutral-200 dark:hover:border-neutral-600'}`}>
      {content}
    </li>
  )
}

/* ─── Custom Calendar Grid ───────────────────────────────────── */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function CalendarGrid({
  events,
  month,
  year,
  onPrev,
  onNext,
  onToday,
}: {
  events: GoogleCalendarEvent[]
  month: number
  year: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  const [selectedEvent, setSelectedEvent] = useState<GoogleCalendarEvent | null>(null)
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks: (number | null)[][] = []
  let week: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  // Index events by date
  const eventsByDate: Record<string, GoogleCalendarEvent[]> = {}
  for (const ev of events) {
    const startDate = ev.start.slice(0, 10)
    const endDate = ev.end.slice(0, 10)
    const s = new Date(startDate + 'T00:00:00')
    const e = new Date(endDate + 'T00:00:00')
    for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      if (!eventsByDate[key]) eventsByDate[key] = []
      if (!eventsByDate[key].find((x) => x.id === ev.id)) eventsByDate[key].push(ev)
    }
  }

  const isOngoing = (ev: GoogleCalendarEvent) => {
    const s = new Date(ev.start)
    const e = new Date(ev.end)
    return now >= s && now <= e
  }

  const formatEventTime = (ev: GoogleCalendarEvent) => {
    const hasTime = ev.start.includes('T') && ev.start.length > 10
    if (!hasTime) return 'All day'
    const s = new Date(ev.start)
    return s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  const formatEventTimeRange = (ev: GoogleCalendarEvent) => {
    const hasTime = ev.start.includes('T') && ev.start.length > 10
    if (!hasTime) return 'All day'
    const s = new Date(ev.start)
    const e = new Date(ev.end)
    return `${s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }

  const todayEvents = eventsByDate[todayStr] || []

  return (
    <div className="mt-4 space-y-3">
      {/* Header: Nav + Month/Year */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToday}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
          >
            Today
          </button>
          <button type="button" onClick={onPrev} className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 transition-colors" aria-label="Previous month">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={onNext} className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 transition-colors" aria-label="Next month">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <span className="text-lg font-semibold text-neutral-900 dark:text-white ml-2">{MONTH_NAMES[month]} {year}</span>
        </div>
        <a
          href="https://calendar.google.com/calendar/u/0/r/eventedit"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          + Add event
        </a>
      </div>

      <div className="flex gap-4">
        {/* Calendar grid */}
        <div className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-600 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-neutral-50 dark:bg-neutral-800/80">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-600">{d}</div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((w, wi) => (
            <div key={wi} className="grid grid-cols-7 divide-x divide-neutral-200 dark:divide-neutral-600 border-b last:border-b-0 border-neutral-200 dark:border-neutral-600">
              {w.map((day, di) => {
                if (day === null) {
                  return <div key={di} className="min-h-[90px] bg-neutral-50/50 dark:bg-neutral-800/30" />
                }
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const isToday = dateStr === todayStr
                const dayEvents = eventsByDate[dateStr] || []
                return (
                  <div key={di} className={`min-h-[90px] p-1.5 transition-colors ${
                    isToday
                      ? 'bg-brand-50/40 dark:bg-brand-900/10'
                      : 'bg-white dark:bg-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}>
                    <span className={`inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full ${
                      isToday
                        ? 'bg-brand-600 text-white'
                        : 'text-neutral-700 dark:text-neutral-300'
                    }`}>
                      {day}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const ongoing = isOngoing(ev)
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                            className={`w-full text-left block px-1.5 py-0.5 rounded text-xs truncate transition-colors ${
                              ongoing
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-semibold border border-green-300 dark:border-green-700'
                                : 'bg-brand-100/60 dark:bg-brand-900/30 text-brand-800 dark:text-brand-300 hover:bg-brand-200 dark:hover:bg-brand-800/50'
                            }`}
                            title={`${ev.summary} – ${formatEventTime(ev)}`}
                          >
                            <span className="flex items-center gap-1">
                              {ongoing && (
                                <span className="relative flex h-2 w-2 shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
                                </span>
                              )}
                              <span className="truncate">{formatEventTime(ev)} {ev.summary}</span>
                              {ongoing && <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400">ONGOING</span>}
                            </span>
                          </button>
                        )
                      })}
                      {dayEvents.length > 3 && (
                        <span className="block text-[10px] text-neutral-500 dark:text-neutral-400 px-1">+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Today's Agenda sidebar */}
        <div className="hidden lg:block w-64 shrink-0 space-y-3">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-2">
              Today's Agenda
            </h3>
            {todayEvents.length === 0 ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 py-2">No events today</p>
            ) : (
              <ul className="space-y-1.5">
                {todayEvents.map((ev) => {
                  const ongoing = isOngoing(ev)
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(ev)}
                        className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                          ongoing
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {ongoing && (
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
                            </span>
                          )}
                          <span className="font-medium text-neutral-900 dark:text-white truncate">{ev.summary}</span>
                          {ongoing && <span className="ml-auto text-[10px] font-bold text-green-600 dark:text-green-400">NOW</span>}
                        </div>
                        <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">{formatEventTimeRange(ev)}</p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Event Detail Popover */}
      {selectedEvent && (
        <div className="animate-fade-in rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 shadow-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-neutral-900 dark:text-white truncate">{selectedEvent.summary}</h4>
                {isOngoing(selectedEvent) && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700">
                    ONGOING
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                {new Date(selectedEvent.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-0.5">
                {formatEventTimeRange(selectedEvent)}
              </p>
              {selectedEvent.htmlLink && (
                <a
                  href={selectedEvent.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium"
                >
                  Open in Google Calendar →
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 shrink-0"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
