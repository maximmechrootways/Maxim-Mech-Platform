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
const incidentService = __importStar(require("../services/incidentService"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
function userName(req) {
    const u = req.user;
    return `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.email || 'Unknown';
}
router.get('/', async (req, res, next) => {
    try {
        const list = await incidentService.listIncidents(req.user.role, {
            status: req.query.status,
            siteId: req.query.siteId,
        });
        res.json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const item = await incidentService.getIncidentById(req.params.id, req.user.role);
        res.json(item);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const item = await incidentService.createIncident(req.user.id, req.user.role, userName(req), req.body);
        res.status(201).json(item);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const item = await incidentService.updateIncident(req.params.id, req.user.role, req.body, { userId: req.user.id, userName: userName(req) });
        res.json(item);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        await incidentService.deleteIncident(req.params.id, req.user.role, { userId: req.user.id, userName: userName(req) });
        res.json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
