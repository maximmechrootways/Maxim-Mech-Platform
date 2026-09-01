import { api } from '@/api'

export interface GoogleCalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  htmlLink?: string
}

export interface CalendarStatus {
  connected: boolean
  configured?: boolean
}

export async function getCalendarStatus(): Promise<CalendarStatus> {
  const { data } = await api.get<CalendarStatus>('/google-calendar/status')
  return data
}

export async function getCalendarAuthUrl(): Promise<{ url: string }> {
  const { data } = await api.get<{ url: string }>('/google-calendar/auth-url')
  return data
}

export async function getCalendarEvents(params: { from: string; to: string }): Promise<GoogleCalendarEvent[]> {
  const { data } = await api.get<GoogleCalendarEvent[]>('/google-calendar/events', { params })
  return data
}

export async function disconnectCalendar(): Promise<void> {
  await api.post('/google-calendar/disconnect')
}

export async function createCalendarEvent(eventData: {
  summary: string
  description?: string
  startDateTime: string
  endDateTime: string
  timeZone?: string
}): Promise<GoogleCalendarEvent> {
  const { data } = await api.post<GoogleCalendarEvent>('/google-calendar/events', eventData)
  return data
}
