import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { listDailyForms, createFormAssignments, passAlongFormAssignment, getAssignmentChain } from '../services/signableSubmissionService'
import { getMyTeamMembers } from '../services/jobService'

const router = Router()

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await listDailyForms(req.user!.id, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/my-team', async (req, res, next) => {
    try {
        const role = req.user!.role
        if (role !== 'supervisor' && role !== 'owner' && role !== 'hr') {
            return res.status(403).json({ error: 'Only supervisors, Owner, or HR can list team members' })
        }
        const team = await getMyTeamMembers(req.user!.id, role)
        res.status(200).json(team)
    } catch (e) {
        next(e)
    }
})

router.post('/assign', async (req, res, next) => {
    try {
        const body = req.body as {
            signableFormTemplateId?: string
            assignedToUserIds?: string[]
            signatories?: { userId: string; order: number }[]
            dueDate?: string
            schedule?: 'daily' | 'monthly' | 'yearly'
        }
        const signableFormTemplateId = body.signableFormTemplateId
        const assignedToUserIds = Array.isArray(body.assignedToUserIds) ? body.assignedToUserIds : []
        const signatories = body.signatories as { userId: string; order: number }[] | undefined
        const dueDate = body.dueDate ?? new Date().toISOString().slice(0, 10)
        const schedule = body.schedule ?? 'daily'
        if (!signableFormTemplateId || (assignedToUserIds.length === 0 && (!signatories || signatories.length === 0))) {
            return res.status(400).json({ error: 'signableFormTemplateId and assignedToUserIds/signatories are required' })
        }
        const result = await createFormAssignments(req.user!.id, req.user!.role, {
            signableFormTemplateId,
            assignedToUserIds,
            signatories,
            dueDate,
            schedule,
        })
        res.status(201).json(result)
    } catch (e: unknown) {
        const err = e as { status?: number; message?: string }
        if (err.status) return res.status(err.status).json({ error: err.message })
        next(e)
    }
})

router.post('/pass', async (req, res, next) => {
    try {
        const body = req.body as {
            assignmentId: string
            toUserId: string
            note?: string
            dueDate?: string
        }
        if (!body.assignmentId || !body.toUserId) {
            return res.status(400).json({ error: 'assignmentId and toUserId are required' })
        }
        const result = await passAlongFormAssignment(req.user!.id, body)
        res.status(201).json({ assignment: result })
    } catch (e: unknown) {
        const err = e as { status?: number; message?: string }
        if (err.status) return res.status(err.status).json({ error: err.message })
        next(e)
    }
})

router.get('/assignments/:id', async (req, res, next) => {
    try {
        const { prisma } = await import('../lib/prisma')
        const assignment = await prisma.formAssignment.findUnique({
            where: { id: req.params.id },
            include: {
                signableFormTemplate: true,
                signatories: {
                    orderBy: { order: 'asc' },
                    include: { user: { select: { firstName: true, lastName: true, role: true } } }
                }
            }
        })
        if (!assignment) return res.status(404).json({ error: 'Not found' })
        res.status(200).json(assignment)
    } catch (e) {
        next(e)
    }
})

router.get('/assignments/:id/chain', async (req, res, next) => {
    try {
        const chain = await getAssignmentChain(req.params.id)
        res.status(200).json({ chain })
    } catch (e) {
        next(e)
    }
})

router.post('/:id/forward-hr', async (req, res, next) => {
    try {
        const assignmentId = req.params.id
        const userRole = req.user!.role
        
        if (userRole !== 'supervisor' && userRole !== 'owner') {
            return res.status(403).json({ error: 'Only supervisors and owners can forward to HR' })
        }

        const { prisma } = await import('../lib/prisma')
        const assignment = await prisma.formAssignment.findUnique({
            where: { id: assignmentId },
            include: { signableFormTemplate: true }
        })

        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' })
        }

        if (assignment.chainStatus !== 'completed') {
            return res.status(400).json({ error: 'Form is not yet fully signed' })
        }

        await prisma.formAssignment.update({
            where: { id: assignmentId },
            data: {
                chainStatus: 'forwarded_hr',
                forwardedToHRAt: new Date(),
                forwardedToHRById: req.user!.id,
            }
        })

        const hrUsers = await prisma.user.findMany({
            where: { role: 'hr' },
            select: { id: true },
        })

        const notificationService = await import('../services/notificationService')
        
        // Fetch user for name
        const currentUser = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { firstName: true },
        })
        const senderName = currentUser ? currentUser.firstName : 'A supervisor'
        
        for (const hr of hrUsers) {
            await notificationService.createNotification({
                userId: hr.id,
                title: 'Signed form forwarded for filing',
                body: `${senderName} has forwarded "${assignment.signableFormTemplate.name}" — fully signed by all workers.`,
                type: 'info',
                linkTo: `/daily-forms/hr/${assignmentId}`,
                emailPreferenceKey: 'forms_pending',
            }).catch(() => {})
        }

        res.status(200).json({ success: true })
    } catch (e: unknown) {
        next(e)
    }
})

router.post('/:id/sequential-sign', async (req, res, next) => {
    try {
        const assignmentId = req.params.id
        const userId = req.user!.id
        const { signatureUrl, fieldValues } = req.body

        const { prisma } = await import('../lib/prisma')
        
        // Fetch user for name
        const currentUser = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { firstName: true, lastName: true },
        })
        const signatoryName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Someone'

        // 1. Mark this signatory as signed
        await prisma.formSignatory.updateMany({
            where: { assignmentId, userId },
            data: {
                status: 'signed',
                signedAt: new Date(),
                signatureUrl,
                fieldValues,
                signatoryName,
            }
        })

        // 2. Check if all signatories are done
        const allSignatories = await prisma.formSignatory.findMany({
            where: { assignmentId }
        })
        const allSigned = allSignatories.every(s => s.status === 'signed')

        const { generateFinalSignedPdf, notifyNextSignatory } = await import('../lib/pdf-signer')

        if (allSigned) {
            // Generate the final merged PDF with ALL signatures
            const finalPdfUrl = await generateFinalSignedPdf(assignmentId)

            await prisma.formAssignment.update({
                where: { id: assignmentId },
                data: {
                    chainStatus: 'completed',
                    status: 'completed',
                    finalSignedPdfUrl: finalPdfUrl,
                }
            })

            const { routeBackToSupervisor } = await import('../lib/pdf-signer')
            // Route back to supervisor — notify them
            await routeBackToSupervisor(assignmentId)
        } else {
            // More workers remain — trigger the next one
            await notifyNextSignatory(assignmentId)
        }

        res.status(200).json({ success: true, allSigned })
    } catch (e) {
        next(e)
    }
})

export default router
