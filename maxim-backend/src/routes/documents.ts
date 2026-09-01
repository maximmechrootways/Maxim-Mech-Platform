import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import { getValidatedDocumentType } from '../utils/fileValidation'
import { uploadDocumentRecord, listUserDocuments, getDocumentById, deleteDocumentById } from '../services/documentService'
import { documentQuerySchema, documentUploadSchema } from '../schemas/documentSchemas'
import { getBlobSasUrl } from '../services/blobStorageService'
import { prisma } from '../lib/prisma'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024
/** Only PDF and images; validated by magic bytes so executables cannot be uploaded. */
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
        cb(null, uploadDir)
    },
    filename: (_req, _file, cb) => {
        cb(null, `doc-${Date.now()}-${uuidv4()}.tmp`)
    },
})

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return cb(new Error('Only PDF and images (PNG, JPEG) are allowed'))
        }
        cb(null, true)
    },
})

router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File is required' })
        }
        const validated = getValidatedDocumentType(req.file.path, req.file.mimetype)
        if (validated === 'reject') {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
            return res.status(400).json({ error: 'File content does not match type. Only real PDF and images (PNG, JPEG) are allowed.' })
        }
        const ext = validated === 'jpeg' ? 'jpg' : validated
        const safeFilename = `doc-${Date.now()}-${uuidv4()}.${ext}`
        const newPath = path.join(uploadDir, safeFilename)
        fs.renameSync(req.file.path, newPath)
        req.file.path = newPath
        req.file.filename = safeFilename

        const parseResult = documentUploadSchema.safeParse(req.body)
        const docType = parseResult.success ? parseResult.data.docType : 'other'

        const doc = await uploadDocumentRecord(req.user!.id, req.file, docType)
        res.status(201).json(doc)
    } catch (e) {
        next(e)
    }
})

router.get('/', authenticate, async (req, res, next) => {
    try {
        const queryParams = documentQuerySchema.parse(req.query)
        const data = await listUserDocuments(req.user!.id, queryParams)
        res.status(200).json(data)
    } catch (e) {
        next(e)
    }
})

router.get('/:id/file-url', authenticate, async (req, res) => {
    try {
        const doc = await prisma.document.findUnique({
            where: { id: req.params.id },
            select: { id: true, filePath: true }
        })
        if (!doc?.filePath) {
            return res.status(404).json({ error: 'Document not found' })
        }
        const url = await getBlobSasUrl(doc.filePath, 30)
        res.json({ url, expiresInMinutes: 30 })
    } catch (err: any) {
        res.status(500).json({ error: 'Could not generate file URL' })
    }
})

router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const doc = await getDocumentById(req.user!.id, req.params.id)
        res.status(200).json(doc)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        await deleteDocumentById(req.user!.id, req.params.id)
        res.status(200).json({ message: 'Document deleted successfully' })
    } catch (e) {
        next(e)
    }
})

export default router
