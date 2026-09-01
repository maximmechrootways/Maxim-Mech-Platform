"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const formAssignmentService = __importStar(require("../services/formAssignmentService"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// POST /form-assignments — create assignments (supervisor assigns to labourers)
router.post('/', async (req, res, next) => {
    try {
        const body = req.body;
        if (!body.templateId || !Array.isArray(body.assignedToUserIds) || body.assignedToUserIds.length === 0) {
            return res.status(400).json({ error: 'templateId and assignedToUserIds (non-empty) are required' });
        }
        const result = await formAssignmentService.createAssignments(req.user.id, req.user.role, {
            templateId: body.templateId,
            assignedToUserIds: body.assignedToUserIds,
            dueDate: body.dueDate,
            recurrence: body.recurrence,
            note: body.note,
        });
        res.status(201).json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
// GET /form-assignments — list assignments scoped by role
router.get('/', async (req, res, next) => {
    try {
        const query = {
            status: req.query.status,
            templateId: req.query.templateId,
            assignedToId: req.query.assignedToId,
        };
        const list = await formAssignmentService.listAssignments(req.user.id, req.user.role, query);
        res.json(list);
    }
    catch (e) {
        next(e);
    }
});
// GET /form-assignments/counts — dashboard widget counts
router.get('/counts', async (req, res, next) => {
    try {
        const counts = await formAssignmentService.getAssignmentCounts(req.user.id, req.user.role);
        res.json(counts);
    }
    catch (e) {
        next(e);
    }
});
// POST /form-assignments/:id/forward-hr — supervisor/owner forwards submission to HR
router.post('/:id/forward-hr', async (req, res, next) => {
    try {
        const result = await formAssignmentService.forwardAssignmentToHR(req.params.id, req.user.id, req.user.role);
        res.json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
// GET /form-assignments/:id — single assignment detail
router.get('/:id', async (req, res, next) => {
    try {
        const assignment = await formAssignmentService.getAssignmentById(req.params.id, req.user.id, req.user.role);
        res.json(assignment);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
// PATCH /form-assignments/:id/submit — labourer links their submission
router.patch('/:id/submit', async (req, res, next) => {
    try {
        const { submissionId } = req.body;
        if (!submissionId)
            return res.status(400).json({ error: 'submissionId is required' });
        const result = await formAssignmentService.linkSubmission(req.params.id, submissionId, req.user.id);
        res.json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
// PATCH /form-assignments/:id/review — supervisor reviews
router.patch('/:id/review', async (req, res, next) => {
    try {
        const { action, comment } = req.body;
        if (!action || !['reviewed', 'resubmission_required'].includes(action)) {
            return res.status(400).json({ error: 'action must be "reviewed" or "resubmission_required"' });
        }
        const result = await formAssignmentService.reviewAssignment(req.params.id, req.user.id, req.user.role, { action, comment });
        res.json(result);
    }
    catch (e) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
exports.default = router;
