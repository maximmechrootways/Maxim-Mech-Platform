import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import {
    listSignableSubmissions,
    getSignableSubmissionById,
    createSignableSubmission,
    updateSignableSubmission,
} from '../services/signableSubmissionService'

const router = Router()

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const signableFormId = (req.query.signableFormId as string) || undefined
        const list = await listSignableSubmissions(req.user!.id, req.user!.role, { signableFormId })
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const submission = await getSignableSubmissionById(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(submission)
    } catch (e) {
        next(e)
    }
})

router.post('/', async (req, res, next) => {
    try {
        const result = await createSignableSubmission(req.user!.id, req.body)
        res.status(201).json(result)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const result = await updateSignableSubmission(req.params.id, req.user!.id, req.user!.role, req.body)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
