import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as timeOffService from '../services/timeOffService'
import * as timeOffRequestService from '../services/timeOffRequestService'

const router = Router()
router.use(authenticate)

router.get('/team-labourers', async (req, res, next) => {
  try {
    const team = await timeOffService.listVisibleLabourersForTimeOff(req.user!.id, req.user!.role)
    res.json(team)
  } catch (e) {
    next(e)
  }
})

router.get('/requests', async (req, res, next) => {
  try {
    const data = await timeOffRequestService.listTimeOffRequests(req.user!.id, req.user!.role, {
      status: String(req.query.status || ''),
      mine: String(req.query.mine || ''),
    })
    res.json(data)
  } catch (e) {
    next(e)
  }
})

router.post('/requests', async (req, res, next) => {
  try {
    const created = await timeOffRequestService.createTimeOffRequest(req.user!.id, {
      reason: req.body?.reason,
      compensation: req.body?.compensation,
      startDate: req.body?.startDate,
      endDate: req.body?.endDate,
      notes: req.body?.notes,
    })
    res.status(201).json(created)
  } catch (e) {
    next(e)
  }
})

router.post('/requests/:id/cancel', async (req, res, next) => {
  try {
    const updated = await timeOffRequestService.cancelTimeOffRequest(req.user!.id, String(req.params.id || ''))
    res.json(updated)
  } catch (e) {
    next(e)
  }
})

router.post('/requests/:id/approve', async (req, res, next) => {
  try {
    const updated = await timeOffRequestService.approveTimeOffRequest(
      req.user!.id,
      req.user!.role,
      String(req.params.id || ''),
      {
        compensation: req.body?.compensation,
        reviewNotes: req.body?.reviewNotes,
      },
    )
    res.json(updated)
  } catch (e) {
    next(e)
  }
})

router.post('/requests/:id/deny', async (req, res, next) => {
  try {
    const updated = await timeOffRequestService.denyTimeOffRequest(
      req.user!.id,
      req.user!.role,
      String(req.params.id || ''),
      { reviewNotes: req.body?.reviewNotes },
    )
    res.json(updated)
  } catch (e) {
    next(e)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const data = await timeOffService.listTimeOffEntries(req.user!.id, req.user!.role, {
      year: String(req.query.year || ''),
      labourerId: String(req.query.labourerId || ''),
    })
    res.json(data)
  } catch (e) {
    next(e)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const created = await timeOffService.createTimeOffEntry(req.user!.id, req.user!.role, {
      labourerId: req.body?.labourerId,
      reason: req.body?.reason,
      compensation: req.body?.compensation,
      startDate: req.body?.startDate,
      endDate: req.body?.endDate,
      notes: req.body?.notes,
    })
    res.status(201).json(created)
  } catch (e) {
    next(e)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const updated = await timeOffService.updateTimeOffEntry(req.user!.id, req.user!.role, String(req.params.id || ''), {
      labourerId: req.body?.labourerId,
      reason: req.body?.reason,
      compensation: req.body?.compensation,
      startDate: req.body?.startDate,
      endDate: req.body?.endDate,
      notes: req.body?.notes,
    })
    res.json(updated)
  } catch (e) {
    next(e)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await timeOffService.deleteTimeOffEntry(req.user!.id, req.user!.role, String(req.params.id || ''))
    res.json(deleted)
  } catch (e) {
    next(e)
  }
})

export default router
