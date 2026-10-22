"use strict";
/**
 * Proxy for files stored in the GX10 local archive.
 * The frontend never talks to the GX10 directly — it hits this same-origin route,
 * and the backend fetches the bytes over the Cloudflare Tunnel with the shared secret.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const localDocumentService_1 = require("../services/localDocumentService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
function ensureLocalArchiveAccess(role) {
    return role === 'owner' || role === 'hr' || role === 'supervisor';
}
function rejectIfUnavailable(res, role) {
    if (!ensureLocalArchiveAccess(role)) {
        res.status(403).json({ error: 'Local archive documents are available to Owner, HR, and Supervisor only.' });
        return true;
    }
    if (!(0, localDocumentService_1.isLocalDocumentStoreConfigured)()) {
        res.status(503).json({ error: 'Local document store is not configured.' });
        return true;
    }
    return false;
}
// GET /local-documents — flat list (optional ?project=)
router.get('/', async (req, res) => {
    if (rejectIfUnavailable(res, req.user.role))
        return;
    try {
        const project = typeof req.query.project === 'string' ? req.query.project : undefined;
        const documents = await (0, localDocumentService_1.listLocalDocuments)(project);
        return res.json({ documents });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Could not list local documents.';
        console.error('Local document list error:', message);
        return res.status(502).json({ error: message });
    }
});
// GET /local-documents/tree — nested project → folders → files
router.get('/tree', async (req, res) => {
    if (rejectIfUnavailable(res, req.user.role))
        return;
    try {
        const project = typeof req.query.project === 'string' ? req.query.project : undefined;
        const projects = await (0, localDocumentService_1.getLocalDocumentTree)(project);
        return res.json({ projects });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load local document tree.';
        console.error('Local document tree error:', message);
        return res.status(502).json({ error: message });
    }
});
// GET /local-documents/matches — GX10 projects linked (or not) to Maxim jobs
router.get('/matches', async (req, res) => {
    if (rejectIfUnavailable(res, req.user.role))
        return;
    try {
        const matches = await (0, localDocumentService_1.matchLocalProjectsToJobs)();
        return res.json({ matches });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Could not match local projects.';
        console.error('Local document match error:', message);
        return res.status(502).json({ error: message });
    }
});
// GET /local-documents/for-job/:jobId — GX10 tree slices that match this job
router.get('/for-job/:jobId', async (req, res) => {
    if (rejectIfUnavailable(res, req.user.role))
        return;
    try {
        const projects = await (0, localDocumentService_1.getLocalProjectsForJob)(req.params.jobId);
        return res.json({ projects });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load local projects for job.';
        console.error('Local document for-job error:', message);
        return res.status(502).json({ error: message });
    }
});
// DELETE /local-documents/projects?name=... — entire GX10 project
router.delete('/projects', async (req, res) => {
    if (rejectIfUnavailable(res, req.user.role))
        return;
    try {
        const raw = req.query.name;
        const projectName = typeof raw === 'string' ? raw.trim() : '';
        if (!projectName)
            return res.status(400).json({ error: 'Query param name is required.' });
        const result = await (0, localDocumentService_1.deleteLocalProject)(projectName);
        return res.json(result);
    }
    catch (err) {
        const status = err?.status;
        const message = err instanceof Error ? err.message : 'Could not delete local project.';
        console.error('Local project delete error:', message);
        if (status === 404)
            return res.status(404).json({ error: message });
        return res.status(502).json({ error: message });
    }
});
// DELETE /local-documents/:id — one file
router.delete('/:id', async (req, res) => {
    if (rejectIfUnavailable(res, req.user.role))
        return;
    try {
        const result = await (0, localDocumentService_1.deleteLocalDocument)(req.params.id);
        return res.json(result);
    }
    catch (err) {
        const status = err?.status;
        const message = err instanceof Error ? err.message : 'Could not delete local document.';
        console.error('Local document delete error:', message);
        if (status === 404)
            return res.status(404).json({ error: message });
        return res.status(502).json({ error: message });
    }
});
// GET /local-documents/:id/file?download=1
router.get('/:id/file', async (req, res) => {
    if (rejectIfUnavailable(res, req.user.role))
        return;
    try {
        const file = await (0, localDocumentService_1.getLocalDocumentFile)(req.params.id);
        if (!file)
            return res.status(404).json({ error: 'Document not found in local archive.' });
        const disposition = req.query.download === '1' ? 'attachment' : 'inline';
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.fileName)}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.send(file.buffer);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Could not retrieve file from local archive.';
        console.error('Local document proxy error:', message);
        return res.status(502).json({ error: message });
    }
});
exports.default = router;
