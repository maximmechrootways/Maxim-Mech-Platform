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
const prisma_1 = require("../lib/prisma");
const notificationService = __importStar(require("../services/notificationService"));
const formsApprovalDigestService_1 = require("../services/formsApprovalDigestService");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const list = await notificationService.listForUser(req.user.id, {
            unreadOnly: req.query.unreadOnly,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        });
        res.json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/preferences/email', async (req, res, next) => {
    try {
        const pref = await notificationService.getEmailPreference(req.user.id);
        res.json(pref);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/preferences/email', async (req, res, next) => {
    try {
        const raw = req.body?.emailEnabled;
        if (typeof raw !== 'boolean') {
            return res.status(400).json({ error: 'emailEnabled must be a boolean' });
        }
        const emailEnabled = raw;
        const pref = await notificationService.setEmailPreference(req.user.id, emailEnabled);
        res.json(pref);
    }
    catch (e) {
        next(e);
    }
});
router.post('/read-all', async (req, res, next) => {
    try {
        await notificationService.markAllRead(req.user.id);
        res.json({ message: 'OK' });
    }
    catch (e) {
        next(e);
    }
});
/**
 * HR/Owner: enqueue a [TEST] copy of the weekday digest to your email.
 * Authorize by **database** role (not JWT `role`) so it still works if the session “view role” was switched in the UI.
 */
router.post('/test-forms-digest', async (req, res, next) => {
    try {
        const account = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, role: true, isActive: true },
        });
        if (!account || (account.role !== 'owner' && account.role !== 'hr')) {
            return res.status(403).json({ error: 'Only HR and Owner can send a test digest.' });
        }
        if (!account.isActive) {
            return res.status(400).json({ error: 'Account is not active.' });
        }
        const result = await (0, formsApprovalDigestService_1.enqueueTestFormsApprovalDigestForUser)(account.id);
        res.json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/read', async (req, res, next) => {
    try {
        const item = await notificationService.markRead(req.params.id, req.user.id);
        res.json(item);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
