"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const projectDocumentFolderService_1 = require("../services/projectDocumentFolderService");
const router = (0, express_1.Router)({ mergeParams: true });
router.use(authenticate_1.authenticate);
function jobIdFromReq(req) {
    return (req.params.id || req.params.jobId);
}
function parseParentId(raw) {
    if (raw === undefined || raw === null || raw === '' || raw === 'root')
        return null;
    return String(raw);
}
router.get('/', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req);
        const parentId = parseParentId(req.query.parentId);
        const folders = await (0, projectDocumentFolderService_1.listProjectDocumentFolders)(jobId, parentId);
        res.status(200).json(folders);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:folderId/path', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req);
        const path = await (0, projectDocumentFolderService_1.getProjectDocumentFolderPath)(jobId, req.params.folderId);
        res.status(200).json(path);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req);
        const body = (req.body || {});
        const folder = await (0, projectDocumentFolderService_1.createProjectDocumentFolder)(req.user.id, req.user.role, jobId, {
            name: body.name || '',
            parentId: body.parentId ?? null,
        });
        res.status(201).json(folder);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:folderId', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req);
        const body = (req.body || {});
        const folder = await (0, projectDocumentFolderService_1.renameProjectDocumentFolder)(req.user.id, req.user.role, jobId, req.params.folderId, body.name || '');
        res.status(200).json(folder);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:folderId', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req);
        const result = await (0, projectDocumentFolderService_1.deleteProjectDocumentFolder)(req.user.id, req.user.role, jobId, req.params.folderId);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
