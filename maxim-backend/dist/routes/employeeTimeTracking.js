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
const svc = __importStar(require("../services/employeeTimeTrackingService"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/sessions/active', async (req, res, next) => {
    try {
        const q = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
        const selfId = req.user.id;
        const subjectId = q && q !== selfId ? q : selfId;
        if (subjectId !== selfId) {
            try {
                await svc.assertEmployeeTimeViewerMayAccessSubject(selfId, req.user.role, subjectId);
            }
            catch (e) {
                if (e?.status)
                    return res.status(e.status).json({ error: e.message });
                throw e;
            }
        }
        const row = await svc.getActiveSession(subjectId);
        res.status(200).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.get('/sessions', async (req, res, next) => {
    try {
        const list = await svc.listSessions(req.user.id, req.user.role, {
            userId: req.query.userId,
            from: req.query.from,
            to: req.query.to,
        });
        res.status(200).json(list);
    }
    catch (e) {
        if (e?.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/sessions/start', async (req, res, next) => {
    try {
        const rawFor = typeof req.body?.forUserId === 'string' ? req.body.forUserId.trim() : '';
        const selfId = req.user.id;
        const labourerId = rawFor && rawFor !== selfId ? rawFor : selfId;
        if (labourerId !== selfId) {
            try {
                await svc.assertEmployeeTimeViewerMayAccessSubject(selfId, req.user.role, labourerId);
            }
            catch (e) {
                if (e?.status)
                    return res.status(e.status).json({ error: e.message });
                throw e;
            }
        }
        const item = await svc.startSession(labourerId, req.user.id, req.user.role, {
            siteId: req.body?.siteId,
            jobId: req.body?.jobId,
            subcontractorId: req.body?.subcontractorId,
            subcontractorPersonnelId: req.body?.subcontractorPersonnelId,
            startNote: req.body?.startNote,
            startLatitude: req.body?.startLatitude != null ? Number(req.body.startLatitude) : undefined,
            startLongitude: req.body?.startLongitude != null ? Number(req.body.startLongitude) : undefined,
            startAccuracyM: req.body?.startAccuracyM != null ? Number(req.body.startAccuracyM) : undefined,
        });
        res.status(201).json(item);
    }
    catch (e) {
        if (e?.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/sessions/:id/end', async (req, res, next) => {
    try {
        const item = await svc.endSession(req.user.id, req.user.role, req.params.id, {
            endNote: req.body?.endNote,
            endLatitude: req.body?.endLatitude != null ? Number(req.body.endLatitude) : undefined,
            endLongitude: req.body?.endLongitude != null ? Number(req.body.endLongitude) : undefined,
            endAccuracyM: req.body?.endAccuracyM != null ? Number(req.body.endAccuracyM) : undefined,
        });
        res.status(200).json(item);
    }
    catch (e) {
        if (e?.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.get('/site/:siteId/roster', async (req, res, next) => {
    try {
        const roster = await svc.getSiteWorkRoster(req.user.id, req.user.role, req.params.siteId);
        res.status(200).json(roster);
    }
    catch (e) {
        if (e?.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
router.post('/site/bulk-start', async (req, res, next) => {
    try {
        const summary = await svc.bulkStartSessionsAtSite(req.user.id, req.user.role, {
            siteId: req.body?.siteId ?? '',
            userIds: Array.isArray(req.body?.userIds) ? req.body.userIds : [],
            jobId: req.body?.jobId,
            startNote: req.body?.startNote,
            startLatitude: req.body?.startLatitude != null ? Number(req.body.startLatitude) : undefined,
            startLongitude: req.body?.startLongitude != null ? Number(req.body.startLongitude) : undefined,
            startAccuracyM: req.body?.startAccuracyM != null ? Number(req.body.startAccuracyM) : undefined,
        });
        res.status(200).json(summary);
    }
    catch (e) {
        if (e?.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
exports.default = router;
