"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const validate_1 = require("../utils/validate");
const jobService_1 = require("../services/jobService");
const jobSchemas_1 = require("../schemas/jobSchemas");
const projectDocumentFolders_1 = __importDefault(require("./projectDocumentFolders"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const parsed = jobSchemas_1.listJobsQuerySchema.safeParse(req.query);
        const query = parsed.success ? parsed.data : {};
        const jobs = await (0, jobService_1.listJobs)(userId, role, query);
        res.status(200).json(jobs);
    }
    catch (e) {
        next(e);
    }
});
router.get('/my-jobs', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const jobs = await (0, jobService_1.getMyJobs)(userId);
        res.status(200).json(jobs);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', (0, validate_1.validateRequest)(jobSchemas_1.createJobSchema), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const job = await (0, jobService_1.createJob)(userId, role, req.body);
        res.status(201).json(job);
    }
    catch (e) {
        next(e);
    }
});
router.use('/:id/document-folders', projectDocumentFolders_1.default);
router.get('/:id', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const job = await (0, jobService_1.getJobById)(req.params.id, userId, role);
        res.status(200).json(job);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', (0, validate_1.validateRequest)(jobSchemas_1.updateJobSchema), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const job = await (0, jobService_1.updateJob)(req.params.id, userId, role, req.body);
        res.status(200).json(job);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        await (0, jobService_1.deleteJob)(req.params.id, userId, role);
        res.status(200).json({ message: 'Job deleted' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/supervisors', (0, validate_1.validateRequest)(jobSchemas_1.addSupervisorSchema), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const result = await (0, jobService_1.addSupervisor)(req.params.id, userId, role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id/supervisors/:userId', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const result = await (0, jobService_1.removeSupervisor)(req.params.id, req.params.userId, userId, role);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/labourers', (0, validate_1.validateRequest)(jobSchemas_1.addLabourerSchema), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const result = await (0, jobService_1.addLabourer)(req.params.id, userId, role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id/labourers/:userId', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const result = await (0, jobService_1.removeLabourer)(req.params.id, req.params.userId, userId, role);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/subcontractors', (0, validate_1.validateRequest)(jobSchemas_1.addSubcontractorSchema), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const result = await (0, jobService_1.addSubcontractor)(req.params.id, userId, role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id/subcontractors/:subcontractorId', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const result = await (0, jobService_1.removeSubcontractor)(req.params.id, req.params.subcontractorId, userId, role);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/check-in', (0, validate_1.validateRequest)(jobSchemas_1.checkInSchema), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const result = await (0, jobService_1.checkIn)(req.params.id, userId, role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/check-in/reset', (0, validate_1.validateRequest)(jobSchemas_1.resetCheckInSchema), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const result = await (0, jobService_1.resetCheckIn)(req.params.id, userId, role, req.body);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
