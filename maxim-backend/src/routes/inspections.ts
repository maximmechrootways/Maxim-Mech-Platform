import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as inspectionService from '../services/inspectionService'

const router = Router()
router.use(authenticate)

router.get('/schedules', async (req, res, next) => {
    try {
        const list = await inspectionService.listSchedules(req.user!.role)
        res.json(list)
    } catch (e) { next(e) }
})

router.get('/due', async (req, res, next) => {
    try {
        const list = await inspectionService.listDue(req.user!.role, req.query.asOf as string)
        res.json(list)
    } catch (e) { next(e) }
})

router.get('/results', async (req, res, next) => {
    try {
        const list = await inspectionService.listResults(req.user!.role, { scheduleId: req.query.scheduleId as string })
        res.json(list)
    } catch (e) { next(e) }
})

export default router
