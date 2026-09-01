"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const signableSubmissionService_1 = require("../services/signableSubmissionService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const signableFormId = req.query.signableFormId || undefined;
        const list = await (0, signableSubmissionService_1.listSignableSubmissions)(req.user.id, req.user.role, { signableFormId });
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const submission = await (0, signableSubmissionService_1.getSignableSubmissionById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(submission);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const result = await (0, signableSubmissionService_1.createSignableSubmission)(req.user.id, req.body);
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const result = await (0, signableSubmissionService_1.updateSignableSubmission)(req.params.id, req.user.id, req.user.role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
