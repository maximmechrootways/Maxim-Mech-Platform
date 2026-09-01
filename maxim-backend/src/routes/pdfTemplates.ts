import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { authenticate } from '../middleware/authenticate'
import { isPdfByMagic, sanitizeDocumentName } from '../utils/fileValidation'
import { getBlobSasUrl } from '../services/blobStorageService'
import { prisma } from '../lib/prisma'
import {
  createTemplate,
  createCustomTemplate,
  listTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
} from '../services/pdfTemplateService'

const router = Router()

const uploadDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads')
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
    cb(null, uploadDir)
  },
  filename: (_req, _file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `template-${unique}.pdf`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Only PDF allowed'))
    cb(null, true)
  },
})

router.use(authenticate)

router.post('/custom', async (req, res, next) => {
  try {
    const result = await createCustomTemplate(req.user!.id, req.user!.role, req.body || {})
    res.status(201).json({
      id: result.id,
      name: result.name,
      description: result.description,
      filePath: result.filePath,
      pageCount: result.pageCount,
      assignedRoles: result.assignedRoles,
      assignedUserIds: result.assignedUserIds,
      isActive: result.isActive,
      createdAt: result.createdAt.toISOString(),
    })
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file is required' })
    if (!isPdfByMagic(req.file.path)) {
      try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
      return res.status(400).json({ error: 'File is not a valid PDF. Only PDF documents are allowed.' })
    }
    const rawName = (req.body as any).name || req.file.originalname
    const name = sanitizeDocumentName(rawName)
    const result = await createTemplate(req.user!.id, req.user!.role, req.file, name)
    res.status(201).json({
      id: result.id,
      name: result.name,
      description: result.description,
      filePath: result.filePath,
      pageCount: result.pageCount,
      assignedRoles: result.assignedRoles,
      isActive: result.isActive,
      createdAt: result.createdAt.toISOString(),
    })
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const list = await listTemplates(req.user!.id, req.user!.role)
    res.status(200).json(list)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/:id/file-url', async (req, res) => {
  try {
    const template = await prisma.pdfTemplate.findUnique({
      where: { id: req.params.id },
      select: { id: true, filePath: true, isActive: true }
    })
    if (!template || !template.isActive) {
      return res.status(404).json({ error: 'Template not found' })
    }
    const url = await getBlobSasUrl(template.filePath, 30)
    res.json({ url, expiresInMinutes: 30 })
  } catch (err: any) {
    res.status(500).json({ error: 'Could not generate file URL' })
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const template = await getTemplateById(req.params.id, req.user!.id, req.user!.role)
    res.status(200).json(template)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const result = await updateTemplate(
      req.params.id,
      req.user!.id,
      req.user!.role,
      req.body
    )
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteTemplate(
      req.params.id,
      req.user!.id,
      req.user!.role
    )
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
