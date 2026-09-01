import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import {
  acknowledgeQualityFinding,
  dedupeStoredPdfQualityFindings,
  listQualityFindings,
  summaryQualityFindings,
  syncQualityFindingsFromCompletedPdfSubmissions,
} from '../services/qualityFindingsService'

const router = Router()
router.use(authenticate)

function requireOwnerOrHr(role: string | undefined) {
  return role === 'owner' || role === 'hr'
}

router.get('/summary', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user?.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can view Form Red Flags' })
    }
    const summary = await summaryQualityFindings()
    res.json(summary)
  } catch (e) {
    next(e)
  }
})

router.post('/dedupe', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user?.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can dedupe Form Red Flags' })
    }
    await dedupeStoredPdfQualityFindings()
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

router.post('/sync-from-completed-forms', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user?.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can sync Form Red Flags' })
    }
    const result = await syncQualityFindingsFromCompletedPdfSubmissions()
    res.json(result)
  } catch (e) {
    next(e)
  }
})

router.post('/:id/acknowledge', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user?.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can resolve Form Red Flags' })
    }
    await acknowledgeQualityFinding(req.params.id, req.user!.id)
    res.status(204).end()
  } catch (e: any) {
    if (e?.status === 404) return res.status(404).json({ error: e.message })
    next(e)
  }
})

router.get('/', async (req, res, next) => {
  try {
    if (!requireOwnerOrHr(req.user?.role)) {
      return res.status(403).json({ error: 'Only Owner or HR can view Form Red Flags' })
    }
    const qRaw = typeof req.query.queue === 'string' ? req.query.queue.toLowerCase().trim() : ''
    let queue: 'open' | 'resolved' | 'all' = 'open'
    if (qRaw === 'open' || qRaw === 'resolved' || qRaw === 'all') {
      queue = qRaw
    } else if (req.query.open === '0' || req.query.open === 'false') {
      queue = 'all'
    } else if (req.query.open === '1' || req.query.open === 'true') {
      queue = 'open'
    }

    const result = await listQualityFindings({
      queue,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      templateId: typeof req.query.templateId === 'string' ? req.query.templateId : undefined,
      ruleCode: typeof req.query.ruleCode === 'string' ? req.query.ruleCode : undefined,
      linkedJobId: typeof req.query.linkedJobId === 'string' ? req.query.linkedJobId : undefined,
      formName: typeof req.query.formName === 'string' ? req.query.formName : undefined,
      limit: req.query.limit != null ? Number(req.query.limit) : undefined,
      offset: req.query.offset != null ? Number(req.query.offset) : undefined,
    })
    res.json(result)
  } catch (e) {
    next(e)
  }
})

export default router
