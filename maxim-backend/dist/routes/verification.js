"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
// POST /auth/send-verification — resend verification email (authenticated)
router.post('/send-verification', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const email = req.user.email;
        await (0, emailService_1.sendVerificationEmail)(userId, email);
        res.status(200).json({ message: 'Verification email sent' });
    }
    catch (e) {
        next(e);
    }
});
// GET /auth/verify-email?token=xxx — public link from email
router.get('/verify-email', async (req, res, next) => {
    try {
        const { token } = req.query;
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Token is required' });
        }
        const userId = await (0, emailService_1.verifyEmailToken)(token);
        if (!userId) {
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }
        // Redirect to frontend success page
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/verify-email?success=true`);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
