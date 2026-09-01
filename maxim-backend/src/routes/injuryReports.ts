import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import {
    listInjuryReports,
    getInjuryReportById,
    createInjuryReport,
    updateInjuryReport,
    deleteInjuryReport,
    getRootCauseByLinked,
    upsertRootCause,
} from '../services/injuryReportService'

const router = Router()

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const userName = `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() || (req.user as any).email
        const status = (req.query.status as string) || undefined
        const jobId = (req.query.jobId as string) || undefined
        const subcontractorId = (req.query.subcontractorId as string) || undefined
        const list = await listInjuryReports(userId, role, { status, jobId, subcontractorId })
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const report = await getInjuryReportById(req.params.id, req.user!.role)
        res.status(200).json(report)
    } catch (e) {
        next(e)
    }
})

router.post('/', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const userName = `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() || (req.user as any).email
        const report = await createInjuryReport(userId, role, userName, req.body)
        res.status(201).json(report)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const report = await updateInjuryReport(req.params.id, req.user!.role, req.body)
        res.status(200).json(report)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        await deleteInjuryReport(req.params.id, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

// Root cause: get by linked injury
router.get('/:id/root-cause', async (req, res, next) => {
    try {
        const root = await getRootCauseByLinked('injury', req.params.id, req.user!.role)
        if (!root) return res.status(404).json({ error: 'Root cause not found' })
        res.status(200).json(root)
    } catch (e) {
        next(e)
    }
})

// Root cause: create or update
router.put('/:id/root-cause', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const userName = `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() || (req.user as any).email
        const root = await upsertRootCause(userId, role, userName, {
            linkedType: 'injury',
            linkedId: req.params.id,
            immediateCause: req.body.immediateCause,
            contributingCauses: req.body.contributingCauses,
            underlyingCause: req.body.underlyingCause,
        })
        res.status(200).json(root)
    } catch (e) {
        next(e)
    }
})

export default router
