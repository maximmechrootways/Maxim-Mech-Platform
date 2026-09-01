"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeInput = sanitizeInput;
const sanitize_1 = require("../utils/sanitize");
/**
 * Middleware that sanitizes all string fields in req.body.
 * Apply after express.json(); applies to all POST/PATCH that accept free text.
 */
function sanitizeInput(req, _res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = (0, sanitize_1.sanitizeBody)(req.body);
    }
    next();
}
