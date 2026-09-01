import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as hazardService from '../services/hazardService'

const router = Router()
router.use(authenticate)

function userName(req: any) {
    const u = req.user
    return (u && ((u.firstName || '') + ' ' + (u.lastName || '')).trim()) || u?.email || 'Unknown'
}

router.get('/', async (req, res, next) => {
    try {
        const list = await hazardService.listHazards(req.user!.role, { status: req.query.status as string, siteId: req.query.siteId as string })
        res.json(list)
    } catch (e) { next(e) }
})
router.get('/:id', async (req, res, next) => {
    try {
        const item = await hazardService.getHazardById(req.params.id, req.user!.role)
        res.json(item)
    } catch (e) { next(e) }
})
router.post('/', async (req, res, next) => {
    try {
        const item = await hazardService.createHazard(req.user!.id, req.user!.role, userName(req), req.body)
        res.status(201).json(item)
    } catch (e) { next(e) }
})
router.patch('/:id', async (req, res, next) => {
    try {
        const item = await hazardService.updateHazard(req.params.id, req.user!.role, req.body)
        res.json(item)
    } catch (e) { next(e) }
})
router.delete('/:id', async (req, res, next) => {
    try {
        await hazardService.deleteHazard(req.params.id, req.user!.role)
        res.json({ message: 'Deleted' })
    } catch (e) { next(e) }
})
export default router
