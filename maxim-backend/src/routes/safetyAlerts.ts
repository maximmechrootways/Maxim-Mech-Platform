import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as safetyAlertService from '../services/safetyAlertService'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await safetyAlertService.listAlerts(req.user!.role, {
            activeOnly: req.query.activeOnly as string,
        })
        res.json(list)
    } catch (e) { next(e) }
})

router.get('/:id', async (req, res, next) => {
    try {
        const item = await safetyAlertService.getAlertById(req.params.id)
        res.json(item)
    } catch (e) { next(e) }
})

router.post('/', async (req, res, next) => {
    try {
        const item = await safetyAlertService.createAlert(req.user!.id, req.user!.role, req.body)
        res.status(201).json(item)
    } catch (e) { next(e) }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const item = await safetyAlertService.updateAlert(req.params.id, req.user!.role, req.body)
        res.json(item)
    } catch (e) { next(e) }
})

router.delete('/:id', async (req, res, next) => {
    try {
        await safetyAlertService.deleteAlert(req.params.id, req.user!.role)
        res.json({ message: 'Deleted' })
    } catch (e) { next(e) }
})

router.post('/:id/read', async (req, res, next) => {
    try {
        const item = await safetyAlertService.markAlertRead(req.params.id, req.user!.id)
        res.json(item)
    } catch (e) { next(e) }
})

router.post('/:id/acknowledge', async (req, res, next) => {
    try {
        const item = await safetyAlertService.acknowledgeAlert(req.params.id, req.user!.id)
        res.json(item)
    } catch (e) { next(e) }
})

export default router
