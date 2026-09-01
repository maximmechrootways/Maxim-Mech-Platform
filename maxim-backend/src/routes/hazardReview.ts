import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import { authenticate } from '../middleware/authenticate'
import { getValidatedDocumentType } from '../utils/fileValidation'
import {
  listTemplates,
  getTemplateFields,
  createDraft,
  getSubmission,
  saveValues,
  submitAssessment,
  deleteSubmission,
  listSubmissions,
  listCommentsGroupedByTemplate,
  listCommentsForTemplate,
  createComment,
  moderateComment,
} from '../services/hazardReviewService'
import {
  listCustomDocumentMeta,
  createCustomDocument,
  updateCustomDocumentLabel,
  replaceCustomDocumentFile,
  deleteCustomDocument,
  getCustomDocumentViewUrl,
} from '../services/hazardReviewCustomDocumentService'
import {
  listStaticHiddenKeys,
  listStaticOverrideKeys,
  getStaticOverrideViewUrl,
  upsertStaticOverridePdf,
  hideStaticTemplate,
} from '../services/hazardReviewStaticLibraryService'

function parseShortLabel(body: Record<string, unknown> | undefined): string {
  const raw = String(body?.shortLabel ?? body?.name ?? '').trim()
  return raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f<>]/g, '').slice(0, 120)
}

const router = Router()
router.use(authenticate)

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10) * 1024 * 1024
const hazardPdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
    cb(null, uploadDir)
  },
  filename: (_req, _file, cb) => {
    cb(null, `hra-${Date.now()}-${uuidv4()}.pdf`)
  },
})
const hazardPdfUpload = multer({
  storage: hazardPdfStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'))
    }
    cb(null, true)
  },
})

router.get('/catalog', async (_req, res, next) => {
  try {
    const [customDocuments, staticHiddenTemplateKeys, staticOverrideTemplateKeys] = await Promise.all([
      listCustomDocumentMeta(),
      listStaticHiddenKeys(),
      listStaticOverrideKeys(),
    ])
    res.json({ customDocuments, staticHiddenTemplateKeys, staticOverrideTemplateKeys })
  } catch (e: any) {
    next(e)
  }
})

router.get('/custom-documents', async (_req, res, next) => {
  try {
    const list = await listCustomDocumentMeta()
    res.json(list)
  } catch (e: any) {
    next(e)
  }
})

router.post('/custom-documents', hazardPdfUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file is required' })
    const docType = getValidatedDocumentType(req.file.path, req.file.mimetype)
    if (docType === 'reject') {
      try {
        fs.unlinkSync(req.file.path)
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: 'Invalid or corrupted PDF' })
    }
    const shortLabel = parseShortLabel(req.body as Record<string, unknown>)
    if (!shortLabel) {
      try {
        fs.unlinkSync(req.file.path)
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: 'Name is required' })
    }
    const created = await createCustomDocument(req.user!.id, req.user!.role, req.file, shortLabel)
    res.status(201).json(created)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/custom-documents/:id', async (req, res, next) => {
  try {
    const shortLabel = parseShortLabel(req.body as Record<string, unknown>)
    if (!shortLabel) return res.status(400).json({ error: 'Name is required' })
    const updated = await updateCustomDocumentLabel(req.params.id, req.user!.id, req.user!.role, shortLabel)
    res.json(updated)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.put('/custom-documents/:id/file', hazardPdfUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file is required' })
    const docType = getValidatedDocumentType(req.file.path, req.file.mimetype)
    if (docType === 'reject') {
      try {
        fs.unlinkSync(req.file.path)
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: 'Invalid or corrupted PDF' })
    }
    const result = await replaceCustomDocumentFile(req.params.id, req.user!.id, req.user!.role, req.file)
    res.json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/custom-documents/:id', async (req, res, next) => {
  try {
    const result = await deleteCustomDocument(req.params.id, req.user!.role)
    res.json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/custom-documents/:id/view-url', async (req, res, next) => {
  try {
    const out = await getCustomDocumentViewUrl(req.user!.role, req.params.id)
    res.json(out)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/static-library/:templateKey/view-url', async (req, res, next) => {
  try {
    const out = await getStaticOverrideViewUrl(req.params.templateKey)
    res.json(out)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.put('/static-library/:templateKey/file', hazardPdfUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file is required' })
    const docType = getValidatedDocumentType(req.file.path, req.file.mimetype)
    if (docType === 'reject') {
      try {
        fs.unlinkSync(req.file.path)
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: 'Invalid or corrupted PDF' })
    }
    const result = await upsertStaticOverridePdf(req.params.templateKey, req.user!.role, req.file)
    res.json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/static-library/:templateKey', async (req, res, next) => {
  try {
    const result = await hideStaticTemplate(req.params.templateKey, req.user!.role)
    res.json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/templates', (_req, res) => {
  res.json(listTemplates())
})

router.get('/templates/:templateKey/fields', (req, res, next) => {
  try {
    const fields = getTemplateFields(req.params.templateKey)
    res.json({ templateKey: req.params.templateKey, fields })
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/submissions', async (req, res, next) => {
  try {
    const list = await listSubmissions(req.user!.id, req.user!.role, {
      templateKey: req.query.templateKey as string | undefined,
      status: req.query.status as string | undefined,
      q: req.query.q as string | undefined,
      scope: req.query.scope as string | undefined,
      siteId: typeof req.query.siteId === 'string' ? req.query.siteId : undefined,
    })
    res.json(list)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/submissions', async (req, res, next) => {
  try {
    const { templateKey, jobId } = req.body || {}
    if (!templateKey) return res.status(400).json({ error: 'templateKey required' })
    const sub = await createDraft(req.user!.id, templateKey, jobId ?? null)
    res.status(201).json(sub)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/submissions/:id', async (req, res, next) => {
  try {
    const sub = await getSubmission(req.params.id, req.user!.id, req.user!.role)
    res.json(sub)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/submissions/:id/values', async (req, res, next) => {
  try {
    const fieldValues = (req.body?.fieldValues ?? req.body?.values ?? {}) as Record<string, string>
    const sub = await saveValues(req.params.id, req.user!.id, req.user!.role, fieldValues)
    res.json(sub)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/submissions/:id/submit', async (req, res, next) => {
  try {
    const sub = await submitAssessment(req.params.id, req.user!.id, req.user!.role)
    res.json(sub)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/submissions/:id', async (req, res, next) => {
  try {
    const result = await deleteSubmission(req.params.id, req.user!.role)
    res.json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/comments/boards', async (req, res, next) => {
  try {
    const boards = await listCommentsGroupedByTemplate(req.user!.role)
    res.json(boards)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/comments', async (req, res, next) => {
  try {
    const templateKey = req.query.templateKey as string | undefined
    if (!templateKey || typeof templateKey !== 'string') {
      return res.status(400).json({ error: 'templateKey query parameter required' })
    }
    const list = await listCommentsForTemplate(req.user!.role, templateKey)
    res.json(list)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/comments', async (req, res, next) => {
  try {
    const { body, templateKey } = req.body || {}
    if (!templateKey || typeof templateKey !== 'string') {
      return res.status(400).json({ error: 'templateKey required' })
    }
    const c = await createComment(req.user!.id, body, templateKey)
    res.status(201).json(c)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/comments/:id', async (req, res, next) => {
  try {
    const { action, remark } = req.body || {}
    if (action !== 'delete' && action !== 'remark') {
      return res.status(400).json({ error: 'action must be delete or remark' })
    }
    const result = await moderateComment(req.params.id, req.user!.id, req.user!.role, action, remark)
    res.json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
