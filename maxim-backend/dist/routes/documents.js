"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const authenticate_1 = require("../middleware/authenticate");
const fileValidation_1 = require("../utils/fileValidation");
const documentService_1 = require("../services/documentService");
const documentSchemas_1 = require("../schemas/documentSchemas");
const blobStorageService_1 = require("../services/blobStorageService");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024;
/** Only PDF and images; validated by magic bytes so executables cannot be uploaded. */
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs_1.default.existsSync(uploadDir))
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, _file, cb) => {
        cb(null, `doc-${Date.now()}-${(0, uuid_1.v4)()}.tmp`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return cb(new Error('Only PDF and images (PNG, JPEG) are allowed'));
        }
        cb(null, true);
    },
});
router.post('/upload', authenticate_1.authenticate, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File is required' });
        }
        const validated = (0, fileValidation_1.getValidatedDocumentType)(req.file.path, req.file.mimetype);
        if (validated === 'reject') {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
            return res.status(400).json({ error: 'File content does not match type. Only real PDF and images (PNG, JPEG) are allowed.' });
        }
        const ext = validated === 'jpeg' ? 'jpg' : validated;
        const safeFilename = `doc-${Date.now()}-${(0, uuid_1.v4)()}.${ext}`;
        const newPath = path_1.default.join(uploadDir, safeFilename);
        fs_1.default.renameSync(req.file.path, newPath);
        req.file.path = newPath;
        req.file.filename = safeFilename;
        const parseResult = documentSchemas_1.documentUploadSchema.safeParse(req.body);
        const docType = parseResult.success ? parseResult.data.docType : 'other';
        const doc = await (0, documentService_1.uploadDocumentRecord)(req.user.id, req.file, docType);
        res.status(201).json(doc);
    }
    catch (e) {
        next(e);
    }
});
router.get('/', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const queryParams = documentSchemas_1.documentQuerySchema.parse(req.query);
        const data = await (0, documentService_1.listUserDocuments)(req.user.id, queryParams);
        res.status(200).json(data);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id/file-url', authenticate_1.authenticate, async (req, res) => {
    try {
        const doc = await prisma_1.prisma.document.findUnique({
            where: { id: req.params.id },
            select: { id: true, filePath: true }
        });
        if (!doc?.filePath) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const url = await (0, blobStorageService_1.getBlobSasUrl)(doc.filePath, 30);
        res.json({ url, expiresInMinutes: 30 });
    }
    catch (err) {
        res.status(500).json({ error: 'Could not generate file URL' });
    }
});
router.get('/:id', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const doc = await (0, documentService_1.getDocumentById)(req.user.id, req.params.id);
        res.status(200).json(doc);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', authenticate_1.authenticate, async (req, res, next) => {
    try {
        await (0, documentService_1.deleteDocumentById)(req.user.id, req.params.id);
        res.status(200).json({ message: 'Document deleted successfully' });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
