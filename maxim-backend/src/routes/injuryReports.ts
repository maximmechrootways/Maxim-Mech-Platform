import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import {
    getValidatedDocumentType,
    isPdfByMagic,
    isPngByMagic,
    isJpegByMagic,
} from '../utils/fileValidation'
import {
    listInjuryReports,
    getInjuryReportById,
    createInjuryReport,
    updateInjuryReport,
    deleteInjuryReport,
    getRootCauseByLinked,
    upsertRootCause,
} from '../services/injuryReportService'
import * as injuryReportAttachmentService from '../services/injuryReportAttachmentService'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024
const ALLOWED_MIME = [
    'application/pdf',
    'application/x-pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/octet-stream', // some browsers send this for PDFs; content is verified by magic bytes
]

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
        cb(null, uploadDir)
    },
    filename: (_req, _file, cb) => {
        cb(null, `injury-att-${Date.now()}-${uuidv4()}.tmp`)
    },
})

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        const mime = (file.mimetype || '').toLowerCase()
        const name = (file.originalname || '').toLowerCase()
        const extOk = name.endsWith('.pdf') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')
        if (!ALLOWED_MIME.includes(mime) && !extOk) {
            return cb(new Error('Only PDF and images (PNG, JPEG) are allowed'))
        }
        cb(null, true)
    },
})

function validateInjuryAttachment(filePath: string, mimetype: string): 'pdf' | 'png' | 'jpeg' | 'reject' {
    const validated = getValidatedDocumentType(filePath, mimetype)
    if (validated === 'pdf' || validated === 'png' || validated === 'jpeg') return validated
    // Fall back to magic bytes when MIME is generic/wrong (common for PDFs)
    if (isPdfByMagic(filePath)) return 'pdf'
    if (isPngByMagic(filePath)) return 'png'
    if (isJpegByMagic(filePath)) return 'jpeg'
    return 'reject'
}

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const status = (req.query.status as string) || undefined
        const jobId = (req.query.jobId as string) || undefined
        const subcontractorId = (req.query.subcontractorId as string) || undefined
        const list = await listInjuryReports(userId, role, { status, jobId, subcontractorId })
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/:id/attachments', async (req, res, next) => {
    try {
        const list = await injuryReportAttachmentService.listAttachments(req.params.id, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/attachments', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File is required' })
        const validated = validateInjuryAttachment(req.file.path, req.file.mimetype)
        if (validated === 'reject') {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
            return res.status(400).json({ error: 'File content invalid. Only PDF and images (PNG, JPEG) are allowed.' })
        }
        const ext = validated === 'jpeg' ? 'jpg' : validated
        const safeName = `injury-att-${Date.now()}-${uuidv4()}.${ext}`
        const newPath = path.join(uploadDir, safeName)
        fs.renameSync(req.file.path, newPath)
        req.file.path = newPath
        req.file.filename = safeName

        const notes = (req.body && (req.body as any).notes) as string | undefined
        const doc = await injuryReportAttachmentService.upload(
            req.user!.id,
            req.user!.role,
            req.params.id,
            req.file,
            { notes }
        )
        res.status(201).json(doc)
    } catch (e) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.get('/:id/attachments/:attachmentId/file-url', async (req, res, next) => {
    try {
        const result = await injuryReportAttachmentService.getFileUrl(req.params.attachmentId, req.user!.role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/attachments/:attachmentId', async (req, res, next) => {
    try {
        await injuryReportAttachmentService.remove(req.params.attachmentId, req.user!.role)
        res.status(200).json({ message: 'Attachment deleted' })
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const report = await getInjuryReportById(req.params.id, req.user!.role)
        res.status(200).json(report)
    } catch (e) {
        next(e)
    }
})

router.post('/', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const userName = `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() || (req.user as any).email
        const report = await createInjuryReport(userId, role, userName, req.body)
        res.status(201).json(report)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const report = await updateInjuryReport(req.params.id, req.user!.role, req.body)
        res.status(200).json(report)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        await deleteInjuryReport(req.params.id, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

// Root cause: get by linked injury
router.get('/:id/root-cause', async (req, res, next) => {
    try {
        const root = await getRootCauseByLinked('injury', req.params.id, req.user!.role)
        if (!root) return res.status(404).json({ error: 'Root cause not found' })
        res.status(200).json(root)
    } catch (e) {
        next(e)
    }
})

// Root cause: create or update
router.put('/:id/root-cause', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const userName = `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() || (req.user as any).email
        const root = await upsertRootCause(userId, role, userName, {
            linkedType: 'injury',
            linkedId: req.params.id,
            immediateCause: req.body.immediateCause,
            contributingCauses: req.body.contributingCauses,
            underlyingCause: req.body.underlyingCause,
        })
        res.status(200).json(root)
    } catch (e) {
        next(e)
    }
})

export default router
