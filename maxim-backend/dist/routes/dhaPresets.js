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
const dhaPresetService = __importStar(require("../services/dhaPresetService"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// GET /dha-presets — list all presets
router.get('/', async (_req, res, next) => {
    try {
        const list = await dhaPresetService.listDhaPresets();
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
// POST /dha-presets — create a new preset
router.post('/', async (req, res, next) => {
    try {
        const { name, data } = req.body;
        if (!name?.trim())
            return res.status(400).json({ error: 'Name is required' });
        const result = await dhaPresetService.createDhaPreset(req.user.id, name, data);
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
// PATCH /dha-presets/:id — update a preset
router.patch('/:id', async (req, res, next) => {
    try {
        const { name, data } = req.body;
        const result = await dhaPresetService.updateDhaPreset(req.params.id, req.user.id, req.user.role, name, data);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
// DELETE /dha-presets/:id — delete a preset
router.delete('/:id', async (req, res, next) => {
    try {
        const result = await dhaPresetService.deleteDhaPreset(req.params.id, req.user.id, req.user.role);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
