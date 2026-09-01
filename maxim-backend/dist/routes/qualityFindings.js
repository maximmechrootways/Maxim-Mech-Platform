"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const qualityFindingsService_1 = require("../services/qualityFindingsService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
function requireOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
router.get('/summary', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view Form Red Flags' });
        }
        const summary = await (0, qualityFindingsService_1.summaryQualityFindings)();
        res.json(summary);
    }
    catch (e) {
        next(e);
    }
});
router.post('/dedupe', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can dedupe Form Red Flags' });
        }
        await (0, qualityFindingsService_1.dedupeStoredPdfQualityFindings)();
        res.status(204).end();
    }
    catch (e) {
        next(e);
    }
});
router.post('/sync-from-completed-forms', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can sync Form Red Flags' });
        }
        const result = await (0, qualityFindingsService_1.syncQualityFindingsFromCompletedPdfSubmissions)();
        res.json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/acknowledge', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can resolve Form Red Flags' });
        }
        await (0, qualityFindingsService_1.acknowledgeQualityFinding)(req.params.id, req.user.id);
        res.status(204).end();
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
            return res.status(403).json({ error: 'Only Owner or HR can view Form Red Flags' });
        }
        const qRaw = typeof req.query.queue === 'string' ? req.query.queue.toLowerCase().trim() : '';
        let queue = 'open';
        if (qRaw === 'open' || qRaw === 'resolved' || qRaw === 'all') {
            queue = qRaw;
        }
        else if (req.query.open === '0' || req.query.open === 'false') {
            queue = 'all';
        }
        else if (req.query.open === '1' || req.query.open === 'true') {
            queue = 'open';
        }
        const result = await (0, qualityFindingsService_1.listQualityFindings)({
            queue,
            from: typeof req.query.from === 'string' ? req.query.from : undefined,
            to: typeof req.query.to === 'string' ? req.query.to : undefined,
            templateId: typeof req.query.templateId === 'string' ? req.query.templateId : undefined,
            ruleCode: typeof req.query.ruleCode === 'string' ? req.query.ruleCode : undefined,
            linkedJobId: typeof req.query.linkedJobId === 'string' ? req.query.linkedJobId : undefined,
            formName: typeof req.query.formName === 'string' ? req.query.formName : undefined,
            limit: req.query.limit != null ? Number(req.query.limit) : undefined,
            offset: req.query.offset != null ? Number(req.query.offset) : undefined,
        });
        res.json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
