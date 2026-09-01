import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as dailyHazardService from '../services/dailyHazardService'

const router = Router()

router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const list = await dailyHazardService.listDailyHazardSubmissions({
      projectId: req.query.projectId as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    })
    res.status(200).json(list)
  } catch (e) {
    next(e)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const item = await dailyHazardService.getDailyHazardSubmissionById(req.params.id)
    res.status(200).json(item)
  } catch (e) {
    next(e)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const user = req.user!
    const item = await dailyHazardService.createDailyHazardSubmission(user.id, req.body)
    res.status(201).json(item)
  } catch (e) {
    next(e)
  }
})

router.patch('/:id/approval', async (req, res, next) => {
  try {
    const approved = Boolean(req.body?.approved)
    const item = await dailyHazardService.setDailyHazardApproval(
      req.params.id,
      req.user!.id,
      req.user!.role,
      approved
    )
    res.status(200).json(item)
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await dailyHazardService.deleteDailyHazardSubmission(req.params.id, req.user!.role)
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
