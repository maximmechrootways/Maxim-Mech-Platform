import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import { authenticate } from '../middleware/authenticate'
import { getValidatedDocumentType, sanitizeDocumentName, LIBRARY_ALLOWED_MIME_TYPES } from '../utils/fileValidation'
import { ensureUploadDir } from '../utils/uploadDir'
import {
    listLibraryDocuments,
    getLibraryDocumentById,
    getLibraryDocumentFile,
    createLibraryDocument,
    updateLibraryDocument,
    replaceLibraryDocumentFile,
    listByJobId,
    deleteLibraryDocument,
} from '../services/libraryDocumentService'
import { ingestDocument } from '../services/documentIngestionService'

const router = Router()

const uploadDir = ensureUploadDir()
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        try {
            ensureUploadDir()
            cb(null, uploadDir)
        } catch (e) {
            cb(e as Error, uploadDir)
        }
    },
    filename: (_req, _file, cb) => {
        const ext = path.extname(_file.originalname || '').toLowerCase() || '.pdf'
        const safeExt = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.zip'].includes(ext)
            ? ext
            : '.pdf'
        cb(null, `lib-${Date.now()}-${uuidv4()}${safeExt}`)
    },
})
const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!(LIBRARY_ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
            return cb(new Error('Only PDF, Word, Excel, CSV, TXT, ZIP, PNG, or JPEG files are allowed'))
        }
        cb(null, true)
    },
})

function parseJsonField<T>(raw: unknown, fallback: T): T {
    if (raw == null || raw === '') return fallback
    if (typeof raw !== 'string') return raw as T
    try {
        return JSON.parse(raw) as T
    } catch {
        throw { status: 400, expose: true, message: 'Invalid form data. Please try uploading again.' }
    }
}

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const jobId = req.query.jobId as string | undefined
        const folderIdRaw = req.query.folderId as string | undefined
        if (jobId) {
            const folderId =
                folderIdRaw === undefined
                    ? undefined
                    : folderIdRaw === '' || folderIdRaw === 'root'
                      ? null
                      : folderIdRaw
            const docs = await listByJobId(jobId, req.user!.id, req.user!.role, folderId)
            return res.status(200).json(docs)
        }
        const list = await listLibraryDocuments(req.user!.id, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const doc = await getLibraryDocumentById(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(doc)
    } catch (e) {
        next(e)
    }
})

router.get('/:id/file', async (req, res, next) => {
    try {
        const doc = await getLibraryDocumentById(req.params.id, req.user!.id, req.user!.role)
        const sasUrl = await getLibraryDocumentFile(req.params.id, req.user!.id, req.user!.role)
        const blobRes = await fetch(sasUrl)
        if (!blobRes.ok) return res.status(404).json({ error: 'File not found' })

        const asDownload = String(req.query.download || '').toLowerCase() === 'true'
        const pathLower = doc.filePath.toLowerCase()
        const mime =
            blobRes.headers.get('content-type') ||
            (pathLower.endsWith('.png')
                ? 'image/png'
                : pathLower.endsWith('.jpg') || pathLower.endsWith('.jpeg')
                  ? 'image/jpeg'
                  : 'application/pdf')
        res.setHeader('Content-Type', mime)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        const disposition = asDownload ? 'attachment' : 'inline'
        const ext =
            pathLower.endsWith('.png')
                ? '.png'
                : pathLower.endsWith('.jpg') || pathLower.endsWith('.jpeg')
                  ? '.jpg'
                  : '.pdf'
        const baseName = (doc.name || 'document').replace(/"/g, '').replace(/[/\\?%*:|"<>]/g, '_')
        const fileName = /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}${ext}`
        res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`)
        const arrayBuffer = await blobRes.arrayBuffer()
        res.send(Buffer.from(arrayBuffer))
    } catch (e) {
        next(e)
    }
})

router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File is required' })
        console.log(
            `[library-upload] user=${req.user!.id} name=${req.file.originalname} size=${req.file.size} type=${req.file.mimetype}`
        )
        const docType = getValidatedDocumentType(req.file.path, req.file.mimetype)
        if (docType === 'reject') {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
            return res.status(400).json({ error: 'File is invalid or corrupted. Allowed: PDF, Word, Excel, CSV, TXT, ZIP, PNG, JPEG.' })
        }
        const body = (req.body || {}) as any
        const rawName = body.name || req.file.originalname
        const folderId =
            body.folderId && body.folderId !== 'root' ? String(body.folderId) : null
        const result = await createLibraryDocument(req.user!.id, req.user!.role, req.file, {
            name: sanitizeDocumentName(rawName),
            type: body.type,
            siteId: body.siteId,
            jobId: body.jobId,
            folderId,
            date: body.date,
            visibility: body.visibility,
            visibleToRoles: parseJsonField(body.visibleToRoles, undefined),
            visibleToUserIds: parseJsonField(body.visibleToUserIds, undefined),
        })
        // RAG: ingest in background so Frank can semantic-search this document
        if (result.filePath && process.env.VOYAGE_API_KEY) {
            ingestDocument({
                documentId: result.id,
                documentName: result.name,
                filePath: result.filePath,
                organisationId: undefined,
            }).catch((err) => console.error('Document ingestion failed:', err))
        }
        res.status(201).json(result)
    } catch (e) {
        if (req.file?.path) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.put('/:id/file', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File is required' })
        const docType = getValidatedDocumentType(req.file.path, req.file.mimetype)
        if (docType === 'reject') {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
            return res.status(400).json({ error: 'File is invalid or corrupted. Allowed: PDF, Word, Excel, CSV, TXT, ZIP, PNG, JPEG.' })
        }
        const result = await replaceLibraryDocumentFile(
            req.params.id,
            req.user!.id,
            req.user!.role,
            req.file
        )
        // Re-ingest in background so Frank uses the new content
        if (result.filePath && process.env.VOYAGE_API_KEY) {
            ingestDocument({
                documentId: result.id,
                documentName: result.name,
                filePath: result.filePath,
                organisationId: undefined,
            }).catch((err) => console.error('Document re-ingestion failed:', err))
        }
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const result = await updateLibraryDocument(req.params.id, req.user!.id, req.user!.role, req.body)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        const result = await deleteLibraryDocument(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
