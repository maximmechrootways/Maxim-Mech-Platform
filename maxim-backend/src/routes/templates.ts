import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import { authenticate } from '../middleware/authenticate'
import { isPdfByMagic, sanitizeDocumentName } from '../utils/fileValidation'
import {
    uploadScannedPdf,
    listScannedPdfs,
    getScannedPdfById,
    getScannedPdfFile,
    createSignableTemplate,
    listSignableTemplates,
    getSignableTemplateById,
    updateSignableTemplate,
} from '../services/templateService'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
        cb(null, uploadDir)
    },
    filename: (_req, _file, cb) => {
        cb(null, `pdf-${Date.now()}-${uuidv4()}.pdf`)
    },
})
const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') return cb(new Error('Only PDF documents are allowed'))
        cb(null, true)
    },
})

router.use(authenticate)

router.post('/pdf/upload', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File is required' })
        if (!isPdfByMagic(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
            return res.status(400).json({ error: 'File is not a valid PDF. Only PDF documents are allowed.' })
        }
        const userId = req.user!.id
        const role = req.user!.role
        const rawName = (req.body as any).name || req.file.originalname
        const name = sanitizeDocumentName(rawName)
        const result = await uploadScannedPdf(userId, role, req.file, name)
        res.status(201).json(result)
    } catch (e) {
        next(e)
    }
})

router.get('/pdfs', async (req, res, next) => {
    try {
        const list = await listScannedPdfs(req.user!.id, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/pdfs/:id', async (req, res, next) => {
    try {
        const pdf = await getScannedPdfById(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(pdf)
    } catch (e) {
        next(e)
    }
})

router.get('/pdfs/:id/file', async (req, res, next) => {
    try {
        const filePath = await getScannedPdfFile(req.params.id, req.user!.id, req.user!.role)
        res.sendFile(path.resolve(filePath))
    } catch (e) {
        next(e)
    }
})

router.post('/signable', async (req, res, next) => {
    try {
        const result = await createSignableTemplate(req.user!.id, req.user!.role, req.body)
        res.status(201).json(result)
    } catch (e) {
        next(e)
    }
})

router.get('/signable', async (req, res, next) => {
    try {
        const list = await listSignableTemplates(req.user!.id, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/signable/:id', async (req, res, next) => {
    try {
        const template = await getSignableTemplateById(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(template)
    } catch (e) {
        next(e)
    }
})

router.patch('/signable/:id', async (req, res, next) => {
    try {
        const result = await updateSignableTemplate(req.params.id, req.user!.id, req.user!.role, req.body)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
