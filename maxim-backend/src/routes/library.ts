import { Router, Request, Response } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as libraryDocumentService from '../services/libraryDocumentService'

const router = Router()
router.use(authenticate)

// GET /api/library — all documents the user can see (role/visibility filtered)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, siteId } = req.query
    const list = await libraryDocumentService.listLibraryDocuments(req.user!.id, req.user!.role)
    let docs = list
    if (type && typeof type === 'string') docs = docs.filter((d) => d.type === type)
    if (siteId && typeof siteId === 'string') docs = docs.filter((d) => d.siteId === siteId)
    res.status(200).json(docs)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch documents'
    console.error('GET /api/library error:', err)
    res.status(500).json({ error: message })
  }
})

// GET /api/library/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await libraryDocumentService.getLibraryDocumentById(
      req.params.id,
      req.user!.id,
      req.user!.role
    )
    res.status(200).json(doc)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    if (e.status === 404) return res.status(404).json({ error: e.message ?? 'Document not found' })
    if (e.status === 403) return res.status(403).json({ error: e.message ?? 'Forbidden' })
    const message = e.message ?? 'Failed to fetch document'
    res.status(500).json({ error: message })
  }
})

export default router
