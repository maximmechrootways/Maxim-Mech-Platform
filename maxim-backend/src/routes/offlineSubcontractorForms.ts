import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import {
    assertCanAccessOfflineSubcontractorForms,
    createOfflineSubcontractorForm,
    deleteOfflineSubcontractorForm,
    listOfflineSubcontractorForms,
} from '../services/offlineSubcontractorFormService'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.pdf'
        cb(null, `offline-sub-${Date.now()}-${uuidv4()}${ext}`)
    },
})

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = new Set([
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ])
        if (!allowed.has(file.mimetype)) {
            return cb(new Error('Only PDF, common images (PNG, JPEG, WebP), and Word documents are allowed'))
        }
        cb(null, true)
    },
})

router.use(authenticate)

router.get('/files/:fileName', async (req, res, next) => {
    try {
        assertCanAccessOfflineSubcontractorForms(req.user!.role)
        const safeName = path.basename(req.params.fileName || '')
        if (!safeName || safeName !== req.params.fileName) throw { status: 400, message: 'Invalid file name' }
        const fullPath = path.join(uploadDir, safeName)
        if (!fs.existsSync(fullPath)) throw { status: 404, message: 'File not found' }
        if (!safeName.startsWith('offline-sub-')) throw { status: 400, message: 'Invalid file name' }

        const ext = path.extname(safeName).toLowerCase()
        const contentType =
            ext === '.pdf' ? 'application/pdf'
                : ext === '.png' ? 'image/png'
                    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                        : ext === '.webp' ? 'image/webp'
                            : 'application/octet-stream'
        res.setHeader('Content-Type', contentType)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.sendFile(fullPath)
    } catch (e) {
        next(e)
    }
})

router.get('/', async (req, res, next) => {
    try {
        assertCanAccessOfflineSubcontractorForms(req.user!.role)
        const list = await listOfflineSubcontractorForms()
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        assertCanAccessOfflineSubcontractorForms(req.user!.role)
        if (!req.file) throw { status: 400, message: 'File is required' }
        const title = String(req.body?.title ?? '').trim()
        if (!title) {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
            throw { status: 400, message: 'Title is required' }
        }
        if (title.length > 500) {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
            throw { status: 400, message: 'Title is too long' }
        }
        const created = await createOfflineSubcontractorForm(req.user!.id, {
            title,
            filePath: req.file.filename,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
        })
        res.status(201).json(created)
    } catch (e: any) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        assertCanAccessOfflineSubcontractorForms(req.user!.role)
        const existing = await deleteOfflineSubcontractorForm(req.params.id)
        if (existing.filePath) {
            const p = path.join(uploadDir, existing.filePath)
            if (fs.existsSync(p) && String(existing.filePath).startsWith('offline-sub-')) {
                fs.unlinkSync(p)
            }
        }
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

export default router
