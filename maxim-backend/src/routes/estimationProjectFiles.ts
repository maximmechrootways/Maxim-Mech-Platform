import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import * as estimationProjectFileService from '../services/estimationProjectFileService'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024
const ALLOWED_NAME = /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|csv|txt|zip)$/i

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
        cb(null, uploadDir)
    },
    filename: (_req, _file, cb) => {
        cb(null, `est-${Date.now()}-${uuidv4()}.tmp`)
    },
})

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_NAME.test(file.originalname)) {
            return cb(new Error('Allowed: PDF, images, Word, Excel, CSV, TXT, ZIP (by file extension).'))
        }
        cb(null, true)
    },
})

router.get('/', authenticate, async (req, res, next) => {
    try {
        const folderParam = typeof req.query.folder === 'string' ? req.query.folder : undefined
        const folder = folderParam ? estimationProjectFileService.parseEstimationFolder(folderParam) : undefined
        if (folderParam && !folder) {
            return res.status(400).json({ error: 'Invalid folder filter' })
        }
        const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined
        const list = await estimationProjectFileService.listFiles(req.user!.role, folder ?? undefined, siteId)
        res.json(list)
    } catch (e) {
        next(e)
    }
})

router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File is required' })
        }
        const body = req.body as { folder?: string; name?: string; siteId?: string; notes?: string } | undefined
        const folderRaw = body?.folder ?? ''
        const name = body?.name || undefined
        const siteId = body?.siteId || undefined
        const notes = body?.notes || undefined

        const row = await estimationProjectFileService.uploadFile(
            req.user!.id,
            req.user!.role,
            req.file,
            { folder: folderRaw, name, siteId, notes }
        )
        res.status(201).json(row)
    } catch (e) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.get('/:id/file', authenticate, async (req, res, next) => {
    try {
        const doc = await estimationProjectFileService.getFileMetaForUser(req.params.id, req.user!.role)
        const { getBlobSasUrl } = await import('../services/blobStorageService')
        const sasUrl = await getBlobSasUrl(doc.filePath, 5)
        const blobRes = await fetch(sasUrl)
        if (!blobRes.ok) return res.status(404).json({ error: 'File not found' })

        const asDownload = String(req.query.download || '').toLowerCase() === 'true'
        const mime = doc.mimeType || blobRes.headers.get('content-type') || 'application/octet-stream'
        res.setHeader('Content-Type', mime)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        const disposition = asDownload ? 'attachment' : 'inline'
        const safeName = (doc.originalName || 'document').replace(/"/g, '')
        res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`)
        const arrayBuffer = await blobRes.arrayBuffer()
        res.send(Buffer.from(arrayBuffer))
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        await estimationProjectFileService.removeFile(req.params.id, req.user!.role)
        res.json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

export default router
