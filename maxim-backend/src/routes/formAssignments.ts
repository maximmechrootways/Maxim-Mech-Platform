import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as formAssignmentService from '../services/formAssignmentService'

const router = Router()
router.use(authenticate)

// POST /form-assignments — create assignments (supervisor assigns to labourers)
router.post('/', async (req, res, next) => {
    try {
        const body = req.body as {
            templateId?: string
            assignedToUserIds?: string[]
            dueDate?: string
            recurrence?: string
            note?: string
        }
        if (!body.templateId || !Array.isArray(body.assignedToUserIds) || body.assignedToUserIds.length === 0) {
            return res.status(400).json({ error: 'templateId and assignedToUserIds (non-empty) are required' })
        }
        const result = await formAssignmentService.createAssignments(
            req.user!.id,
            req.user!.role,
            {
                templateId: body.templateId,
                assignedToUserIds: body.assignedToUserIds,
                dueDate: body.dueDate,
                recurrence: body.recurrence,
                note: body.note,
            }
        )
        res.status(201).json(result)
    } catch (e: any) {
        if (e.status) return res.status(e.status).json({ error: e.message })
        next(e)
    }
})

// GET /form-assignments — list assignments scoped by role
router.get('/', async (req, res, next) => {
    try {
        const query = {
            status: req.query.status as string | undefined,
            templateId: req.query.templateId as string | undefined,
            assignedToId: req.query.assignedToId as string | undefined,
        }
        const list = await formAssignmentService.listAssignments(req.user!.id, req.user!.role, query)
        res.json(list)
    } catch (e) {
        next(e)
    }
})

// GET /form-assignments/counts — dashboard widget counts
router.get('/counts', async (req, res, next) => {
    try {
        const counts = await formAssignmentService.getAssignmentCounts(req.user!.id, req.user!.role)
        res.json(counts)
    } catch (e) {
        next(e)
    }
})

// POST /form-assignments/:id/forward-hr — supervisor/owner forwards submission to HR
router.post('/:id/forward-hr', async (req, res, next) => {
    try {
        const result = await formAssignmentService.forwardAssignmentToHR(
            req.params.id,
            req.user!.id,
            req.user!.role
        )
        res.json(result)
    } catch (e: any) {
        if (e.status) return res.status(e.status).json({ error: e.message })
        next(e)
    }
})

// GET /form-assignments/:id — single assignment detail
router.get('/:id', async (req, res, next) => {
    try {
        const assignment = await formAssignmentService.getAssignmentById(req.params.id, req.user!.id, req.user!.role)
        res.json(assignment)
    } catch (e: any) {
        if (e.status) return res.status(e.status).json({ error: e.message })
        next(e)
    }
})

// PATCH /form-assignments/:id/submit — labourer links their submission
router.patch('/:id/submit', async (req, res, next) => {
    try {
        const { submissionId } = req.body as { submissionId: string }
        if (!submissionId) return res.status(400).json({ error: 'submissionId is required' })
        const result = await formAssignmentService.linkSubmission(req.params.id, submissionId, req.user!.id)
        res.json(result)
    } catch (e: any) {
        if (e.status) return res.status(e.status).json({ error: e.message })
        next(e)
    }
})

// PATCH /form-assignments/:id/review — supervisor reviews
router.patch('/:id/review', async (req, res, next) => {
    try {
        const { action, comment } = req.body as { action: 'reviewed' | 'resubmission_required'; comment?: string }
        if (!action || !['reviewed', 'resubmission_required'].includes(action)) {
            return res.status(400).json({ error: 'action must be "reviewed" or "resubmission_required"' })
        }
        const result = await formAssignmentService.reviewAssignment(req.params.id, req.user!.id, req.user!.role, { action, comment })
        res.json(result)
    } catch (e: any) {
        if (e.status) return res.status(e.status).json({ error: e.message })
        next(e)
    }
})

export default router
