"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const requireRole_1 = require("../middleware/requireRole");
const prisma_1 = require("../lib/prisma");
const inviteService_1 = require("../services/inviteService");
const inviteEmailService_1 = require("../services/inviteEmailService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// Generate a new invite code for an employee email (HR/owner only)
router.post('/generate', (0, requireRole_1.requireRole)('hr', 'owner'), async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        const result = await (0, inviteService_1.generateInviteCode)(req.user.id, email);
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
// Regenerate invite code (e.g. if original expired)
router.post('/regenerate', (0, requireRole_1.requireRole)('hr', 'owner'), async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        const normalizedEmail = String(email).trim().toLowerCase();
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, email: true, firstName: true, isActive: true },
        });
        if (!user) {
            return res.status(404).json({ error: 'No user found with this email address' });
        }
        if (!user.isActive) {
            return res.status(400).json({ error: 'This account is deactivated' });
        }
        const result = await (0, inviteService_1.regenerateInviteCode)(req.user.id, normalizedEmail);
        const emailResult = await (0, inviteEmailService_1.enqueueInviteCodeEmail)({
            userId: user.id,
            toEmail: user.email,
            inviteCode: result.code,
            expiresAt: result.expiresAt,
            firstName: user.firstName,
            reason: 'hr_regenerate',
        });
        res.status(201).json({
            ...result,
            emailEnqueued: emailResult.enqueued,
        });
    }
    catch (e) {
        next(e);
    }
});
// List all invite codes (HR/owner only)
router.get('/list', (0, requireRole_1.requireRole)('hr', 'owner'), async (_req, res, next) => {
    try {
        const codes = await (0, inviteService_1.listInviteCodes)();
        res.status(200).json(codes);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
