import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { prisma } from '../lib/prisma'
import * as notificationService from '../services/notificationService'
import { enqueueTestFormsApprovalDigestForUser } from '../services/formsApprovalDigestService'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await notificationService.listForUser(req.user!.id, {
            unreadOnly: req.query.unreadOnly as string,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        })
        res.json(list)
    } catch (e) { next(e) }
})

router.get('/preferences/email', async (req, res, next) => {
    try {
        const pref = await notificationService.getEmailPreference(req.user!.id)
        res.json(pref)
    } catch (e) { next(e) }
})

router.patch('/preferences/email', async (req, res, next) => {
    try {
        const raw = req.body?.emailEnabled
        if (typeof raw !== 'boolean') {
            return res.status(400).json({ error: 'emailEnabled must be a boolean' })
        }
        const emailEnabled = raw
        const pref = await notificationService.setEmailPreference(req.user!.id, emailEnabled)
        res.json(pref)
    } catch (e) { next(e) }
})

router.post('/read-all', async (req, res, next) => {
    try {
        await notificationService.markAllRead(req.user!.id)
        res.json({ message: 'OK' })
    } catch (e) { next(e) }
})

/**
 * HR/Owner: enqueue a [TEST] copy of the weekday digest to your email.
 * Authorize by **database** role (not JWT `role`) so it still works if the session “view role” was switched in the UI.
 */
router.post('/test-forms-digest', async (req, res, next) => {
    try {
        const account = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { id: true, role: true, isActive: true },
        })
        if (!account || (account.role !== 'owner' && account.role !== 'hr')) {
            return res.status(403).json({ error: 'Only HR and Owner can send a test digest.' })
        }
        if (!account.isActive) {
            return res.status(400).json({ error: 'Account is not active.' })
        }
        const result = await enqueueTestFormsApprovalDigestForUser(account.id)
        res.json(result)
    } catch (e) { next(e) }
})

router.post('/:id/read', async (req, res, next) => {
    try {
        const item = await notificationService.markRead(req.params.id, req.user!.id)
        res.json(item)
    } catch (e) { next(e) }
})

export default router
