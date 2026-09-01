"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const authenticate_1 = require("../middleware/authenticate");
const fileValidation_1 = require("../utils/fileValidation");
const blobStorageService_1 = require("../services/blobStorageService");
const prisma_1 = require("../lib/prisma");
const pdfTemplateService_1 = require("../services/pdfTemplateService");
const router = (0, express_1.Router)();
const uploadDir = path_1.default.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024;
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs_1.default.existsSync(uploadDir))
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, _file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `template-${unique}.pdf`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf')
            return cb(new Error('Only PDF allowed'));
        cb(null, true);
    },
});
router.use(authenticate_1.authenticate);
router.post('/custom', async (req, res, next) => {
    try {
        const result = await (0, pdfTemplateService_1.createCustomTemplate)(req.user.id, req.user.role, req.body || {});
        res.status(201).json({
            id: result.id,
            name: result.name,
            description: result.description,
            filePath: result.filePath,
            pageCount: result.pageCount,
            assignedRoles: result.assignedRoles,
            assignedUserIds: result.assignedUserIds,
            isActive: result.isActive,
            createdAt: result.createdAt.toISOString(),
        });
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/', upload.single('pdf'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'PDF file is required' });
        if (!(0, fileValidation_1.isPdfByMagic)(req.file.path)) {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
            return res.status(400).json({ error: 'File is not a valid PDF. Only PDF documents are allowed.' });
        }
        const rawName = req.body.name || req.file.originalname;
        const name = (0, fileValidation_1.sanitizeDocumentName)(rawName);
        const result = await (0, pdfTemplateService_1.createTemplate)(req.user.id, req.user.role, req.file, name);
        res.status(201).json({
            id: result.id,
            name: result.name,
            description: result.description,
            filePath: result.filePath,
            pageCount: result.pageCount,
            assignedRoles: result.assignedRoles,
            isActive: result.isActive,
            createdAt: result.createdAt.toISOString(),
        });
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const list = await (0, pdfTemplateService_1.listTemplates)(req.user.id, req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/:id/file-url', async (req, res) => {
    try {
        const template = await prisma_1.prisma.pdfTemplate.findUnique({
            where: { id: req.params.id },
            select: { id: true, filePath: true, isActive: true }
        });
        if (!template || !template.isActive) {
            return res.status(404).json({ error: 'Template not found' });
        }
        const url = await (0, blobStorageService_1.getBlobSasUrl)(template.filePath, 30);
        res.json({ url, expiresInMinutes: 30 });
    }
    catch (err) {
        res.status(500).json({ error: 'Could not generate file URL' });
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const template = await (0, pdfTemplateService_1.getTemplateById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(template);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const result = await (0, pdfTemplateService_1.updateTemplate)(req.params.id, req.user.id, req.user.role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const result = await (0, pdfTemplateService_1.deleteTemplate)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
exports.default = router;
