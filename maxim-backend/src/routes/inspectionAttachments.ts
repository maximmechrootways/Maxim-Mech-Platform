import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import { getValidatedDocumentType } from '../utils/fileValidation'
import * as inspectionAttachmentService from '../services/inspectionAttachmentService'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
        cb(null, uploadDir)
    },
    filename: (_req, _file, cb) => {
        cb(null, `insp-att-${Date.now()}-${uuidv4()}.tmp`)
    },
})

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
            return cb(new Error('Only PDF and images (PNG, JPEG) are allowed'))
        }
        cb(null, true)
    },
})

router.get('/', authenticate, async (req, res, next) => {
    try {
        const scheduleId = req.query.scheduleId as string | undefined
        const list = await inspectionAttachmentService.listAllAttachments(req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File is required' })
        const validated = getValidatedDocumentType(req.file.path, req.file.mimetype)
        if (validated === 'reject') {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
            return res.status(400).json({ error: 'File content invalid. Only PDF and images (PNG, JPEG) are allowed.' })
        }
        const ext = validated === 'jpeg' ? 'jpg' : validated
        const safeName = `insp-att-${Date.now()}-${uuidv4()}.${ext}`
        const newPath = path.join(uploadDir, safeName)
        fs.renameSync(req.file.path, newPath)
        req.file.path = newPath
        req.file.filename = safeName

        const scheduleId = (req.body && (req.body as any).scheduleId) as string | undefined
        const notes = (req.body && (req.body as any).notes) as string | undefined

        const doc = await inspectionAttachmentService.upload(
            req.user!.id,
            req.user!.role,
            req.file,
            { scheduleId, notes }
        )
        res.status(201).json(doc)
    } catch (e) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.get('/:id/file-url', authenticate, async (req, res, next) => {
    try {
        const result = await inspectionAttachmentService.getFileUrl(req.params.id, req.user!.role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        await inspectionAttachmentService.remove(req.params.id, req.user!.role)
        res.status(200).json({ message: 'Attachment deleted' })
    } catch (e) {
        next(e)
    }
})

export default router
