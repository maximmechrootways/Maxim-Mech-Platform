/**
 * Google Calendar connection per user. Requires env:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *   GOOGLE_CALENDAR_REDIRECT_URI (e.g. http://localhost:3000/google-calendar/callback),
 *   FRONTEND_URL (for post-OAuth redirect).
 */
import { google } from 'googleapis'
import { prisma } from '../lib/prisma'
import { signCalendarConnectState, verifyCalendarConnectState } from '../utils/jwt'

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || ''
const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'

function isConfigured(): boolean {
    return Boolean(clientId && clientSecret)
}

function getOAuth2Client() {
    if (!isConfigured()) throw { status: 503, message: 'Google Calendar integration is not configured' }
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri || undefined)
}

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events']

/** Build Google OAuth URL; state = JWT containing userId (caller must be authenticated). */
export function getAuthUrl(userId: string): string {
    const oauth2 = getOAuth2Client()
    const state = signCalendarConnectState(userId)
    return oauth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state })
}

/** Exchange code for tokens and store refresh_token for the user in state JWT. Redirect URL for frontend. */
export async function handleCallback(code: string, state: string): Promise<string> {
    const { userId } = verifyCalendarConnectState(state)
    const oauth2 = getOAuth2Client()
    const { tokens } = await oauth2.getToken(code)
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token')
    await prisma.user.update({
        where: { id: userId },
        data: { googleCalendarRefreshToken: tokens.refresh_token, googleCalendarConnectedAt: new Date() },
    })
    return `${frontendOrigin}/hr/todo?calendar=connected`
}

/** Get connection status. When not configured, returns connected: false so the page still loads. */
export async function getStatus(userId: string): Promise<{ connected: boolean; configured?: boolean }> {
    if (!isConfigured()) return { connected: false, configured: false }
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { googleCalendarRefreshToken: true },
    })
    if (!user?.googleCalendarRefreshToken) return { connected: false, configured: true }
    return { connected: true, configured: true }
}

/** List calendar events for the user in the given range (ISO date strings). */
export async function listEvents(
    userId: string,
    from: string,
    to: string
): Promise<{ id: string; summary: string; start: string; end: string; htmlLink?: string }[]> {
    console.log('[GoogleCal] listEvents called', { userId, from, to, configured: isConfigured() })
    if (!isConfigured()) return []
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { googleCalendarRefreshToken: true },
    })
    console.log('[GoogleCal] user has refresh token:', !!user?.googleCalendarRefreshToken)
    if (!user?.googleCalendarRefreshToken) return []
    try {
        const oauth2 = getOAuth2Client()
        oauth2.setCredentials({ refresh_token: user.googleCalendarRefreshToken })
        const calendar = google.calendar({ version: 'v3', auth: oauth2 })
        const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date(from).toISOString(),
            timeMax: new Date(to).toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        })
        const items = res.data.items || []
        console.log('[GoogleCal] fetched events count:', items.length)
        return items.map((ev) => ({
            id: ev.id ?? '',
            summary: ev.summary ?? '(No title)',
            start: ev.start?.dateTime ?? ev.start?.date ?? '',
            end: ev.end?.dateTime ?? ev.end?.date ?? '',
            htmlLink: ev.htmlLink ?? undefined,
        }))
    } catch (err: any) {
        console.error('[GoogleCal] error fetching events:', err?.message, err?.response?.data)
        throw err
    }
}

/** Disconnect Google Calendar for the user. */
export async function disconnect(userId: string): Promise<void> {
    await prisma.user.update({
        where: { id: userId },
        data: { googleCalendarRefreshToken: null, googleCalendarConnectedAt: null },
    })
}

/** Create a new event on the user's primary Google Calendar. */
export async function createEvent(
    userId: string,
    eventData: {
        summary: string
        description?: string
        startDateTime: string   // ISO string
        endDateTime: string     // ISO string
        timeZone?: string
    }
): Promise<{ id: string; summary: string; start: string; end: string; htmlLink?: string }> {
    if (!isConfigured()) throw { status: 503, message: 'Google Calendar integration is not configured' }
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { googleCalendarRefreshToken: true },
    })
    if (!user?.googleCalendarRefreshToken) throw { status: 400, message: 'Google Calendar is not connected for this user' }
    const oauth2 = getOAuth2Client()
    oauth2.setCredentials({ refresh_token: user.googleCalendarRefreshToken })
    const calendar = google.calendar({ version: 'v3', auth: oauth2 })
    const tz = eventData.timeZone || 'America/Toronto'
    const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: eventData.summary,
            description: eventData.description,
            start: { dateTime: eventData.startDateTime, timeZone: tz },
            end: { dateTime: eventData.endDateTime, timeZone: tz },
        },
    })
    const ev = res.data
    return {
        id: ev.id ?? '',
        summary: ev.summary ?? eventData.summary,
        start: ev.start?.dateTime ?? ev.start?.date ?? eventData.startDateTime,
        end: ev.end?.dateTime ?? ev.end?.date ?? eventData.endDateTime,
        htmlLink: ev.htmlLink ?? undefined,
    }
}
