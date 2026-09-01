import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { validateRequest } from '../utils/validate'
import {
  listSites,
  getSiteById,
  createSite,
  updateSite,
  deleteSite,
  addSiteSupervisor,
  removeSiteSupervisor,
  addSiteLabourer,
  removeSiteLabourer,
} from '../services/siteService'
import { createSiteSchema } from '../schemas/siteSchemas'

const router = Router()

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const activeOnly = req.query.activeOnly !== 'false'
        const sites = await listSites(activeOnly)
        res.status(200).json(sites)
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const site = await getSiteById(req.params.id)
        res.status(200).json(site)
    } catch (e) {
        next(e)
    }
})

router.post('/', validateRequest(createSiteSchema), async (req, res, next) => {
    try {
        const role = req.user!.role
        const site = await createSite(role, req.body)
        res.status(201).json(site)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const role = req.user!.role
        const site = await updateSite(req.params.id, role, req.body)
        res.status(200).json(site)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        const role = req.user!.role
        const result = await deleteSite(req.params.id, role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/supervisors', async (req, res, next) => {
    try {
        const userId = req.body?.userId
        if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'userId required' })
        const role = req.user!.role
        const result = await addSiteSupervisor(req.params.id, userId, role)
        res.status(201).json(result)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/supervisors/:userId', async (req, res, next) => {
    try {
        const role = req.user!.role
        await removeSiteSupervisor(req.params.id, req.params.userId, role)
        res.status(200).json({ ok: true })
    } catch (e) {
        next(e)
    }
})

router.post('/:id/labourers', async (req, res, next) => {
    try {
        const userId = req.body?.userId
        if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'userId required' })
        const role = req.user!.role
        const result = await addSiteLabourer(req.params.id, userId, req.user!.id, role)
        res.status(201).json(result)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/labourers/:userId', async (req, res, next) => {
    try {
        const role = req.user!.role
        await removeSiteLabourer(req.params.id, req.params.userId, role)
        res.status(200).json({ ok: true })
    } catch (e) {
        next(e)
    }
})

export default router
