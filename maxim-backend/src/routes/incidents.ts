import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as incidentService from '../services/incidentService'

const router = Router()
router.use(authenticate)

function userName(req: any) {
    const u = req.user as any
    return `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.email || 'Unknown'
}

router.get('/', async (req, res, next) => {
    try {
        const list = await incidentService.listIncidents(req.user!.role, {
            status: req.query.status as string,
            siteId: req.query.siteId as string,
        })
        res.json(list)
    } catch (e) { next(e) }
})

router.get('/:id', async (req, res, next) => {
    try {
        const item = await incidentService.getIncidentById(req.params.id, req.user!.role)
        res.json(item)
    } catch (e) { next(e) }
})

router.post('/', async (req, res, next) => {
    try {
        const item = await incidentService.createIncident(req.user!.id, req.user!.role, userName(req), req.body)
        res.status(201).json(item)
    } catch (e) { next(e) }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const item = await incidentService.updateIncident(req.params.id, req.user!.role, req.body, { userId: req.user!.id, userName: userName(req) })
        res.json(item)
    } catch (e) { next(e) }
})

router.delete('/:id', async (req, res, next) => {
    try {
        await incidentService.deleteIncident(req.params.id, req.user!.role, { userId: req.user!.id, userName: userName(req) })
        res.json({ message: 'Deleted' })
    } catch (e) { next(e) }
})

export default router
