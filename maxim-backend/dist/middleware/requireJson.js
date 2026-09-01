"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireJson = requireJson;
/**
 * Reject requests that are not application/json.
 * Prevents attackers from uploading files or form-data to login/auth endpoints.
 */
function requireJson(req, res, next) {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
        return next();
    }
    const ct = (req.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (ct !== 'application/json') {
        return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    next();
}
