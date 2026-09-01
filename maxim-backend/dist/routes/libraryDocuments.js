"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const authenticate_1 = require("../middleware/authenticate");
const fileValidation_1 = require("../utils/fileValidation");
const libraryDocumentService_1 = require("../services/libraryDocumentService");
const documentIngestionService_1 = require("../services/documentIngestionService");
const router = (0, express_1.Router)();
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024;
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs_1.default.existsSync(uploadDir))
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, _file, cb) => {
        cb(null, `lib-${Date.now()}-${(0, uuid_1.v4)()}.pdf`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only PDF, PNG, or JPEG files are allowed'));
        }
        cb(null, true);
    },
});
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const jobId = req.query.jobId;
        const folderIdRaw = req.query.folderId;
        if (jobId) {
            const folderId = folderIdRaw === undefined
                ? undefined
                : folderIdRaw === '' || folderIdRaw === 'root'
                    ? null
                    : folderIdRaw;
            const docs = await (0, libraryDocumentService_1.listByJobId)(jobId, req.user.id, req.user.role, folderId);
            return res.status(200).json(docs);
        }
        const list = await (0, libraryDocumentService_1.listLibraryDocuments)(req.user.id, req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const doc = await (0, libraryDocumentService_1.getLibraryDocumentById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(doc);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id/file', async (req, res, next) => {
    try {
        const doc = await (0, libraryDocumentService_1.getLibraryDocumentById)(req.params.id, req.user.id, req.user.role);
        const sasUrl = await (0, libraryDocumentService_1.getLibraryDocumentFile)(req.params.id, req.user.id, req.user.role);
        const blobRes = await fetch(sasUrl);
        if (!blobRes.ok)
            return res.status(404).json({ error: 'File not found' });
        const asDownload = String(req.query.download || '').toLowerCase() === 'true';
        const pathLower = doc.filePath.toLowerCase();
        const mime = blobRes.headers.get('content-type') ||
            (pathLower.endsWith('.png')
                ? 'image/png'
                : pathLower.endsWith('.jpg') || pathLower.endsWith('.jpeg')
                    ? 'image/jpeg'
                    : 'application/pdf');
        res.setHeader('Content-Type', mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const disposition = asDownload ? 'attachment' : 'inline';
        const ext = pathLower.endsWith('.png')
            ? '.png'
            : pathLower.endsWith('.jpg') || pathLower.endsWith('.jpeg')
                ? '.jpg'
                : '.pdf';
        const baseName = (doc.name || 'document').replace(/"/g, '').replace(/[/\\?%*:|"<>]/g, '_');
        const fileName = /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}${ext}`;
        res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
        const arrayBuffer = await blobRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    }
    catch (e) {
        next(e);
    }
});
router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'File is required' });
        const docType = (0, fileValidation_1.getValidatedDocumentType)(req.file.path, req.file.mimetype);
        if (docType === 'reject') {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
            return res.status(400).json({ error: 'File is invalid or corrupted. Only PDF, PNG, and JPEG are allowed.' });
        }
        const body = (req.body || {});
        const rawName = body.name || req.file.originalname;
        const folderId = body.folderId && body.folderId !== 'root' ? String(body.folderId) : null;
        const result = await (0, libraryDocumentService_1.createLibraryDocument)(req.user.id, req.user.role, req.file, {
            name: (0, fileValidation_1.sanitizeDocumentName)(rawName),
            type: body.type,
            siteId: body.siteId,
            jobId: body.jobId,
            folderId,
            date: body.date,
            visibility: body.visibility,
            visibleToRoles: body.visibleToRoles ? JSON.parse(body.visibleToRoles) : undefined,
            visibleToUserIds: body.visibleToUserIds ? JSON.parse(body.visibleToUserIds) : undefined,
        });
        // RAG: ingest in background so Frank can semantic-search this document
        if (result.filePath && process.env.VOYAGE_API_KEY) {
            (0, documentIngestionService_1.ingestDocument)({
                documentId: result.id,
                documentName: result.name,
                filePath: result.filePath,
                organisationId: undefined,
            }).catch((err) => console.error('Document ingestion failed:', err));
        }
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.put('/:id/file', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'File is required' });
        const docType = (0, fileValidation_1.getValidatedDocumentType)(req.file.path, req.file.mimetype);
        if (docType === 'reject') {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
            return res.status(400).json({ error: 'File is invalid.' });
        }
        const result = await (0, libraryDocumentService_1.replaceLibraryDocumentFile)(req.params.id, req.user.id, req.user.role, req.file);
        // Re-ingest in background so Frank uses the new content
        if (result.filePath && process.env.VOYAGE_API_KEY) {
            (0, documentIngestionService_1.ingestDocument)({
                documentId: result.id,
                documentName: result.name,
                filePath: result.filePath,
                organisationId: undefined,
            }).catch((err) => console.error('Document re-ingestion failed:', err));
        }
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const result = await (0, libraryDocumentService_1.updateLibraryDocument)(req.params.id, req.user.id, req.user.role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const result = await (0, libraryDocumentService_1.deleteLibraryDocument)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
