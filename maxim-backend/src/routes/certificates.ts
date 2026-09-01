import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import { getValidatedDocumentType } from '../utils/fileValidation'
import {
    listCertificates,
    getCertificateById,
    createCertificate,
    updateCertificate,
    deleteCertificate,
    markCertificateReminderSent,
} from '../services/certificateService'
import { reconcileAllCertificateTrainingLinks } from '../services/certificateTrainingSync'
import { uploadBlob, getBlobSasUrl, deleteBlob } from '../services/blobStorageService'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `cert-${Date.now()}-${uuidv4()}.tmp`),
})

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
        if (!allowed.includes(file.mimetype)) return cb(new Error('Only PDF and images are allowed'))
        cb(null, true)
    },
})

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await listCertificates(req.user!.id, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.post('/reconcile-links', async (req, res, next) => {
    try {
        if (req.user!.role !== 'owner' && req.user!.role !== 'hr') {
            return res.status(403).json({ error: 'Only Owner or HR can reconcile certificate links' })
        }
        const stats = await reconcileAllCertificateTrainingLinks()
        const list = await listCertificates(req.user!.id, req.user!.role)
        res.status(200).json({ stats, certificates: list })
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const cert = await getCertificateById(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(cert)
    } catch (e) {
        next(e)
    }
})

router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        const contentType = String(req.headers['content-type'] || '')
        if (contentType.includes('multipart/form-data') && !req.file) {
            return res.status(400).json({ error: 'File upload parsing failed. Please re-select the file and try again.' })
        }
        const userId = req.user!.id
        const role = req.user!.role
        const userName = `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() || (req.user as any).email
        const body = { ...(req.body || {}) } as any
        if (req.file) {
            const validated = getValidatedDocumentType(req.file.path, req.file.mimetype)
            if (validated === 'reject') {
                try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
                return res.status(400).json({ error: 'File content invalid. Only PDF and images are allowed.' })
            }
            const blobName = await uploadBlob(req.file.path, 'documents')
            body.fileName = req.file.originalname
            body.filePath = blobName
        }
        const cert = await createCertificate(userId, role, userName, body)
        res.status(201).json(cert)
    } catch (e) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.patch('/:id', upload.single('file'), async (req, res, next) => {
    try {
        const contentType = String(req.headers['content-type'] || '')
        if (contentType.includes('multipart/form-data') && !req.file) {
            return res.status(400).json({ error: 'File upload parsing failed. Please re-select the file and try again.' })
        }
        const body = { ...(req.body || {}) } as any
        const existing = await getCertificateById(req.params.id, req.user!.id, req.user!.role)
        if (req.file) {
            const validated = getValidatedDocumentType(req.file.path, req.file.mimetype)
            if (validated === 'reject') {
                try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
                return res.status(400).json({ error: 'File content invalid. Only PDF and images are allowed.' })
            }
            const blobName = await uploadBlob(req.file.path, 'documents')
            body.fileName = req.file.originalname
            body.filePath = blobName
            if ((existing as any).filePath) await deleteBlob((existing as any).filePath)
        }
        const cert = await updateCertificate(req.params.id, req.user!.role, body)
        res.status(200).json(cert)
    } catch (e) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.get('/:id/file', async (req, res, next) => {
    try {
        const cert = await getCertificateById(req.params.id, req.user!.id, req.user!.role) as any
        if (!cert?.filePath) return res.status(404).json({ error: 'No file attached' })
        const sasUrl = await getBlobSasUrl(cert.filePath, 5)
        const blobRes = await fetch(sasUrl)
        if (!blobRes.ok) return res.status(404).json({ error: 'File not found' })

        const asDownload = String(req.query.download || '').toLowerCase() === 'true'
        const mime = blobRes.headers.get('content-type') || 'application/octet-stream'
        const disposition = asDownload ? 'attachment' : 'inline'
        const safeName = String(cert.fileName || 'certificate').replace(/"/g, '')
        res.setHeader('Content-Type', mime)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`)
        const arrayBuffer = await blobRes.arrayBuffer()
        res.send(Buffer.from(arrayBuffer))
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        await deleteCertificate(req.params.id, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

router.post('/:id/reminder-sent', async (req, res, next) => {
    try {
        const cert = await markCertificateReminderSent(req.params.id, req.user!.role)
        res.status(200).json(cert)
    } catch (e) {
        next(e)
    }
})

export default router
