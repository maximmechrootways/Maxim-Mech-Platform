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
const offlineSubcontractorFormService_1 = require("../services/offlineSubcontractorFormService");
const router = (0, express_1.Router)();
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname) || '.pdf';
        cb(null, `offline-sub-${Date.now()}-${(0, uuid_1.v4)()}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = new Set([
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ]);
        if (!allowed.has(file.mimetype)) {
            return cb(new Error('Only PDF, common images (PNG, JPEG, WebP), and Word documents are allowed'));
        }
        cb(null, true);
    },
});
router.use(authenticate_1.authenticate);
router.get('/files/:fileName', async (req, res, next) => {
    try {
        (0, offlineSubcontractorFormService_1.assertCanAccessOfflineSubcontractorForms)(req.user.role);
        const safeName = path_1.default.basename(req.params.fileName || '');
        if (!safeName || safeName !== req.params.fileName)
            throw { status: 400, message: 'Invalid file name' };
        const fullPath = path_1.default.join(uploadDir, safeName);
        if (!fs_1.default.existsSync(fullPath))
            throw { status: 404, message: 'File not found' };
        if (!safeName.startsWith('offline-sub-'))
            throw { status: 400, message: 'Invalid file name' };
        const ext = path_1.default.extname(safeName).toLowerCase();
        const contentType = ext === '.pdf' ? 'application/pdf'
            : ext === '.png' ? 'image/png'
                : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                    : ext === '.webp' ? 'image/webp'
                        : 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.sendFile(fullPath);
    }
    catch (e) {
        next(e);
    }
});
router.get('/', async (req, res, next) => {
    try {
        (0, offlineSubcontractorFormService_1.assertCanAccessOfflineSubcontractorForms)(req.user.role);
        const list = await (0, offlineSubcontractorFormService_1.listOfflineSubcontractorForms)();
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        (0, offlineSubcontractorFormService_1.assertCanAccessOfflineSubcontractorForms)(req.user.role);
        if (!req.file)
            throw { status: 400, message: 'File is required' };
        const title = String(req.body?.title ?? '').trim();
        if (!title) {
            if (fs_1.default.existsSync(req.file.path))
                fs_1.default.unlinkSync(req.file.path);
            throw { status: 400, message: 'Title is required' };
        }
        if (title.length > 500) {
            if (fs_1.default.existsSync(req.file.path))
                fs_1.default.unlinkSync(req.file.path);
            throw { status: 400, message: 'Title is too long' };
        }
        const created = await (0, offlineSubcontractorFormService_1.createOfflineSubcontractorForm)(req.user.id, {
            title,
            filePath: req.file.filename,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
        });
        res.status(201).json(created);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        (0, offlineSubcontractorFormService_1.assertCanAccessOfflineSubcontractorForms)(req.user.role);
        const existing = await (0, offlineSubcontractorFormService_1.deleteOfflineSubcontractorForm)(req.params.id);
        if (existing.filePath) {
            const p = path_1.default.join(uploadDir, existing.filePath);
            if (fs_1.default.existsSync(p) && String(existing.filePath).startsWith('offline-sub-')) {
                fs_1.default.unlinkSync(p);
            }
        }
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
