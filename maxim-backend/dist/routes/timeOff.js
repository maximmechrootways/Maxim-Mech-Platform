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
const timeOffService = __importStar(require("../services/timeOffService"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/team-labourers', async (req, res, next) => {
    try {
        const team = await timeOffService.listVisibleLabourersForTimeOff(req.user.id, req.user.role);
        res.json(team);
    }
    catch (e) {
        next(e);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const data = await timeOffService.listTimeOffEntries(req.user.id, req.user.role, {
            year: String(req.query.year || ''),
            labourerId: String(req.query.labourerId || ''),
        });
        res.json(data);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const created = await timeOffService.createTimeOffEntry(req.user.id, req.user.role, {
            labourerId: req.body?.labourerId,
            reason: req.body?.reason,
            compensation: req.body?.compensation,
            startDate: req.body?.startDate,
            endDate: req.body?.endDate,
            notes: req.body?.notes,
        });
        res.status(201).json(created);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const updated = await timeOffService.updateTimeOffEntry(req.user.id, req.user.role, String(req.params.id || ''), {
            labourerId: req.body?.labourerId,
            reason: req.body?.reason,
            compensation: req.body?.compensation,
            startDate: req.body?.startDate,
            endDate: req.body?.endDate,
            notes: req.body?.notes,
        });
        res.json(updated);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await timeOffService.deleteTimeOffEntry(req.user.id, req.user.role, String(req.params.id || ''));
        res.json(deleted);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
