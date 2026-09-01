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
const templateService_1 = require("../services/templateService");
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
        cb(null, `pdf-${Date.now()}-${(0, uuid_1.v4)()}.pdf`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf')
            return cb(new Error('Only PDF documents are allowed'));
        cb(null, true);
    },
});
router.use(authenticate_1.authenticate);
router.post('/pdf/upload', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'File is required' });
        if (!(0, fileValidation_1.isPdfByMagic)(req.file.path)) {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
            return res.status(400).json({ error: 'File is not a valid PDF. Only PDF documents are allowed.' });
        }
        const userId = req.user.id;
        const role = req.user.role;
        const rawName = req.body.name || req.file.originalname;
        const name = (0, fileValidation_1.sanitizeDocumentName)(rawName);
        const result = await (0, templateService_1.uploadScannedPdf)(userId, role, req.file, name);
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.get('/pdfs', async (req, res, next) => {
    try {
        const list = await (0, templateService_1.listScannedPdfs)(req.user.id, req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/pdfs/:id', async (req, res, next) => {
    try {
        const pdf = await (0, templateService_1.getScannedPdfById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(pdf);
    }
    catch (e) {
        next(e);
    }
});
router.get('/pdfs/:id/file', async (req, res, next) => {
    try {
        const filePath = await (0, templateService_1.getScannedPdfFile)(req.params.id, req.user.id, req.user.role);
        res.sendFile(path_1.default.resolve(filePath));
    }
    catch (e) {
        next(e);
    }
});
router.post('/signable', async (req, res, next) => {
    try {
        const result = await (0, templateService_1.createSignableTemplate)(req.user.id, req.user.role, req.body);
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.get('/signable', async (req, res, next) => {
    try {
        const list = await (0, templateService_1.listSignableTemplates)(req.user.id, req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/signable/:id', async (req, res, next) => {
    try {
        const template = await (0, templateService_1.getSignableTemplateById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(template);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/signable/:id', async (req, res, next) => {
    try {
        const result = await (0, templateService_1.updateSignableTemplate)(req.params.id, req.user.id, req.user.role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
