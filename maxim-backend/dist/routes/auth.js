"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authService_1 = require("../services/authService");
const authSchemas_1 = require("../schemas/authSchemas");
const validate_1 = require("../utils/validate");
const authenticate_1 = require("../middleware/authenticate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
router.post('/register', rateLimiter_1.registerLimiter, (0, validate_1.validateRequest)(authSchemas_1.registerSchema), async (req, res, next) => {
    try {
        const user = await (0, authService_1.registerUser)(req.body);
        res.status(201).json(user);
    }
    catch (e) {
        next(e);
    }
});
router.post('/login', rateLimiter_1.loginLimiter, (0, validate_1.validateRequest)(authSchemas_1.loginSchema), async (req, res, next) => {
    try {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const data = await (0, authService_1.loginUser)(req.body, ip);
        res.status(200).json(data);
    }
    catch (e) {
        next(e);
    }
});
router.post('/refresh', (0, validate_1.validateRequest)(authSchemas_1.refreshSchema), async (req, res, next) => {
    try {
        const data = await (0, authService_1.refreshUserToken)(req.body);
        res.status(200).json(data);
    }
    catch (e) {
        next(e);
    }
});
router.post('/logout', authenticate_1.authenticate, (0, validate_1.validateRequest)(authSchemas_1.refreshSchema), async (req, res, next) => {
    try {
        await (0, authService_1.logoutUser)(req.body.refreshToken);
        res.status(200).json({ message: 'Logged out successfully' });
    }
    catch (e) {
        next(e);
    }
});
router.get('/me', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await (0, authService_1.getMe)(userId);
        res.status(200).json(user);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
