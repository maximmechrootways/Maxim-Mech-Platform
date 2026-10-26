import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import {
    WSIB_ALLOWED_MIME_TYPES,
    getValidatedWsibDocumentType,
    sanitizeWsibDocumentName,
} from '../utils/fileValidation'
import {
    listMaximWsibDocuments,
    getMaximWsibDocumentById,
    createMaximWsibDocument,
    updateMaximWsibDocument,
    deleteMaximWsibDocument,
} from '../services/maximWsibService'
import { uploadBlob, getBlobSasUrl } from '../services/blobStorageService'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `wsib-${Date.now()}-${uuidv4()}.tmp`),
})

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        const mime = (file.mimetype || '').toLowerCase()
        if (!(WSIB_ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
            return cb(new Error('Only PDF, Word, Excel, PowerPoint, and CSV files are allowed'))
        }
        cb(null, true)
    },
})

function userDisplayName(user: Express.Request['user']) {
    const u = user as any
    return `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.email || 'HR'
}

/** Rename multer .tmp to the validated extension so blob storage gets the correct content-type. */
function renameValidatedUpload(
    file: Express.Multer.File,
    validated: string
): Express.Multer.File {
    const ext = validated === 'jpeg' ? 'jpg' : validated
    const safeName = `wsib-${Date.now()}-${uuidv4()}.${ext}`
    const newPath = path.join(uploadDir, safeName)
    fs.renameSync(file.path, newPath)
    file.path = newPath
    file.filename = safeName
    return file
}

const MIME_BY_EXT: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.csv': 'text/csv',
}

function contentTypeForFileName(fileName: string | undefined, fallback: string): string {
    const ext = path.extname(fileName || '').toLowerCase()
    if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext]
    if (fallback && fallback !== 'application/octet-stream') return fallback
    return 'application/octet-stream'
}

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await listMaximWsibDocuments(req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const doc = await getMaximWsibDocumentById(req.params.id, req.user!.role)
        res.status(200).json(doc)
    } catch (e) {
        next(e)
    }
})

router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'A file is required' })
        }
        const validated = getValidatedWsibDocumentType(req.file.path, req.file.mimetype)
        if (validated === 'reject') {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
            return res.status(400).json({ error: 'File content invalid. Allowed: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV.' })
        }
        renameValidatedUpload(req.file, validated)
        const blobName = await uploadBlob(req.file.path, 'company_wsib')
        const body = (req.body || {}) as any
        const doc = await createMaximWsibDocument(
            req.user!.id,
            req.user!.role,
            userDisplayName(req.user),
            {
                title: body.title,
                documentType: body.documentType,
                issueDate: body.issueDate,
                expirationDate: body.expirationDate,
                fileName: sanitizeWsibDocumentName(req.file.originalname),
                filePath: blobName,
                notes: body.notes,
            }
        )
        res.status(201).json(doc)
    } catch (e) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.patch('/:id', upload.single('file'), async (req, res, next) => {
    try {
        const body = { ...(req.body || {}) } as any
        if (req.file) {
            const validated = getValidatedWsibDocumentType(req.file.path, req.file.mimetype)
            if (validated === 'reject') {
                try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
                return res.status(400).json({ error: 'File content invalid. Allowed: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV.' })
            }
            renameValidatedUpload(req.file, validated)
            const blobName = await uploadBlob(req.file.path, 'company_wsib')
            body.fileName = sanitizeWsibDocumentName(req.file.originalname)
            body.filePath = blobName
        }
        const doc = await updateMaximWsibDocument(req.params.id, req.user!.role, body)
        res.status(200).json(doc)
    } catch (e) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.get('/:id/file', async (req, res, next) => {
    try {
        const doc = await getMaximWsibDocumentById(req.params.id, req.user!.role) as any
        if (!doc?.filePath) return res.status(404).json({ error: 'No file attached' })
        const sasUrl = await getBlobSasUrl(doc.filePath, 5)
        const blobRes = await fetch(sasUrl)
        if (!blobRes.ok) return res.status(404).json({ error: 'File not found' })

        const asDownload = String(req.query.download || '').toLowerCase() === 'true'
        const blobMime = blobRes.headers.get('content-type') || 'application/octet-stream'
        // Prefer extension from stored display name so older .tmp uploads still preview as PDF/etc.
        const mime = contentTypeForFileName(doc.fileName, blobMime)
        const disposition = asDownload ? 'attachment' : 'inline'
        const safeName = String(doc.fileName || 'wsib-document').replace(/"/g, '')
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
        const result = await deleteMaximWsibDocument(req.params.id, req.user!.role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
