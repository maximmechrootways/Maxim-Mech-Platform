"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const authenticate_1 = require("../middleware/authenticate");
const pdfSubmissionService_1 = require("../services/pdfSubmissionService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
const uploadExtraPdfUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (String(file.mimetype).toLowerCase().includes('pdf'))
            return cb(null, true);
        return cb(new Error('Only PDF files are allowed'));
    },
});
router.get('/', async (req, res, next) => {
    try {
        const query = {
            submittedById: req.query.submittedById,
            titleSearch: req.query.titleSearch,
            status: req.query.status,
        };
        const list = await (0, pdfSubmissionService_1.listSubmissions)(req.user.id, req.user.role, query);
        res.status(200).json(list);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
// Toolbox talk summary for a specific project (job)
router.get('/by-job/:jobId/toolbox-summary', async (req, res, next) => {
    try {
        const summary = await (0, pdfSubmissionService_1.getToolboxTalkSummaryByJob)(req.params.jobId);
        res.status(200).json(summary);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
// Recently submitted forms by labourers/supervisors assigned to this job/site.
router.get('/by-job/:jobId/assigned-submissions', async (req, res, next) => {
    try {
        const rows = await (0, pdfSubmissionService_1.getAssignedPersonnelSubmissionsByJob)(req.params.jobId, req.user.id, req.user.role);
        res.status(200).json(rows);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/bulk-delete-drafts', async (req, res, next) => {
    try {
        const submissionIds = Array.isArray(req.body?.submissionIds)
            ? req.body.submissionIds.map((id) => String(id))
            : [];
        const result = await (0, pdfSubmissionService_1.deleteDraftSubmissions)(req.user.id, req.user.role, submissionIds);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/export-merged-pdf', async (req, res, next) => {
    try {
        const submissionRefs = Array.isArray(req.body?.submissionRefs)
            ? req.body.submissionRefs.map((ref) => String(ref))
            : Array.isArray(req.body?.submissionIds)
                ? req.body.submissionIds.map((id) => String(id))
                : [];
        const result = await (0, pdfSubmissionService_1.exportMergedSubmissionsPdf)(req.user.id, req.user.role, submissionRefs);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.setHeader('X-Merged-Included-Count', String(result.includedCount));
        res.setHeader('X-Merged-Skipped-Count', String(result.skipped.length));
        res.status(200).send(result.buffer);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const submission = await (0, pdfSubmissionService_1.getSubmissionById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(submission);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const { templateId, jobId, siteId, reuseDraft, draftId } = req.body || {};
        if (!templateId)
            return res.status(400).json({ error: 'templateId required' });
        // Default: reuse existing DRAFT for this user+template (avoids draft spam). Pass reuseDraft: false for a fresh draft.
        const shouldReuse = reuseDraft !== false;
        const sub = await (0, pdfSubmissionService_1.findOrCreateDraftSubmission)(req.user.id, templateId, jobId, siteId, shouldReuse, draftId);
        res.status(201).json(sub);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.patch('/:id/title', async (req, res, next) => {
    try {
        const title = req.body?.title != null ? String(req.body.title) : '';
        const result = await (0, pdfSubmissionService_1.updateDraftTitle)(req.params.id, req.user.id, req.user.role, title);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.patch('/:id/values', async (req, res, next) => {
    try {
        const { values } = req.body || {};
        const sub = await (0, pdfSubmissionService_1.getSubmissionById)(req.params.id, req.user.id, req.user.role);
        const role = req.user.role;
        if ((sub.status === 'SUBMITTED' || sub.status === 'APPROVED') && role !== 'owner' && role !== 'hr') {
            return res.status(403).json({ error: 'Only Owner or HR can edit a submitted or approved form' });
        }
        await (0, pdfSubmissionService_1.saveValues)(req.params.id, Array.isArray(values) ? values : []);
        res.status(200).json({ success: true });
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
// Upload an extra PDF attachment while the form is being filled out
router.post('/:id/extra-pdf', uploadExtraPdfUpload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'PDF file is required' });
        const result = await (0, pdfSubmissionService_1.uploadExtraPdf)(req.params.id, req.user.id, req.user.role, req.file);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.delete('/:id/extra-pdf', async (req, res, next) => {
    try {
        const result = await (0, pdfSubmissionService_1.removeExtraPdf)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
// Copy the selected toolbox topic source PDF into this submission's attachment slot
router.post('/:id/topic/:topicId/attach', async (req, res, next) => {
    try {
        const result = await (0, pdfSubmissionService_1.attachToolboxTopicToSubmission)(req.params.id, req.params.topicId, req.user.id, req.user.role);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
// Clear all saved draft data (field values, signatures, and the optional extra PDF)
router.post('/:id/clear', async (req, res, next) => {
    try {
        const result = await (0, pdfSubmissionService_1.clearDraftSubmission)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/:id/signatures', async (req, res, next) => {
    try {
        const { signerRole, imageData, fieldId, signerUserId, signerName } = req.body || {};
        const actingRole = req.user.role;
        const canSignForAnother = actingRole === 'owner' || actingRole === 'hr' || actingRole === 'supervisor';
        const effectiveSignerId = canSignForAnother && signerUserId ? String(signerUserId) : req.user.id;
        const sig = await (0, pdfSubmissionService_1.addSignature)(req.params.id, effectiveSignerId, signerRole ?? 'Worker', imageData ?? '', fieldId, signerName);
        res.status(200).json(sig);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.delete('/:id/signatures', async (req, res, next) => {
    try {
        const { signedAt, signerId, fieldId, imageData } = req.body || {};
        const result = await (0, pdfSubmissionService_1.removeSignature)(req.params.id, req.user.id, req.user.role, {
            signedAt: signedAt != null ? String(signedAt) : undefined,
            signerId: signerId != null ? String(signerId) : undefined,
            fieldId: fieldId != null ? String(fieldId) : undefined,
            imageData: imageData != null ? String(imageData) : undefined,
        });
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/:id/submit', async (req, res, next) => {
    try {
        const title = req.body?.title != null ? String(req.body.title) : undefined;
        const signerUserIds = Array.isArray(req.body?.signerUserIds) ? req.body.signerUserIds.map((id) => String(id)) : undefined;
        const rawAssignments = req.body?.signerFieldAssignments;
        const signerFieldAssignments = Array.isArray(rawAssignments)
            ? rawAssignments
                .map((row) => {
                if (!row || typeof row !== 'object')
                    return null;
                const labourerUserId = String(row.labourerUserId ?? '').trim();
                const fieldId = String(row.fieldId ?? '').trim();
                if (!labourerUserId || !fieldId)
                    return null;
                return { labourerUserId, fieldId };
            })
                .filter(Boolean)
            : undefined;
        const sub = await (0, pdfSubmissionService_1.submitForm)(req.params.id, title, signerUserIds, signerFieldAssignments);
        res.status(200).json(sub);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.patch('/:id/approve', async (req, res, next) => {
    try {
        const sub = await (0, pdfSubmissionService_1.approveSubmission)(req.params.id, req.user.role);
        res.status(200).json(sub);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/:id/request-resubmission', async (req, res, next) => {
    try {
        const reason = req.body?.reason != null ? String(req.body.reason) : '';
        const sub = await (0, pdfSubmissionService_1.requestSubmissionResubmission)(req.params.id, req.user.id, req.user.role, reason);
        res.status(200).json(sub);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/:id/notify-hr', async (req, res, next) => {
    try {
        const result = await (0, pdfSubmissionService_1.notifySubmissionToHr)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const { status } = req.body || {};
        if (!status)
            return res.status(400).json({ error: 'status is required' });
        const result = await (0, pdfSubmissionService_1.updateSubmissionStatus)(req.params.id, req.user.role, status);
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
        const result = await (0, pdfSubmissionService_1.deleteSubmissionForAdmin)(req.params.id, req.user.role);
        res.status(200).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
exports.default = router;
