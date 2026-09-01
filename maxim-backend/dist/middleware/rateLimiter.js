"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalLimiter = exports.registerLimiter = exports.loginLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
function keyGenerator(req) {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    return String(ip).replace(/:\d+$/, '').replace(/^::ffff:/, '');
}
exports.loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later' },
    keyGenerator,
});
exports.registerLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many registration attempts, please try again later' },
    keyGenerator,
});
exports.globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: 600, // Raised from 200 — SPA fires 10-15 parallel fetches per page load
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => req.path.startsWith('/auth'),
    keyGenerator,
});
