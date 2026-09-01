"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const uuid_1 = require("uuid");
const authenticate_1 = require("../middleware/authenticate");
const documentService_1 = require("../services/documentService");
const documentSchemas_1 = require("../schemas/documentSchemas");
const router = (0, express_1.Router)();
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50')) * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/vnd.dwg',
    'image/vnd.dxf'
];
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, process.env.UPLOAD_DIR || 'uploads');
    },
    filename: (req, file, cb) => {
        const ext = file.originalname.split('.').pop();
        const unsafeName = `${Date.now()}-${(0, uuid_1.v4)()}.${ext}`;
        cb(null, unsafeName);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            // Must return an object that errorHandler explicitly checks for since multer swallows errors sometimes
            return cb(new Error('File type not allowed'));
        }
        cb(null, true);
    }
});
router.post('/upload', authenticate_1.authenticate, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File is required' });
        }
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
