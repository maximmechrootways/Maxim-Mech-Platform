import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import { getValidatedDocumentType } from '../utils/fileValidation'
import * as employeeDocumentService from '../services/employeeDocumentService'

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
        cb(null, `emp-doc-${Date.now()}-${uuidv4()}.tmp`)
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
        const employeeId = req.query.employeeId as string
        if (!employeeId) return res.status(400).json({ error: 'employeeId is required' })
        const list = await employeeDocumentService.listByEmployee(employeeId, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
    try {
        const category = (req.body && (req.body as any).category) || 'hiring'
        const employeeId = (req.body && (req.body as any).employeeId) as string
        const expiresAt = (req.body && (req.body as any).expiresAt) as string | undefined
        const completedAt = (req.body && (req.body as any).completedAt) as string | undefined
        const displayName = (req.body && (req.body as any).displayName) as string | undefined
        const licenseNumber = (req.body && (req.body as any).licenseNumber) as string | undefined
        const hoursCompleted = (req.body && (req.body as any).hoursCompleted) as string | undefined
        const trainingFacility = (req.body && (req.body as any).trainingFacility) as string | undefined

        if (!employeeId) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
            }
            return res.status(400).json({ error: 'employeeId is required' })
        }

        const uploaderName = `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() || (req.user as any).email

        // Allow metadata-only training or licence records when no file is provided.
        if (!req.file) {
            const cat = String(category).toLowerCase()
            if (cat === 'training') {
                const doc = await employeeDocumentService.createTrainingRecord(
                    req.user!.id,
                    req.user!.role,
                    employeeId,
                    { expiresAt, completedAt, displayName, hoursCompleted, trainingFacility },
                    uploaderName
                )
                return res.status(201).json(doc)
            }
            if (cat === 'license') {
                const doc = await employeeDocumentService.createLicenseRecord(
                    req.user!.id,
                    req.user!.role,
                    employeeId,
                    { displayName, licenseNumber, completedAt }
                )
                return res.status(201).json(doc)
            }
            return res.status(400).json({ error: 'File is required' })
        }

        const validated = getValidatedDocumentType(req.file.path, req.file.mimetype)
        if (validated === 'reject') {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
            return res.status(400).json({ error: 'File content invalid. Only PDF and images (PNG, JPEG) are allowed.' })
        }
        const ext = validated === 'jpeg' ? 'jpg' : validated
        const safeName = `emp-doc-${Date.now()}-${uuidv4()}.${ext}`
        const newPath = path.join(uploadDir, safeName)
        fs.renameSync(req.file.path, newPath)
        req.file.path = newPath
        req.file.filename = safeName

        const doc = await employeeDocumentService.upload(
            req.user!.id,
            req.user!.role,
            employeeId,
            req.file,
            { category, expiresAt, completedAt, displayName, licenseNumber, hoursCompleted, trainingFacility },
            uploaderName
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
        const result = await employeeDocumentService.getFileUrl(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

// Stream document as same-origin binary for quick view/download.
router.get('/:id/file', authenticate, async (req, res, next) => {
    try {
        const doc = await employeeDocumentService.getFileMeta(req.params.id, req.user!.role)
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
        await employeeDocumentService.remove(req.params.id, req.user!.role)
        res.status(200).json({ message: 'Document deleted' })
    } catch (e) {
        next(e)
    }
})

export default router
