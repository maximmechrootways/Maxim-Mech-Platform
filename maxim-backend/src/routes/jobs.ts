import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { validateRequest } from '../utils/validate'
import {
    listJobs,
    getMyJobs,
    createJob,
    getJobById,
    updateJob,
    deleteJob,
    addSupervisor,
    removeSupervisor,
    addLabourer,
    removeLabourer,
    addSubcontractor,
    removeSubcontractor,
    checkIn,
    resetCheckIn,
} from '../services/jobService'
import {
    createJobSchema,
    updateJobSchema,
    addSupervisorSchema,
    addLabourerSchema,
    addSubcontractorSchema,
    checkInSchema,
    resetCheckInSchema,
    listJobsQuerySchema,
} from '../schemas/jobSchemas'
import projectDocumentFolderRoutes from './projectDocumentFolders'

const router = Router()

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const parsed = listJobsQuerySchema.safeParse(req.query)
        const query = parsed.success ? parsed.data : {}
        const jobs = await listJobs(userId, role, query)
        res.status(200).json(jobs)
    } catch (e) {
        next(e)
    }
})

router.get('/my-jobs', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const jobs = await getMyJobs(userId)
        res.status(200).json(jobs)
    } catch (e) {
        next(e)
    }
})

router.post('/', validateRequest(createJobSchema), async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const job = await createJob(userId, role, req.body)
        res.status(201).json(job)
    } catch (e) {
        next(e)
    }
})

router.use('/:id/document-folders', projectDocumentFolderRoutes)

router.get('/:id', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const job = await getJobById(req.params.id, userId, role)
        res.status(200).json(job)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', validateRequest(updateJobSchema), async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const job = await updateJob(req.params.id, userId, role, req.body)
        res.status(200).json(job)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        await deleteJob(req.params.id, userId, role)
        res.status(200).json({ message: 'Job deleted' })
    } catch (e) {
        next(e)
    }
})

router.post('/:id/supervisors', validateRequest(addSupervisorSchema), async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const result = await addSupervisor(req.params.id, userId, role, req.body)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/supervisors/:userId', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const result = await removeSupervisor(req.params.id, req.params.userId, userId, role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/labourers', validateRequest(addLabourerSchema), async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const result = await addLabourer(req.params.id, userId, role, req.body)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/labourers/:userId', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const result = await removeLabourer(req.params.id, req.params.userId, userId, role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/subcontractors', validateRequest(addSubcontractorSchema), async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const result = await addSubcontractor(req.params.id, userId, role, req.body)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/subcontractors/:subcontractorId', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const result = await removeSubcontractor(req.params.id, req.params.subcontractorId, userId, role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/check-in', validateRequest(checkInSchema), async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const result = await checkIn(req.params.id, userId, role, req.body)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/check-in/reset', validateRequest(resetCheckInSchema), async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const result = await resetCheckIn(req.params.id, userId, role, req.body)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
