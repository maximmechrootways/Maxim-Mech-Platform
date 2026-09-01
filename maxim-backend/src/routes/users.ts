import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authenticate } from '../middleware/authenticate'
import { requireRole } from '../middleware/requireRole'
import { listUsersForAssignment, listSupervisors, listAllUsersForAdmin, updateUserForAdmin, deleteUserForAdmin } from '../services/userService'
import { prisma } from '../lib/prisma'
import { generateInviteCode } from '../services/inviteService'
import * as auditLogService from '../services/auditLogService'
import { anyNotificationEmailCategoryEnabled, mergeUiPreferences, normalizeUiPreferences } from '../services/uiPreferencesService'

const router = Router()

router.use(authenticate)

const kissOptionsSchema = z.object({
    largeTouchTargets: z.boolean().optional(),
    guidedStepMode: z.boolean().optional(),
    simplifiedNav: z.boolean().optional(),
    showOnlyRequiredFirst: z.boolean().optional(),
}).strict()

const notificationPreferencesPatchSchema = z.object({
    forms_pending: z.boolean().optional(),
    incidents: z.boolean().optional(),
    digest: z.boolean().optional(),
    digest_hr_owner_8am: z.boolean().optional(),
    signatures: z.boolean().optional(),
    incidents_site: z.boolean().optional(),
    signature_required: z.boolean().optional(),
    announcements: z.boolean().optional(),
}).strict()

const uiPreferencesPatchSchema = z.object({
    kissModeEnabled: z.boolean().optional(),
    kissPresetName: z.string().trim().max(100).nullable().optional(),
    kissOptions: kissOptionsSchema.optional(),
    notificationPreferences: notificationPreferencesPatchSchema.optional(),
}).strict()

// HR/Owner creates a new employee → auto-creates User (no password) + invite code
router.post('/', requireRole('hr', 'owner'), async (req, res, next) => {
    try {
        const { email, firstName, lastName, role } = req.body
        if (!email || !firstName || !lastName) {
            return res.status(400).json({ error: 'email, firstName, and lastName are required' })
        }

    const existing = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true },
        })
        if (existing) {
            return res.status(409).json({ error: 'A user with this email already exists' })
        }

        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                firstName,
                lastName,
                role: role || 'labourer',
                hasCompletedSetup: false,
            },
            select: { id: true, email: true, firstName: true, lastName: true, role: true }
        })

        // Auto-generate invite code
        const invite = await generateInviteCode(req.user!.id, user.email)

        res.status(201).json({ user, inviteCode: invite.code, expiresAt: invite.expiresAt })
    } catch (e) {
        next(e)
    }
})

router.get('/admin', async (req, res, next) => {
    try {
        const users = await listAllUsersForAdmin(req.user!.role)
        res.status(200).json(users)
    } catch (e) { next(e) }
})

router.get('/', async (req, res, next) => {
    try {
        const role = req.user!.role
        const users = await listUsersForAssignment(role)
        res.status(200).json(users)
    } catch (e) {
        next(e)
    }
})

router.get('/supervisors', async (req, res, next) => {
    try {
        const role = req.user!.role
        const users = await listSupervisors(role)
        res.status(200).json(users)
    } catch (e) {
        next(e)
    }
})

router.get('/me/preferences', async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { uiPreferences: true },
        })
        if (!user) return res.status(404).json({ error: 'User not found' })

        const current = (user.uiPreferences && typeof user.uiPreferences === 'object')
            ? (user.uiPreferences as Record<string, unknown>)
            : {}
        const payload = normalizeUiPreferences(current)
        res.status(200).json(payload)
    } catch (e) {
        next(e)
    }
})

router.patch('/me/preferences', async (req, res, next) => {
    try {
        const parsed = uiPreferencesPatchSchema.safeParse(req.body ?? {})
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid preferences payload', details: parsed.error.flatten() })
        }

        const currentUser = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { uiPreferences: true },
        })
        if (!currentUser) return res.status(404).json({ error: 'User not found' })

        const nextPreferences = mergeUiPreferences(currentUser.uiPreferences, parsed.data)

        const data: Prisma.UserUpdateInput = {
            uiPreferences: nextPreferences as unknown as Prisma.InputJsonValue,
        }
        if (parsed.data.notificationPreferences !== undefined) {
            data.emailNotificationsEnabled = anyNotificationEmailCategoryEnabled(nextPreferences)
        }

        const updated = await prisma.user.update({
            where: { id: req.user!.id },
            data,
            select: { uiPreferences: true },
        })
        res.status(200).json(updated.uiPreferences)
    } catch (e) {
        next(e)
    }
})

router.get('/:id/preferences', requireRole('hr', 'owner'), async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { uiPreferences: true },
        })
        if (!user) return res.status(404).json({ error: 'User not found' })

        const current = (user.uiPreferences && typeof user.uiPreferences === 'object')
            ? (user.uiPreferences as Record<string, unknown>)
            : {}
        const payload = normalizeUiPreferences(current)
        res.status(200).json(payload)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id/preferences', requireRole('hr', 'owner'), async (req, res, next) => {
    try {
        const parsed = uiPreferencesPatchSchema.safeParse(req.body ?? {})
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid preferences payload', details: parsed.error.flatten() })
        }

        const currentUser = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { uiPreferences: true },
        })
        if (!currentUser) return res.status(404).json({ error: 'User not found' })

        const nextPreferences = mergeUiPreferences(currentUser.uiPreferences, parsed.data)

        const data: Prisma.UserUpdateInput = {
            uiPreferences: nextPreferences as unknown as Prisma.InputJsonValue,
        }
        if (parsed.data.notificationPreferences !== undefined) {
            data.emailNotificationsEnabled = anyNotificationEmailCategoryEnabled(nextPreferences)
        }

        const updated = await prisma.user.update({
            where: { id: req.params.id },
            data,
            select: { uiPreferences: true },
        })
        res.status(200).json(updated.uiPreferences)
    } catch (e) {
        next(e)
    }
})

// HR/Owner: update employee info or deactivate (verification flow can be added later)
router.patch('/:id', requireRole('hr', 'owner'), async (req, res, next) => {
    try {
        const targetId = req.params.id
        const body = req.body as {
            email?: string
            firstName?: string
            lastName?: string
            phone?: string
            jobTitle?: string
            department?: string
            role?: string
            employmentStatus?: string
            hireDate?: string | null
            birthday?: string | null
            emergencyContact1Name?: string | null
            emergencyContact1Phone?: string | null
            emergencyContact1Relationship?: string | null
            emergencyContact2Name?: string | null
            emergencyContact2Phone?: string | null
            emergencyContact2Relationship?: string | null
            emergencyNotes?: string | null
            onLeaveStartedAt?: string | null
            terminatedAt?: string | null
            isActive?: boolean
        }
        const user = await updateUserForAdmin(req.user!.role, targetId, {
            email: body.email,
            firstName: body.firstName,
            lastName: body.lastName,
            phone: body.phone,
            jobTitle: body.jobTitle,
            department: body.department,
            birthday: body.birthday,
            emergencyContact1Name: body.emergencyContact1Name,
            emergencyContact1Phone: body.emergencyContact1Phone,
            emergencyContact1Relationship: body.emergencyContact1Relationship,
            emergencyContact2Name: body.emergencyContact2Name,
            emergencyContact2Phone: body.emergencyContact2Phone,
            emergencyContact2Relationship: body.emergencyContact2Relationship,
            emergencyNotes: body.emergencyNotes,
            role: body.role,
            employmentStatus: body.employmentStatus,
            hireDate: body.hireDate,
            onLeaveStartedAt: body.onLeaveStartedAt,
            terminatedAt: body.terminatedAt,
            isActive: body.isActive,
        })
        const actor = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } })
        const userName = actor ? `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || (req.user as any).email : (req.user as any).email
        await auditLogService.writeAuditLog({
            userId: req.user!.id,
            userName,
            action: 'update',
            entityType: 'user',
            entityId: targetId,
            entityLabel: user.name,
            linkTo: `/employees/${targetId}`,
        }).catch(() => {})
        res.status(200).json(user)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', requireRole('hr', 'owner'), async (req, res, next) => {
    try {
        const targetId = req.params.id
        const deleted = await deleteUserForAdmin(req.user!.role, req.user!.id, targetId)

        const actor = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } })
        const userName = actor ? `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || (req.user as any).email : (req.user as any).email
        await auditLogService.writeAuditLog({
            userId: req.user!.id,
            userName,
            action: 'delete',
            entityType: 'user',
            entityId: targetId,
            entityLabel: deleted.name,
            linkTo: '/employees',
        }).catch(() => { })

        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

export default router
