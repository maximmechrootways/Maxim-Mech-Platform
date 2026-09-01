import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as googleCalendarService from '../services/googleCalendarService'

const router = Router()

/** Return Google OAuth URL so the frontend can redirect (user must be logged in). */
router.get('/auth-url', authenticate, (req, res, next) => {
    try {
        const url = googleCalendarService.getAuthUrl(req.user!.id)
        res.json({ url })
    } catch (e) {
        next(e)
    }
})

/** Redirect to Google OAuth (user must be logged in). */
router.get('/connect', authenticate, (req, res, next) => {
    try {
        const url = googleCalendarService.getAuthUrl(req.user!.id)
        res.redirect(302, url)
    } catch (e) {
        next(e)
    }
})

/** Google redirects here with ?code=...&state=... (no auth middleware). */
router.get('/callback', async (req, res, next) => {
    try {
        const code = req.query.code as string
        const state = req.query.state as string
        if (!code || !state) {
            const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'
            return res.redirect(302, `${frontendOrigin}/hr/todo?calendar=error`)
        }
        const redirectUrl = await googleCalendarService.handleCallback(code, state)
        res.redirect(302, redirectUrl)
    } catch (e) {
        const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'
        res.redirect(302, `${frontendOrigin}/hr/todo?calendar=error`)
    }
})

/** Connection status (connected or not). */
router.get('/status', authenticate, async (req, res, next) => {
    try {
        const status = await googleCalendarService.getStatus(req.user!.id)
        res.json(status)
    } catch (e) {
        next(e)
    }
})

/** List events in range (from & to as ISO date or datetime). */
router.get('/events', authenticate, async (req, res, next) => {
    try {
        const from = (req.query.from as string) || new Date().toISOString()
        const to = (req.query.to as string) || new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()
        const events = await googleCalendarService.listEvents(req.user!.id, from, to)
        res.json(events)
    } catch (e) {
        next(e)
    }
})

/** Disconnect Google Calendar. */
router.post('/disconnect', authenticate, async (req, res, next) => {
    try {
        await googleCalendarService.disconnect(req.user!.id)
        res.json({ message: 'Disconnected' })
    } catch (e) {
        next(e)
    }
})
/** Create a new event on the user's Google Calendar. */
router.post('/events', authenticate, async (req, res, next) => {
    try {
        const { summary, description, startDateTime, endDateTime, timeZone } = req.body
        if (!summary || !startDateTime || !endDateTime) {
            return res.status(400).json({ error: 'summary, startDateTime, and endDateTime are required' })
        }
        const event = await googleCalendarService.createEvent(req.user!.id, {
            summary,
            description,
            startDateTime,
            endDateTime,
            timeZone,
        })
        res.status(201).json(event)
    } catch (e) {
        next(e)
    }
})

export default router
