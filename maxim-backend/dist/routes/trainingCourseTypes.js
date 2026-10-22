"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const trainingCourseTypeService_1 = require("../services/trainingCourseTypeService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
function requireOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
router.get('/', async (req, res, next) => {
    try {
        const includeInactive = String(req.query.includeInactive || '') === 'true';
        // Supervisors can read active list for viewing; HR/owner can include inactive when managing
        if (includeInactive && !requireOwnerOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view inactive course types' });
        }
        const list = await (0, trainingCourseTypeService_1.listTrainingCourseTypes)({ includeInactive });
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.post('/ensure', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can refresh the course catalog' });
        }
        await (0, trainingCourseTypeService_1.ensureTrainingCourseCatalog)();
        const list = await (0, trainingCourseTypeService_1.listTrainingCourseTypes)({ includeInactive: true });
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can add course types' });
        }
        const created = await (0, trainingCourseTypeService_1.createTrainingCourseType)({
            name: String(req.body?.name || ''),
            isPrimary: !!req.body?.isPrimary,
        });
        res.status(201).json(created);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can edit course types' });
        }
        const updated = await (0, trainingCourseTypeService_1.updateTrainingCourseType)(req.params.id, {
            name: req.body?.name !== undefined ? String(req.body.name) : undefined,
            isPrimary: req.body?.isPrimary !== undefined ? !!req.body.isPrimary : undefined,
            sortOrder: req.body?.sortOrder !== undefined ? Number(req.body.sortOrder) : undefined,
            isActive: req.body?.isActive !== undefined ? !!req.body.isActive : undefined,
        });
        res.status(200).json(updated);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/merge', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can merge course types' });
        }
        const intoId = String(req.body?.intoId || '');
        if (!intoId)
            return res.status(400).json({ error: 'intoId is required' });
        const result = await (0, trainingCourseTypeService_1.mergeTrainingCourseType)({
            fromId: req.params.id,
            intoId,
        });
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can delete course types' });
        }
        const mergeIntoId = req.query.mergeIntoId ? String(req.query.mergeIntoId) : req.body?.mergeIntoId;
        const result = await (0, trainingCourseTypeService_1.deleteTrainingCourseType)(req.params.id, {
            mergeIntoId: mergeIntoId ? String(mergeIntoId) : undefined,
        });
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
