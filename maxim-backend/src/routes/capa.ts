import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as capaService from '../services/capaService'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await capaService.listCAPA(req.user!.role, { status: req.query.status as string, sourceType: req.query.sourceType as string })
        res.json(list)
    } catch (e) { next(e) }
})
router.get('/:id', async (req, res, next) => {
    try {
        const item = await capaService.getCAPAById(req.params.id, req.user!.role)
        res.json(item)
    } catch (e) { next(e) }
})
router.post('/', async (req, res, next) => {
    try {
        const item = await capaService.createCAPA(req.user!.role, req.body)
        res.status(201).json(item)
    } catch (e) { next(e) }
})
router.patch('/:id', async (req, res, next) => {
    try {
        const item = await capaService.updateCAPA(req.params.id, req.user!.role, req.body)
        res.json(item)
    } catch (e) { next(e) }
})
router.delete('/:id', async (req, res, next) => {
    try {
        await capaService.deleteCAPA(req.params.id, req.user!.role)
        res.json({ message: 'Deleted' })
    } catch (e) { next(e) }
})
export default router
