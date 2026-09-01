import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { getToolboxTopicById, importToolboxTopics, listToolboxTopics } from '../services/toolboxTopicService'

const router = Router()

router.use(authenticate)

function canManageImports(role: string) {
  return role === 'owner' || role === 'hr'
}

router.get('/', async (req, res, next) => {
  try {
    const result = await listToolboxTopics({
      search: req.query.search as string | undefined,
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit != null ? Number(req.query.limit) : undefined,
      includeInactive: req.query.includeInactive === 'true',
    })
    res.status(200).json(result)
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const topic = await getToolboxTopicById(req.params.id)
    res.status(200).json(topic)
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/admin/import', async (req, res, next) => {
  try {
    if (!canManageImports(req.user!.role)) return res.status(403).json({ error: 'Only Owner or HR can import topics' })
    const result = await importToolboxTopics({
      sourcePageUrl: req.body?.sourcePageUrl != null ? String(req.body.sourcePageUrl) : undefined,
      batchTag: req.body?.batchTag != null ? String(req.body.batchTag) : undefined,
      offset: req.body?.offset != null ? Number(req.body.offset) : undefined,
      batchSize: req.body?.batchSize != null ? Number(req.body.batchSize) : undefined,
      importedById: req.user!.id,
      dryRun: Boolean(req.body?.dryRun),
    })
    res.status(200).json(result)
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
