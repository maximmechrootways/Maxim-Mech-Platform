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
const productFeedbackService = __importStar(require("../services/productFeedbackService"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.post('/', async (req, res, next) => {
    try {
        const item = await productFeedbackService.submitProductFeedback({
            userId: req.user.id,
            userRole: req.user.role,
            message: req.body?.message,
            pageUrl: req.body?.pageUrl,
        });
        res.status(201).json(item);
    }
    catch (e) {
        next(e);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const list = await productFeedbackService.listProductFeedback(req.user.role);
        res.json(list);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const item = await productFeedbackService.updateProductFeedback(req.user.role, req.params.id, {
            message: req.body?.message,
            completed: req.body?.completed,
        });
        res.json(item);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/retry-forward', async (req, res, next) => {
    try {
        const item = await productFeedbackService.retryProductFeedbackForward(req.user.role, req.params.id);
        res.json(item);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/comments', async (req, res, next) => {
    try {
        const comment = await productFeedbackService.addProductFeedbackComment({
            viewerRole: req.user.role,
            feedbackId: req.params.id,
            authorId: req.user.id,
            body: req.body?.body,
        });
        res.status(201).json(comment);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const result = await productFeedbackService.deleteProductFeedback(req.user.role, req.params.id);
        res.json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
