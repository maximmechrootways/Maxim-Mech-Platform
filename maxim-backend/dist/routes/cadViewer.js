"use strict";
/**
 * High-quality CAD viewing via Autodesk Platform Services Viewer.
 * POST /cad-viewer/prepare  — upload/translate a local-archive (or other) CAD file
 * GET  /cad-viewer/status/:sourceKey — poll translation
 * GET  /cad-viewer/token — short-lived viewer access token
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const apsCadViewerService_1 = require("../services/apsCadViewerService");
const localDocumentService_1 = require("../services/localDocumentService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
function ensureAccess(role) {
    return role === 'owner' || role === 'hr' || role === 'supervisor';
}
// GET /cad-viewer/config
router.get('/config', (req, res) => {
    if (!ensureAccess(req.user.role))
        return res.status(403).json({ error: 'Forbidden' });
    return res.json({ configured: (0, apsCadViewerService_1.isApsConfigured)() });
});
// GET /cad-viewer/token
router.get('/token', async (req, res) => {
    if (!ensureAccess(req.user.role))
        return res.status(403).json({ error: 'Forbidden' });
    if (!(0, apsCadViewerService_1.isApsConfigured)())
        return res.status(503).json({ error: 'APS is not configured.' });
    try {
        const token = await (0, apsCadViewerService_1.getViewerToken)();
        return res.json(token);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Could not get viewer token';
        return res.status(502).json({ error: message });
    }
});
// GET /cad-viewer/status?sourceKey=local%3A<id>
router.get('/status', async (req, res) => {
    if (!ensureAccess(req.user.role))
        return res.status(403).json({ error: 'Forbidden' });
    const sourceKey = typeof req.query.sourceKey === 'string' ? req.query.sourceKey.trim() : '';
    if (!sourceKey)
        return res.status(400).json({ error: 'sourceKey is required' });
    try {
        const status = (await (0, apsCadViewerService_1.refreshCadDerivative)(sourceKey)) || (await (0, apsCadViewerService_1.getCadDerivativeStatus)(sourceKey));
        if (!status)
            return res.status(404).json({ error: 'Unknown CAD derivative' });
        return res.json(status);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Status check failed';
        return res.status(502).json({ error: message });
    }
});
// POST /cad-viewer/prepare
// Body: { source: 'local', documentId: string }
router.post('/prepare', async (req, res) => {
    if (!ensureAccess(req.user.role))
        return res.status(403).json({ error: 'Forbidden' });
    if (!(0, apsCadViewerService_1.isApsConfigured)()) {
        return res.status(503).json({
            error: 'High-quality CAD viewing requires Autodesk APS. Set APS_CLIENT_ID and APS_CLIENT_SECRET on the API.',
        });
    }
    const source = String(req.body?.source || '');
    const documentId = String(req.body?.documentId || '');
    try {
        if (source === 'local') {
            if (!(0, localDocumentService_1.isLocalDocumentStoreConfigured)()) {
                return res.status(503).json({ error: 'Local document store is not configured.' });
            }
            if (!documentId)
                return res.status(400).json({ error: 'documentId is required' });
            const file = await (0, localDocumentService_1.getLocalDocumentFile)(documentId);
            if (!file)
                return res.status(404).json({ error: 'Local document not found' });
            if (!(0, apsCadViewerService_1.isCadFileName)(file.fileName)) {
                return res.status(400).json({ error: 'File type is not a supported CAD format for APS Viewer.' });
            }
            const status = await (0, apsCadViewerService_1.prepareCadDerivative)({
                sourceKey: `local:${documentId}`,
                fileName: file.fileName,
                buffer: file.buffer,
                contentType: file.contentType,
            });
            return res.json(status);
        }
        return res.status(400).json({ error: 'Unsupported source. Use source: "local" with documentId.' });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'CAD prepare failed';
        console.error('CAD prepare error:', message);
        return res.status(502).json({ error: message });
    }
});
exports.default = router;
