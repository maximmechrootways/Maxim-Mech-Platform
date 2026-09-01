"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const injuryReportService_1 = require("../services/injuryReportService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const userName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
        const status = req.query.status || undefined;
        const jobId = req.query.jobId || undefined;
        const subcontractorId = req.query.subcontractorId || undefined;
        const list = await (0, injuryReportService_1.listInjuryReports)(userId, role, { status, jobId, subcontractorId });
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const report = await (0, injuryReportService_1.getInjuryReportById)(req.params.id, req.user.role);
        res.status(200).json(report);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const userName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
        const report = await (0, injuryReportService_1.createInjuryReport)(userId, role, userName, req.body);
        res.status(201).json(report);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const report = await (0, injuryReportService_1.updateInjuryReport)(req.params.id, req.user.role, req.body);
        res.status(200).json(report);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        await (0, injuryReportService_1.deleteInjuryReport)(req.params.id, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
// Root cause: get by linked injury
router.get('/:id/root-cause', async (req, res, next) => {
    try {
        const root = await (0, injuryReportService_1.getRootCauseByLinked)('injury', req.params.id, req.user.role);
        if (!root)
            return res.status(404).json({ error: 'Root cause not found' });
        res.status(200).json(root);
    }
    catch (e) {
        next(e);
    }
});
// Root cause: create or update
router.put('/:id/root-cause', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const userName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
        const root = await (0, injuryReportService_1.upsertRootCause)(userId, role, userName, {
            linkedType: 'injury',
            linkedId: req.params.id,
            immediateCause: req.body.immediateCause,
            contributingCauses: req.body.contributingCauses,
            underlyingCause: req.body.underlyingCause,
        });
        res.status(200).json(root);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
