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
const zod_1 = require("zod");
const authenticate_1 = require("../middleware/authenticate");
const requireRole_1 = require("../middleware/requireRole");
const userService_1 = require("../services/userService");
const prisma_1 = require("../lib/prisma");
const inviteService_1 = require("../services/inviteService");
const auditLogService = __importStar(require("../services/auditLogService"));
const uiPreferencesService_1 = require("../services/uiPreferencesService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
const kissOptionsSchema = zod_1.z.object({
    largeTouchTargets: zod_1.z.boolean().optional(),
    guidedStepMode: zod_1.z.boolean().optional(),
    simplifiedNav: zod_1.z.boolean().optional(),
    showOnlyRequiredFirst: zod_1.z.boolean().optional(),
}).strict();
const notificationPreferencesPatchSchema = zod_1.z.object({
    forms_pending: zod_1.z.boolean().optional(),
    incidents: zod_1.z.boolean().optional(),
    digest: zod_1.z.boolean().optional(),
    digest_hr_owner_8am: zod_1.z.boolean().optional(),
    signatures: zod_1.z.boolean().optional(),
    incidents_site: zod_1.z.boolean().optional(),
    signature_required: zod_1.z.boolean().optional(),
    announcements: zod_1.z.boolean().optional(),
}).strict();
const uiPreferencesPatchSchema = zod_1.z.object({
    kissModeEnabled: zod_1.z.boolean().optional(),
    kissPresetName: zod_1.z.string().trim().max(100).nullable().optional(),
    kissOptions: kissOptionsSchema.optional(),
    notificationPreferences: notificationPreferencesPatchSchema.optional(),
}).strict();
// HR/Owner creates a new employee → auto-creates User (no password) + invite code
router.post('/', (0, requireRole_1.requireRole)('hr', 'owner'), async (req, res, next) => {
    try {
        const { email, firstName, lastName, role } = req.body;
        if (!email || !firstName || !lastName) {
            return res.status(400).json({ error: 'email, firstName, and lastName are required' });
        }
        const existing = await prisma_1.prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true },
        });
        if (existing) {
            return res.status(409).json({ error: 'A user with this email already exists' });
        }
        const user = await prisma_1.prisma.user.create({
            data: {
                email: email.toLowerCase(),
                firstName,
                lastName,
                role: role || 'labourer',
                hasCompletedSetup: false,
            },
            select: { id: true, email: true, firstName: true, lastName: true, role: true }
        });
        // Auto-generate invite code
        const invite = await (0, inviteService_1.generateInviteCode)(req.user.id, user.email);
        res.status(201).json({ user, inviteCode: invite.code, expiresAt: invite.expiresAt });
    }
    catch (e) {
        next(e);
    }
});
router.get('/admin', async (req, res, next) => {
    try {
        const users = await (0, userService_1.listAllUsersForAdmin)(req.user.role);
        res.status(200).json(users);
    }
    catch (e) {
        next(e);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const role = req.user.role;
        const users = await (0, userService_1.listUsersForAssignment)(role);
        res.status(200).json(users);
    }
    catch (e) {
        next(e);
    }
});
router.get('/supervisors', async (req, res, next) => {
    try {
        const role = req.user.role;
        const users = await (0, userService_1.listSupervisors)(role);
        res.status(200).json(users);
    }
    catch (e) {
        next(e);
    }
});
router.get('/me/preferences', async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { uiPreferences: true },
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const current = (user.uiPreferences && typeof user.uiPreferences === 'object')
            ? user.uiPreferences
            : {};
        const payload = (0, uiPreferencesService_1.normalizeUiPreferences)(current);
        res.status(200).json(payload);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/me/preferences', async (req, res, next) => {
    try {
        const parsed = uiPreferencesPatchSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid preferences payload', details: parsed.error.flatten() });
        }
        const currentUser = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { uiPreferences: true },
        });
        if (!currentUser)
            return res.status(404).json({ error: 'User not found' });
        const nextPreferences = (0, uiPreferencesService_1.mergeUiPreferences)(currentUser.uiPreferences, parsed.data);
        const data = {
            uiPreferences: nextPreferences,
        };
        if (parsed.data.notificationPreferences !== undefined) {
            data.emailNotificationsEnabled = (0, uiPreferencesService_1.anyNotificationEmailCategoryEnabled)(nextPreferences);
        }
        const updated = await prisma_1.prisma.user.update({
            where: { id: req.user.id },
            data,
            select: { uiPreferences: true },
        });
        res.status(200).json(updated.uiPreferences);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id/preferences', (0, requireRole_1.requireRole)('hr', 'owner'), async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.params.id },
            select: { uiPreferences: true },
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const current = (user.uiPreferences && typeof user.uiPreferences === 'object')
            ? user.uiPreferences
            : {};
        const payload = (0, uiPreferencesService_1.normalizeUiPreferences)(current);
        res.status(200).json(payload);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id/preferences', (0, requireRole_1.requireRole)('hr', 'owner'), async (req, res, next) => {
    try {
        const parsed = uiPreferencesPatchSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid preferences payload', details: parsed.error.flatten() });
        }
        const currentUser = await prisma_1.prisma.user.findUnique({
            where: { id: req.params.id },
            select: { uiPreferences: true },
        });
        if (!currentUser)
            return res.status(404).json({ error: 'User not found' });
        const nextPreferences = (0, uiPreferencesService_1.mergeUiPreferences)(currentUser.uiPreferences, parsed.data);
        const data = {
            uiPreferences: nextPreferences,
        };
        if (parsed.data.notificationPreferences !== undefined) {
            data.emailNotificationsEnabled = (0, uiPreferencesService_1.anyNotificationEmailCategoryEnabled)(nextPreferences);
        }
        const updated = await prisma_1.prisma.user.update({
            where: { id: req.params.id },
            data,
            select: { uiPreferences: true },
        });
        res.status(200).json(updated.uiPreferences);
    }
    catch (e) {
        next(e);
    }
});
// HR/Owner: update employee info or deactivate (verification flow can be added later)
router.patch('/:id', (0, requireRole_1.requireRole)('hr', 'owner'), async (req, res, next) => {
    try {
        const targetId = req.params.id;
        const body = req.body;
        const user = await (0, userService_1.updateUserForAdmin)(req.user.role, targetId, {
            firstName: body.firstName,
            lastName: body.lastName,
            phone: body.phone,
            jobTitle: body.jobTitle,
            department: body.department,
            birthday: body.birthday,
            emergencyContact1Name: body.emergencyContact1Name,
            emergencyContact1Phone: body.emergencyContact1Phone,
            emergencyContact1Relationship: body.emergencyContact1Relationship,
            emergencyContact2Name: body.emergencyContact2Name,
            emergencyContact2Phone: body.emergencyContact2Phone,
            emergencyContact2Relationship: body.emergencyContact2Relationship,
            emergencyNotes: body.emergencyNotes,
            role: body.role,
            employmentStatus: body.employmentStatus,
            hireDate: body.hireDate,
            onLeaveStartedAt: body.onLeaveStartedAt,
            terminatedAt: body.terminatedAt,
            isActive: body.isActive,
        });
        const actor = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id }, select: { firstName: true, lastName: true } });
        const userName = actor ? `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || req.user.email : req.user.email;
        await auditLogService.writeAuditLog({
            userId: req.user.id,
            userName,
            action: 'update',
            entityType: 'user',
            entityId: targetId,
            entityLabel: user.name,
            linkTo: `/employees/${targetId}`,
        }).catch(() => { });
        res.status(200).json(user);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', (0, requireRole_1.requireRole)('hr', 'owner'), async (req, res, next) => {
    try {
        const targetId = req.params.id;
        const deleted = await (0, userService_1.deleteUserForAdmin)(req.user.role, req.user.id, targetId);
        const actor = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id }, select: { firstName: true, lastName: true } });
        const userName = actor ? `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || req.user.email : req.user.email;
        await auditLogService.writeAuditLog({
            userId: req.user.id,
            userName,
            action: 'delete',
            entityType: 'user',
            entityId: targetId,
            entityLabel: deleted.name,
            linkTo: '/employees',
        }).catch(() => { });
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
