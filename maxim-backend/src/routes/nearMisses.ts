import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as nearMissService from '../services/nearMissService'

const router = Router()
router.use(authenticate)

function userName(req: any) {
    const u = req.user as any
    return `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.email || 'Unknown'
}

router.get('/', async (req, res, next) => {
    try {
        const list = await nearMissService.listNearMisses(req.user!.role, {
            status: req.query.status as string,
            siteId: req.query.siteId as string,
        })
        res.json(list)
    } catch (e) { next(e) }
})

router.get('/:id/pdf', async (req, res, next) => {
    try {
        const buffer = await nearMissService.getNearMissPdfBuffer(req.params.id, req.user!.id, req.user!.role)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `inline; filename="near-miss-${req.params.id}.pdf"`)
        res.send(buffer)
    } catch (e) { next(e) }
})

router.get('/:id', async (req, res, next) => {
    try {
        const item = await nearMissService.getNearMissById(req.params.id, req.user!.role)
        res.json(item)
    } catch (e) { next(e) }
})

router.post('/', async (req, res, next) => {
    try {
        const item = await nearMissService.createNearMiss(req.user!.id, req.user!.role, userName(req), req.body)
        res.status(201).json(item)
    } catch (e) { next(e) }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const item = await nearMissService.updateNearMiss(req.params.id, req.user!.role, req.body)
        res.json(item)
    } catch (e) { next(e) }
})

router.delete('/:id', async (req, res, next) => {
    try {
        await nearMissService.deleteNearMiss(req.params.id, req.user!.role)
        res.json({ message: 'Deleted' })
    } catch (e) { next(e) }
})

export default router
