"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authService_1 = require("../services/authService");
const authSchemas_1 = require("../schemas/authSchemas");
const validate_1 = require("../utils/validate");
const authenticate_1 = require("../middleware/authenticate");
// Rate limiter disabled — mobile users on CGNAT share IPs and hit 429s.
// import { loginLimiter } from '../middleware/rateLimiter'
const requireJson_1 = require("../middleware/requireJson");
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
router.use(requireJson_1.requireJson);
router.post('/login', (0, validate_1.validateRequest)(authSchemas_1.loginSchema), async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const data = await (0, authService_1.loginUser)(req.body, ip);
        res.status(200).json({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    }
    catch (e) {
        next(e);
    }
});
router.post('/login-invite', (0, validate_1.validateRequest)(authSchemas_1.inviteLoginSchema), async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const data = await (0, authService_1.loginWithInviteCode)(req.body.email, req.body.inviteCode, ip);
        res.status(200).json({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    }
    catch (e) {
        next(e);
    }
});
router.post('/setup-profile', authenticate_1.authenticate, (0, validate_1.validateRequest)(authSchemas_1.setupProfileSchema), async (req, res, next) => {
    try {
        const result = await (0, authService_1.setupProfile)(req.user.id, req.body.password, req.body.displayName);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/forgot-password', (0, validate_1.validateRequest)(authSchemas_1.forgotPasswordSchema), async (req, res, next) => {
    try {
        const result = await (0, emailService_1.sendPasswordResetEmail)(req.body.email);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/reset-password', (0, validate_1.validateRequest)(authSchemas_1.resetPasswordSchema), async (req, res, next) => {
    try {
        const result = await (0, emailService_1.resetPasswordWithToken)(req.body.token, req.body.password);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/refresh', (0, validate_1.validateRequest)(authSchemas_1.refreshSchema), async (req, res, next) => {
    try {
        const data = await (0, authService_1.refreshUserToken)(req.body.refreshToken);
        res.status(200).json({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    }
    catch (e) {
        next(e);
    }
});
router.post('/logout', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const refreshToken = req.body?.refreshToken;
        if (refreshToken)
            await (0, authService_1.logoutUser)(refreshToken);
        res.status(200).json({ message: 'Logged out successfully' });
    }
    catch (e) {
        next(e);
    }
});
router.get('/me', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const user = await (0, authService_1.getMe)(req.user.id);
        res.status(200).json(user);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
