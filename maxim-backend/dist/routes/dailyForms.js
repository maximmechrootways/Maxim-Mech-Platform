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
const signableSubmissionService_1 = require("../services/signableSubmissionService");
const jobService_1 = require("../services/jobService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const list = await (0, signableSubmissionService_1.listDailyForms)(req.user.id, req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/my-team', async (req, res, next) => {
    try {
        const role = req.user.role;
        if (role !== 'supervisor' && role !== 'owner' && role !== 'hr') {
            return res.status(403).json({ error: 'Only supervisors, Owner, or HR can list team members' });
        }
        const team = await (0, jobService_1.getMyTeamMembers)(req.user.id, role);
        res.status(200).json(team);
    }
    catch (e) {
        next(e);
    }
});
router.post('/assign', async (req, res, next) => {
    try {
        const body = req.body;
        const signableFormTemplateId = body.signableFormTemplateId;
        const assignedToUserIds = Array.isArray(body.assignedToUserIds) ? body.assignedToUserIds : [];
        const signatories = body.signatories;
        const dueDate = body.dueDate ?? new Date().toISOString().slice(0, 10);
        const schedule = body.schedule ?? 'daily';
        if (!signableFormTemplateId || (assignedToUserIds.length === 0 && (!signatories || signatories.length === 0))) {
            return res.status(400).json({ error: 'signableFormTemplateId and assignedToUserIds/signatories are required' });
        }
        const result = await (0, signableSubmissionService_1.createFormAssignments)(req.user.id, req.user.role, {
            signableFormTemplateId,
            assignedToUserIds,
            signatories,
            dueDate,
            schedule,
        });
        res.status(201).json(result);
    }
    catch (e) {
        const err = e;
        if (err.status)
            return res.status(err.status).json({ error: err.message });
        next(e);
    }
});
router.post('/pass', async (req, res, next) => {
    try {
        const body = req.body;
        if (!body.assignmentId || !body.toUserId) {
            return res.status(400).json({ error: 'assignmentId and toUserId are required' });
        }
        const result = await (0, signableSubmissionService_1.passAlongFormAssignment)(req.user.id, body);
        res.status(201).json({ assignment: result });
    }
    catch (e) {
        const err = e;
        if (err.status)
            return res.status(err.status).json({ error: err.message });
        next(e);
    }
});
router.get('/assignments/:id', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../lib/prisma')));
        const assignment = await prisma.formAssignment.findUnique({
            where: { id: req.params.id },
            include: {
                signableFormTemplate: true,
                signatories: {
                    orderBy: { order: 'asc' },
                    include: { user: { select: { firstName: true, lastName: true, role: true } } }
                }
            }
        });
        if (!assignment)
            return res.status(404).json({ error: 'Not found' });
        res.status(200).json(assignment);
    }
    catch (e) {
        next(e);
    }
});
router.get('/assignments/:id/chain', async (req, res, next) => {
    try {
        const chain = await (0, signableSubmissionService_1.getAssignmentChain)(req.params.id);
        res.status(200).json({ chain });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/forward-hr', async (req, res, next) => {
    try {
        const assignmentId = req.params.id;
        const userRole = req.user.role;
        if (userRole !== 'supervisor' && userRole !== 'owner') {
            return res.status(403).json({ error: 'Only supervisors and owners can forward to HR' });
        }
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../lib/prisma')));
        const assignment = await prisma.formAssignment.findUnique({
            where: { id: assignmentId },
            include: { signableFormTemplate: true }
        });
        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        if (assignment.chainStatus !== 'completed') {
            return res.status(400).json({ error: 'Form is not yet fully signed' });
        }
        await prisma.formAssignment.update({
            where: { id: assignmentId },
            data: {
                chainStatus: 'forwarded_hr',
                forwardedToHRAt: new Date(),
                forwardedToHRById: req.user.id,
            }
        });
        const hrUsers = await prisma.user.findMany({
            where: { role: 'hr' },
            select: { id: true },
        });
        const notificationService = await Promise.resolve().then(() => __importStar(require('../services/notificationService')));
        // Fetch user for name
        const currentUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { firstName: true },
        });
        const senderName = currentUser ? currentUser.firstName : 'A supervisor';
        for (const hr of hrUsers) {
            await notificationService.createNotification({
                userId: hr.id,
                title: 'Signed form forwarded for filing',
                body: `${senderName} has forwarded "${assignment.signableFormTemplate.name}" — fully signed by all workers.`,
                type: 'info',
                linkTo: `/daily-forms/hr/${assignmentId}`,
                emailPreferenceKey: 'forms_pending',
            }).catch(() => { });
        }
        res.status(200).json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/sequential-sign', async (req, res, next) => {
    try {
        const assignmentId = req.params.id;
        const userId = req.user.id;
        const { signatureUrl, fieldValues } = req.body;
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../lib/prisma')));
        // Fetch user for name
        const currentUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { firstName: true, lastName: true },
        });
        const signatoryName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Someone';
        // 1. Mark this signatory as signed
        await prisma.formSignatory.updateMany({
            where: { assignmentId, userId },
            data: {
                status: 'signed',
                signedAt: new Date(),
                signatureUrl,
                fieldValues,
                signatoryName,
            }
        });
        // 2. Check if all signatories are done
        const allSignatories = await prisma.formSignatory.findMany({
            where: { assignmentId }
        });
        const allSigned = allSignatories.every(s => s.status === 'signed');
        const { generateFinalSignedPdf, notifyNextSignatory } = await Promise.resolve().then(() => __importStar(require('../lib/pdf-signer')));
        if (allSigned) {
            // Generate the final merged PDF with ALL signatures
            const finalPdfUrl = await generateFinalSignedPdf(assignmentId);
            await prisma.formAssignment.update({
                where: { id: assignmentId },
                data: {
                    chainStatus: 'completed',
                    status: 'completed',
                    finalSignedPdfUrl: finalPdfUrl,
                }
            });
            const { routeBackToSupervisor } = await Promise.resolve().then(() => __importStar(require('../lib/pdf-signer')));
            // Route back to supervisor — notify them
            await routeBackToSupervisor(assignmentId);
        }
        else {
            // More workers remain — trigger the next one
            await notifyNextSignatory(assignmentId);
        }
        res.status(200).json({ success: true, allSigned });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
