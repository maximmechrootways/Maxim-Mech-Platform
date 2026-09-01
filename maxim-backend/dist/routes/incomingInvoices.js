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
const incomingInvoiceIngestionService_1 = require("../services/incomingInvoiceIngestionService");
const incomingInvoiceService_1 = require("../services/incomingInvoiceService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname) || '.pdf';
            cb(null, `invoice-manual-${Date.now()}${ext}`);
        },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
            return cb(new Error('Only PDF attachments are allowed'));
        }
        cb(null, true);
    },
});
function requireOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
router.get('/summary', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view incoming invoices' });
        }
        res.json(await (0, incomingInvoiceService_1.summaryIncomingInvoices)());
    }
    catch (e) {
        next(e);
    }
});
router.get('/admin/status', async (req, res, next) => {
    try {
        if (req.user?.role !== 'owner') {
            return res.status(403).json({ error: 'Only Owner can view invoice pipeline status' });
        }
        res.json(await (0, incomingInvoiceIngestionService_1.getIncomingInvoicePipelineStatus)());
    }
    catch (e) {
        next(e);
    }
});
router.post('/admin/setup-trigger', async (req, res, next) => {
    try {
        if (req.user?.role !== 'owner') {
            return res.status(403).json({ error: 'Only Owner can bootstrap invoice inbox integration' });
        }
        res.json(await (0, incomingInvoiceIngestionService_1.bootstrapInvoiceInboxIntegration)());
    }
    catch (e) {
        next(e);
    }
});
router.post('/admin/sync', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can sync invoice inbox' });
        }
        const poll = await (0, incomingInvoiceIngestionService_1.pollUnreadInvoiceEmails)();
        const processed = await (0, incomingInvoiceIngestionService_1.processIncomingInvoiceQueue)(10);
        const status = await (0, incomingInvoiceIngestionService_1.getIncomingInvoicePipelineStatus)();
        res.json({ ...poll, ...processed, status });
    }
    catch (e) {
        next(e);
    }
});
router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can create invoices' });
        }
        const body = req.body;
        let pdfBuffer;
        if (req.file) {
            pdfBuffer = fs_1.default.readFileSync(req.file.path);
            fs_1.default.unlinkSync(req.file.path);
        }
        const totalRaw = body.totalAmount?.trim();
        const totalAmount = totalRaw ? Number(totalRaw) : undefined;
        const invoice = await (0, incomingInvoiceService_1.createManualIncomingInvoice)({
            vendorName: body.vendorName || '',
            invoiceNumber: body.invoiceNumber,
            invoiceDate: body.invoiceDate,
            dueDate: body.dueDate,
            totalAmount: Number.isFinite(totalAmount) ? totalAmount : undefined,
            currency: body.currency,
            poNumber: body.poNumber,
            jobReference: body.jobReference,
            paymentTerms: body.paymentTerms,
            emailSubject: body.emailSubject,
            emailBodyText: body.emailBodyText,
            pdfBuffer,
            pdfOriginalName: req.file?.originalname,
            pdfMimeType: req.file?.mimetype,
        });
        res.status(201).json(invoice);
    }
    catch (e) {
        if (req.file?.path && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        if (e?.status === 400)
            return res.status(400).json({ error: e.message });
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can edit invoices' });
        }
        const body = req.body;
        const num = (key) => {
            const raw = body[key];
            if (raw == null || raw === '')
                return null;
            const value = Number(raw);
            return Number.isFinite(value) ? value : null;
        };
        const str = (key) => {
            const raw = body[key];
            return raw == null ? undefined : String(raw);
        };
        res.json(await (0, incomingInvoiceService_1.updateIncomingInvoice)(req.params.id, {
            vendorName: str('vendorName'),
            invoiceNumber: str('invoiceNumber'),
            invoiceDate: str('invoiceDate'),
            dueDate: str('dueDate'),
            subtotal: body.subtotal !== undefined ? num('subtotal') : undefined,
            taxAmount: body.taxAmount !== undefined ? num('taxAmount') : undefined,
            totalAmount: body.totalAmount !== undefined ? num('totalAmount') : undefined,
            currency: str('currency'),
            poNumber: str('poNumber'),
            jobReference: str('jobReference'),
            jobId: body.jobId === null || body.jobId === '' ? null : str('jobId'),
            paid: body.paid === true ? true : body.paid === false ? false : undefined,
            paymentTerms: str('paymentTerms'),
            notes: str('notes'),
        }));
    }
    catch (e) {
        if (e?.status === 404)
            return res.status(404).json({ error: e.message });
        if (e?.status === 400)
            return res.status(400).json({ error: e.message });
        next(e);
    }
});
router.post('/:id/rescan', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can rescan invoices' });
        }
        res.json(await (0, incomingInvoiceService_1.rescanIncomingInvoiceFromPdf)(req.params.id));
    }
    catch (e) {
        if (e?.status === 404)
            return res.status(404).json({ error: e.message });
        if (e?.status === 400)
            return res.status(400).json({ error: e.message });
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can delete invoices' });
        }
        res.json(await (0, incomingInvoiceService_1.deleteIncomingInvoice)(req.params.id));
    }
    catch (e) {
        if (e?.status === 404)
            return res.status(404).json({ error: e.message });
        next(e);
    }
});
router.get('/:id/attachments/:attachmentId/file', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view invoice attachments' });
        }
        const { buffer, originalName, mimeType } = await (0, incomingInvoiceService_1.getIncomingInvoiceAttachmentBuffer)(req.params.id, req.params.attachmentId);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${originalName.replace(/"/g, '')}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(buffer);
    }
    catch (e) {
        if (e?.status === 404)
            return res.status(404).json({ error: e.message });
        next(e);
    }
});
router.get('/:id/attachments/:attachmentId/download', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can download invoice attachments' });
        }
        const result = await (0, incomingInvoiceService_1.getIncomingInvoiceAttachmentDownloadUrl)(req.params.id, req.params.attachmentId);
        res.json(result);
    }
    catch (e) {
        if (e?.status === 404)
            return res.status(404).json({ error: e.message });
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view incoming invoices' });
        }
        res.json(await (0, incomingInvoiceService_1.getIncomingInvoiceDetail)(req.params.id));
    }
    catch (e) {
        if (e?.status === 404)
            return res.status(404).json({ error: e.message });
        next(e);
    }
});
router.get('/', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view incoming invoices' });
        }
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
        const vendor = typeof req.query.vendor === 'string' ? req.query.vendor.trim() : undefined;
        const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
        const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const documentType = typeof req.query.documentType === 'string' ? req.query.documentType : undefined;
        const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;
        const minTotal = req.query.minTotal != null && req.query.minTotal !== ''
            ? Number(req.query.minTotal)
            : undefined;
        const maxTotal = req.query.maxTotal != null && req.query.maxTotal !== ''
            ? Number(req.query.maxTotal)
            : undefined;
        const result = await (0, incomingInvoiceService_1.listIncomingInvoices)({
            q,
            vendor,
            dateFrom,
            dateTo,
            minTotal: Number.isFinite(minTotal) ? minTotal : undefined,
            maxTotal: Number.isFinite(maxTotal) ? maxTotal : undefined,
            status,
            documentType,
            sort,
            limit,
            offset,
        });
        res.setHeader('X-Total-Count', String(result.total));
        res.json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
