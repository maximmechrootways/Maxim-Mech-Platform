"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const submissionService_1 = require("../services/submissionService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const status = req.query.status || undefined;
        const templateId = req.query.templateId || undefined;
        const list = await (0, submissionService_1.listFormSubmissions)(userId, role, { status, templateId });
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const submission = await (0, submissionService_1.getFormSubmissionById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(submission);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const result = await (0, submissionService_1.createFormSubmission)(req.user.id, req.user.role, req.body);
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const result = await (0, submissionService_1.updateFormSubmission)(req.params.id, req.user.id, req.user.role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
