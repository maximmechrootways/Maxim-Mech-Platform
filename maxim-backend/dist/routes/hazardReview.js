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
const hazardReviewService_1 = require("../services/hazardReviewService");
const hazardReviewCustomDocumentService_1 = require("../services/hazardReviewCustomDocumentService");
const hazardReviewStaticLibraryService_1 = require("../services/hazardReviewStaticLibraryService");
function parseShortLabel(body) {
    const raw = String(body?.shortLabel ?? body?.name ?? '').trim();
    return raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f<>]/g, '').slice(0, 120);
}
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10) * 1024 * 1024;
const hazardPdfStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs_1.default.existsSync(uploadDir))
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, _file, cb) => {
        cb(null, `hra-${Date.now()}-${(0, uuid_1.v4)()}.pdf`);
    },
});
const hazardPdfUpload = (0, multer_1.default)({
    storage: hazardPdfStorage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed'));
        }
        cb(null, true);
    },
});
router.get('/catalog', async (_req, res, next) => {
    try {
        const [customDocuments, staticHiddenTemplateKeys, staticOverrideTemplateKeys] = await Promise.all([
            (0, hazardReviewCustomDocumentService_1.listCustomDocumentMeta)(),
            (0, hazardReviewStaticLibraryService_1.listStaticHiddenKeys)(),
            (0, hazardReviewStaticLibraryService_1.listStaticOverrideKeys)(),
        ]);
        res.json({ customDocuments, staticHiddenTemplateKeys, staticOverrideTemplateKeys });
    }
    catch (e) {
        next(e);
    }
});
router.get('/custom-documents', async (_req, res, next) => {
    try {
        const list = await (0, hazardReviewCustomDocumentService_1.listCustomDocumentMeta)();
        res.json(list);
    }
    catch (e) {
        next(e);
    }
});
router.post('/custom-documents', hazardPdfUpload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'PDF file is required' });
        const docType = (0, fileValidation_1.getValidatedDocumentType)(req.file.path, req.file.mimetype);
        if (docType === 'reject') {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch {
                /* ignore */
            }
            return res.status(400).json({ error: 'Invalid or corrupted PDF' });
        }
        const shortLabel = parseShortLabel(req.body);
        if (!shortLabel) {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch {
                /* ignore */
            }
            return res.status(400).json({ error: 'Name is required' });
        }
        const created = await (0, hazardReviewCustomDocumentService_1.createCustomDocument)(req.user.id, req.user.role, req.file, shortLabel);
        res.status(201).json(created);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.patch('/custom-documents/:id', async (req, res, next) => {
    try {
        const shortLabel = parseShortLabel(req.body);
        if (!shortLabel)
            return res.status(400).json({ error: 'Name is required' });
        const updated = await (0, hazardReviewCustomDocumentService_1.updateCustomDocumentLabel)(req.params.id, req.user.id, req.user.role, shortLabel);
        res.json(updated);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.put('/custom-documents/:id/file', hazardPdfUpload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'PDF file is required' });
        const docType = (0, fileValidation_1.getValidatedDocumentType)(req.file.path, req.file.mimetype);
        if (docType === 'reject') {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch {
                /* ignore */
            }
            return res.status(400).json({ error: 'Invalid or corrupted PDF' });
        }
        const result = await (0, hazardReviewCustomDocumentService_1.replaceCustomDocumentFile)(req.params.id, req.user.id, req.user.role, req.file);
        res.json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.delete('/custom-documents/:id', async (req, res, next) => {
    try {
        const result = await (0, hazardReviewCustomDocumentService_1.deleteCustomDocument)(req.params.id, req.user.role);
        res.json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/custom-documents/:id/view-url', async (req, res, next) => {
    try {
        const out = await (0, hazardReviewCustomDocumentService_1.getCustomDocumentViewUrl)(req.user.role, req.params.id);
        res.json(out);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/static-library/:templateKey/view-url', async (req, res, next) => {
    try {
        const out = await (0, hazardReviewStaticLibraryService_1.getStaticOverrideViewUrl)(req.params.templateKey);
        res.json(out);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.put('/static-library/:templateKey/file', hazardPdfUpload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'PDF file is required' });
        const docType = (0, fileValidation_1.getValidatedDocumentType)(req.file.path, req.file.mimetype);
        if (docType === 'reject') {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch {
                /* ignore */
            }
            return res.status(400).json({ error: 'Invalid or corrupted PDF' });
        }
        const result = await (0, hazardReviewStaticLibraryService_1.upsertStaticOverridePdf)(req.params.templateKey, req.user.role, req.file);
        res.json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.delete('/static-library/:templateKey', async (req, res, next) => {
    try {
        const result = await (0, hazardReviewStaticLibraryService_1.hideStaticTemplate)(req.params.templateKey, req.user.role);
        res.json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/templates', (_req, res) => {
    res.json((0, hazardReviewService_1.listTemplates)());
});
router.get('/templates/:templateKey/fields', (req, res, next) => {
    try {
        const fields = (0, hazardReviewService_1.getTemplateFields)(req.params.templateKey);
        res.json({ templateKey: req.params.templateKey, fields });
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/submissions', async (req, res, next) => {
    try {
        const list = await (0, hazardReviewService_1.listSubmissions)(req.user.id, req.user.role, {
            templateKey: req.query.templateKey,
            status: req.query.status,
            q: req.query.q,
            scope: req.query.scope,
            siteId: typeof req.query.siteId === 'string' ? req.query.siteId : undefined,
        });
        res.json(list);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/submissions', async (req, res, next) => {
    try {
        const { templateKey, jobId } = req.body || {};
        if (!templateKey)
            return res.status(400).json({ error: 'templateKey required' });
        const sub = await (0, hazardReviewService_1.createDraft)(req.user.id, templateKey, jobId ?? null);
        res.status(201).json(sub);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/submissions/:id', async (req, res, next) => {
    try {
        const sub = await (0, hazardReviewService_1.getSubmission)(req.params.id, req.user.id, req.user.role);
        res.json(sub);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.patch('/submissions/:id/values', async (req, res, next) => {
    try {
        const fieldValues = (req.body?.fieldValues ?? req.body?.values ?? {});
        const sub = await (0, hazardReviewService_1.saveValues)(req.params.id, req.user.id, req.user.role, fieldValues);
        res.json(sub);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/submissions/:id/submit', async (req, res, next) => {
    try {
        const sub = await (0, hazardReviewService_1.submitAssessment)(req.params.id, req.user.id, req.user.role);
        res.json(sub);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.delete('/submissions/:id', async (req, res, next) => {
    try {
        const result = await (0, hazardReviewService_1.deleteSubmission)(req.params.id, req.user.role);
        res.json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/comments/boards', async (req, res, next) => {
    try {
        const boards = await (0, hazardReviewService_1.listCommentsGroupedByTemplate)(req.user.role);
        res.json(boards);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/comments', async (req, res, next) => {
    try {
        const templateKey = req.query.templateKey;
        if (!templateKey || typeof templateKey !== 'string') {
            return res.status(400).json({ error: 'templateKey query parameter required' });
        }
        const list = await (0, hazardReviewService_1.listCommentsForTemplate)(req.user.role, templateKey);
        res.json(list);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/comments', async (req, res, next) => {
    try {
        const { body, templateKey } = req.body || {};
        if (!templateKey || typeof templateKey !== 'string') {
            return res.status(400).json({ error: 'templateKey required' });
        }
        const c = await (0, hazardReviewService_1.createComment)(req.user.id, body, templateKey);
        res.status(201).json(c);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.patch('/comments/:id', async (req, res, next) => {
    try {
        const { action, remark } = req.body || {};
        if (action !== 'delete' && action !== 'remark') {
            return res.status(400).json({ error: 'action must be delete or remark' });
        }
        const result = await (0, hazardReviewService_1.moderateComment)(req.params.id, req.user.id, req.user.role, action, remark);
        res.json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
exports.default = router;
