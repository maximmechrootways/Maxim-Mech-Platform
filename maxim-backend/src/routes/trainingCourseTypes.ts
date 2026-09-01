import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import {
  listTrainingCourseTypes,
  createTrainingCourseType,
  updateTrainingCourseType,
  deleteTrainingCourseType,
  mergeTrainingCourseType,
  ensureTrainingCourseCatalog,
} from '../services/trainingCourseTypeService'

const router = Router()

router.use(authenticate)

function requireOwnerOrHr(role: string) {
  return role === 'owner' || role === 'hr'
}

router.get('/', async (req, res, next) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true'
    // Supervisors can read active list for viewing; HR/owner can include inactive when managing
    if (includeInactive && !requireOwnerOrHr(req.user!.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can view inactive course types' })
    }
    const list = await listTrainingCourseTypes({ includeInactive })
    res.status(200).json(list)
  } catch (e) {
    next(e)
  }
})

router.post('/ensure', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user!.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can refresh the course catalog' })
    }
    await ensureTrainingCourseCatalog()
    const list = await listTrainingCourseTypes({ includeInactive: true })
    res.status(200).json(list)
  } catch (e) {
    next(e)
  }
})

router.post('/', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user!.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can add course types' })
    }
    const created = await createTrainingCourseType({
      name: String(req.body?.name || ''),
      isPrimary: !!req.body?.isPrimary,
    })
    res.status(201).json(created)
  } catch (e) {
    next(e)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user!.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can edit course types' })
    }
    const updated = await updateTrainingCourseType(req.params.id, {
      name: req.body?.name !== undefined ? String(req.body.name) : undefined,
      isPrimary: req.body?.isPrimary !== undefined ? !!req.body.isPrimary : undefined,
      sortOrder: req.body?.sortOrder !== undefined ? Number(req.body.sortOrder) : undefined,
      isActive: req.body?.isActive !== undefined ? !!req.body.isActive : undefined,
    })
    res.status(200).json(updated)
  } catch (e) {
    next(e)
  }
})

router.post('/:id/merge', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user!.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can merge course types' })
    }
    const intoId = String(req.body?.intoId || '')
    if (!intoId) return res.status(400).json({ error: 'intoId is required' })
    const result = await mergeTrainingCourseType({
      fromId: req.params.id,
      intoId,
    })
    res.status(200).json(result)
  } catch (e) {
    next(e)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user!.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can delete course types' })
    }
    const mergeIntoId = req.query.mergeIntoId ? String(req.query.mergeIntoId) : req.body?.mergeIntoId
    const result = await deleteTrainingCourseType(req.params.id, {
      mergeIntoId: mergeIntoId ? String(mergeIntoId) : undefined,
    })
    res.status(200).json(result)
  } catch (e) {
    next(e)
  }
})

export default router
