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
const certificateService_1 = require("../services/certificateService");
const certificateTrainingSync_1 = require("../services/certificateTrainingSync");
const blobStorageService_1 = require("../services/blobStorageService");
const router = (0, express_1.Router)();
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `cert-${Date.now()}-${(0, uuid_1.v4)()}.tmp`),
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
        if (!allowed.includes(file.mimetype))
            return cb(new Error('Only PDF and images are allowed'));
        cb(null, true);
    },
});
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const list = await (0, certificateService_1.listCertificates)(req.user.id, req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.post('/reconcile-links', async (req, res, next) => {
    try {
        if (req.user.role !== 'owner' && req.user.role !== 'hr') {
            return res.status(403).json({ error: 'Only Owner or HR can reconcile certificate links' });
        }
        const stats = await (0, certificateTrainingSync_1.reconcileAllCertificateTrainingLinks)();
        const list = await (0, certificateService_1.listCertificates)(req.user.id, req.user.role);
        res.status(200).json({ stats, certificates: list });
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const cert = await (0, certificateService_1.getCertificateById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(cert);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        const contentType = String(req.headers['content-type'] || '');
        if (contentType.includes('multipart/form-data') && !req.file) {
            return res.status(400).json({ error: 'File upload parsing failed. Please re-select the file and try again.' });
        }
        const userId = req.user.id;
        const role = req.user.role;
        const userName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
        const body = { ...(req.body || {}) };
        if (req.file) {
            const validated = (0, fileValidation_1.getValidatedDocumentType)(req.file.path, req.file.mimetype);
            if (validated === 'reject') {
                try {
                    fs_1.default.unlinkSync(req.file.path);
                }
                catch { /* ignore */ }
                return res.status(400).json({ error: 'File content invalid. Only PDF and images are allowed.' });
            }
            const blobName = await (0, blobStorageService_1.uploadBlob)(req.file.path, 'documents');
            body.fileName = req.file.originalname;
            body.filePath = blobName;
        }
        const cert = await (0, certificateService_1.createCertificate)(userId, role, userName, body);
        res.status(201).json(cert);
    }
    catch (e) {
        if (req.file?.path && fs_1.default.existsSync(req.file.path)) {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
        }
        next(e);
    }
});
router.patch('/:id', upload.single('file'), async (req, res, next) => {
    try {
        const contentType = String(req.headers['content-type'] || '');
        if (contentType.includes('multipart/form-data') && !req.file) {
            return res.status(400).json({ error: 'File upload parsing failed. Please re-select the file and try again.' });
        }
        const body = { ...(req.body || {}) };
        const existing = await (0, certificateService_1.getCertificateById)(req.params.id, req.user.id, req.user.role);
        if (req.file) {
            const validated = (0, fileValidation_1.getValidatedDocumentType)(req.file.path, req.file.mimetype);
            if (validated === 'reject') {
                try {
                    fs_1.default.unlinkSync(req.file.path);
                }
                catch { /* ignore */ }
                return res.status(400).json({ error: 'File content invalid. Only PDF and images are allowed.' });
            }
            const blobName = await (0, blobStorageService_1.uploadBlob)(req.file.path, 'documents');
            body.fileName = req.file.originalname;
            body.filePath = blobName;
            if (existing.filePath)
                await (0, blobStorageService_1.deleteBlob)(existing.filePath);
        }
        const cert = await (0, certificateService_1.updateCertificate)(req.params.id, req.user.role, body);
        res.status(200).json(cert);
    }
    catch (e) {
        if (req.file?.path && fs_1.default.existsSync(req.file.path)) {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
        }
        next(e);
    }
});
router.get('/:id/file', async (req, res, next) => {
    try {
        const cert = await (0, certificateService_1.getCertificateById)(req.params.id, req.user.id, req.user.role);
        if (!cert?.filePath)
            return res.status(404).json({ error: 'No file attached' });
        const sasUrl = await (0, blobStorageService_1.getBlobSasUrl)(cert.filePath, 5);
        const blobRes = await fetch(sasUrl);
        if (!blobRes.ok)
            return res.status(404).json({ error: 'File not found' });
        const asDownload = String(req.query.download || '').toLowerCase() === 'true';
        const mime = blobRes.headers.get('content-type') || 'application/octet-stream';
        const disposition = asDownload ? 'attachment' : 'inline';
        const safeName = String(cert.fileName || 'certificate').replace(/"/g, '');
        res.setHeader('Content-Type', mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
        const arrayBuffer = await blobRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        await (0, certificateService_1.deleteCertificate)(req.params.id, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/reminder-sent', async (req, res, next) => {
    try {
        const cert = await (0, certificateService_1.markCertificateReminderSent)(req.params.id, req.user.role);
        res.status(200).json(cert);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
