import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as dhaPresetService from '../services/dhaPresetService'

const router = Router()

router.use(authenticate)

// GET /dha-presets — list all presets
router.get('/', async (_req, res, next) => {
    try {
        const list = await dhaPresetService.listDhaPresets()
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

// POST /dha-presets — create a new preset
router.post('/', async (req, res, next) => {
    try {
        const { name, data } = req.body
        if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
        const result = await dhaPresetService.createDhaPreset(req.user!.id, name, data)
        res.status(201).json(result)
    } catch (e) {
        next(e)
    }
})

// PATCH /dha-presets/:id — update a preset
router.patch('/:id', async (req, res, next) => {
    try {
        const { name, data } = req.body
        const result = await dhaPresetService.updateDhaPreset(req.params.id, req.user!.id, req.user!.role, name, data)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

// DELETE /dha-presets/:id — delete a preset
router.delete('/:id', async (req, res, next) => {
    try {
        const result = await dhaPresetService.deleteDhaPreset(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
