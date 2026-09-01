import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { requireRole } from '../middleware/requireRole'
import { prisma } from '../lib/prisma'
import { generateInviteCode, listInviteCodes, regenerateInviteCode } from '../services/inviteService'
import { enqueueInviteCodeEmail } from '../services/inviteEmailService'

const router = Router()

router.use(authenticate)

// Generate a new invite code for an employee email (HR/owner only)
router.post('/generate', requireRole('hr', 'owner'), async (req, res, next) => {
    try {
        const { email } = req.body
        if (!email) {
            return res.status(400).json({ error: 'Email is required' })
        }
        const result = await generateInviteCode(req.user!.id, email)
        res.status(201).json(result)
    } catch (e) {
        next(e)
    }
})

// Regenerate invite code (e.g. if original expired)
router.post('/regenerate', requireRole('hr', 'owner'), async (req, res, next) => {
    try {
        const { email } = req.body
        if (!email) {
            return res.status(400).json({ error: 'Email is required' })
        }
        const normalizedEmail = String(email).trim().toLowerCase()
        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, email: true, firstName: true, isActive: true },
        })
        if (!user) {
            return res.status(404).json({ error: 'No user found with this email address' })
        }
        if (!user.isActive) {
            return res.status(400).json({ error: 'This account is deactivated' })
        }

        const result = await regenerateInviteCode(req.user!.id, normalizedEmail)
        const emailResult = await enqueueInviteCodeEmail({
            userId: user.id,
            toEmail: user.email,
            inviteCode: result.code,
            expiresAt: result.expiresAt,
            firstName: user.firstName,
            reason: 'hr_regenerate',
        })

        res.status(201).json({
            ...result,
            emailEnqueued: emailResult.enqueued,
        })
    } catch (e) {
        next(e)
    }
})

// List all invite codes (HR/owner only)
router.get('/list', requireRole('hr', 'owner'), async (_req, res, next) => {
    try {
        const codes = await listInviteCodes()
        res.status(200).json(codes)
    } catch (e) {
        next(e)
    }
})

export default router
