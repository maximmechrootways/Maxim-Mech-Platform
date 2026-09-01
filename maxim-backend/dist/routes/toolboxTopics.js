"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const toolboxTopicService_1 = require("../services/toolboxTopicService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
function canManageImports(role) {
    return role === 'owner' || role === 'hr';
}
router.get('/', async (req, res, next) => {
    try {
        const result = await (0, toolboxTopicService_1.listToolboxTopics)({
            search: req.query.search,
            cursor: req.query.cursor,
            limit: req.query.limit != null ? Number(req.query.limit) : undefined,
            includeInactive: req.query.includeInactive === 'true',
        });
        res.status(200).json(result);
    }
    catch (e) {
        if (e?.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const topic = await (0, toolboxTopicService_1.getToolboxTopicById)(req.params.id);
        res.status(200).json(topic);
    }
    catch (e) {
        if (e?.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/admin/import', async (req, res, next) => {
    try {
        if (!canManageImports(req.user.role))
            return res.status(403).json({ error: 'Only Owner or HR can import topics' });
        const result = await (0, toolboxTopicService_1.importToolboxTopics)({
            sourcePageUrl: req.body?.sourcePageUrl != null ? String(req.body.sourcePageUrl) : undefined,
            batchTag: req.body?.batchTag != null ? String(req.body.batchTag) : undefined,
            offset: req.body?.offset != null ? Number(req.body.offset) : undefined,
            batchSize: req.body?.batchSize != null ? Number(req.body.batchSize) : undefined,
            importedById: req.user.id,
            dryRun: Boolean(req.body?.dryRun),
        });
        res.status(200).json(result);
    }
    catch (e) {
        if (e?.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
exports.default = router;
