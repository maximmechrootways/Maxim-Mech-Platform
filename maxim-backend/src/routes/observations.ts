import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as observationService from '../services/observationService'

const router = Router()
router.use(authenticate)

function userName(req: any) {
    const u = req.user
    return (u && ((u.firstName || '') + ' ' + (u.lastName || '')).trim()) || u?.email || 'Unknown'
}

router.get('/', async (req, res, next) => {
    try {
        const list = await observationService.listObservations(req.user!.role, { type: req.query.type as string, siteId: req.query.siteId as string })
        res.json(list)
    } catch (e) { next(e) }
})
router.get('/:id', async (req, res, next) => {
    try {
        const item = await observationService.getObservationById(req.params.id, req.user!.role)
        res.json(item)
    } catch (e) { next(e) }
})
router.post('/', async (req, res, next) => {
    try {
        const item = await observationService.createObservation(req.user!.id, req.user!.role, userName(req), req.body)
        res.status(201).json(item)
    } catch (e) { next(e) }
})
router.patch('/:id', async (req, res, next) => {
    try {
        const item = await observationService.updateObservation(req.params.id, req.user!.role, req.body)
        res.json(item)
    } catch (e) { next(e) }
})
router.delete('/:id', async (req, res, next) => {
    try {
        await observationService.deleteObservation(req.params.id, req.user!.role)
        res.json({ message: 'Deleted' })
    } catch (e) { next(e) }
})
export default router
