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
const googleCalendarService = __importStar(require("../services/googleCalendarService"));
const router = (0, express_1.Router)();
/** Return Google OAuth URL so the frontend can redirect (user must be logged in). */
router.get('/auth-url', authenticate_1.authenticate, (req, res, next) => {
    try {
        const url = googleCalendarService.getAuthUrl(req.user.id);
        res.json({ url });
    }
    catch (e) {
        next(e);
    }
});
/** Redirect to Google OAuth (user must be logged in). */
router.get('/connect', authenticate_1.authenticate, (req, res, next) => {
    try {
        const url = googleCalendarService.getAuthUrl(req.user.id);
        res.redirect(302, url);
    }
    catch (e) {
        next(e);
    }
});
/** Google redirects here with ?code=...&state=... (no auth middleware). */
router.get('/callback', async (req, res, next) => {
    try {
        const code = req.query.code;
        const state = req.query.state;
        if (!code || !state) {
            const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(302, `${frontendOrigin}/hr/todo?calendar=error`);
        }
        const redirectUrl = await googleCalendarService.handleCallback(code, state);
        res.redirect(302, redirectUrl);
    }
    catch (e) {
        const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(302, `${frontendOrigin}/hr/todo?calendar=error`);
    }
});
/** Connection status (connected or not). */
router.get('/status', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const status = await googleCalendarService.getStatus(req.user.id);
        res.json(status);
    }
    catch (e) {
        next(e);
    }
});
/** List events in range (from & to as ISO date or datetime). */
router.get('/events', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const from = req.query.from || new Date().toISOString();
        const to = req.query.to || new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
        const events = await googleCalendarService.listEvents(req.user.id, from, to);
        res.json(events);
    }
    catch (e) {
        next(e);
    }
});
/** Disconnect Google Calendar. */
router.post('/disconnect', authenticate_1.authenticate, async (req, res, next) => {
    try {
        await googleCalendarService.disconnect(req.user.id);
        res.json({ message: 'Disconnected' });
    }
    catch (e) {
        next(e);
    }
});
/** Create a new event on the user's Google Calendar. */
router.post('/events', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const { summary, description, startDateTime, endDateTime, timeZone } = req.body;
        if (!summary || !startDateTime || !endDateTime) {
            return res.status(400).json({ error: 'summary, startDateTime, and endDateTime are required' });
        }
        const event = await googleCalendarService.createEvent(req.user.id, {
            summary,
            description,
            startDateTime,
            endDateTime,
            timeZone,
        });
        res.status(201).json(event);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
