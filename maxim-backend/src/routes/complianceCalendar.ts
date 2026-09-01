import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as complianceService from '../services/complianceCalendarService'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await complianceService.listEvents(req.user!.role, {
            from: req.query.from as string,
            to: req.query.to as string,
            type: req.query.type as string,
        })
        res.json(list)
    } catch (e) { next(e) }
})

router.get('/due', async (req, res, next) => {
    try {
        const list = await complianceService.listDue(req.user!.role, req.query.asOf as string)
        res.json(list)
    } catch (e) { next(e) }
})

export default router
