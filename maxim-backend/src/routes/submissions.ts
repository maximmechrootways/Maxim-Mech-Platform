import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import {
    listFormSubmissions,
    getFormSubmissionById,
    createFormSubmission,
    updateFormSubmission,
} from '../services/submissionService'

const router = Router()

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const status = (req.query.status as string) || undefined
        const templateId = (req.query.templateId as string) || undefined
        const list = await listFormSubmissions(userId, role, { status, templateId })
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const submission = await getFormSubmissionById(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(submission)
    } catch (e) {
        next(e)
    }
})

router.post('/', async (req, res, next) => {
    try {
        const result = await createFormSubmission(req.user!.id, req.user!.role, req.body)
        res.status(201).json(result)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const result = await updateFormSubmission(req.params.id, req.user!.id, req.user!.role, req.body)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
