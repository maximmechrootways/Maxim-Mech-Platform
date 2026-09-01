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
const weeklyProjectInspectionService = __importStar(require("../services/weeklyProjectInspectionService"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const list = await weeklyProjectInspectionService.listWeeklyProjectInspections({
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
        });
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const item = await weeklyProjectInspectionService.getWeeklyProjectInspectionById(req.params.id);
        res.status(200).json(item);
    }
    catch (e) {
        next(e);
    }
});
function userName(req) {
    const u = req.user;
    return (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : '') || 'Unknown';
}
router.post('/', async (req, res, next) => {
    try {
        const user = req.user;
        const item = await weeklyProjectInspectionService.createWeeklyProjectInspection(user.id, userName(req), req.body);
        res.status(201).json(item);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
