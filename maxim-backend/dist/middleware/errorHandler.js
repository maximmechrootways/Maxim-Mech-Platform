"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const multer_1 = __importDefault(require("multer"));
function errorHandler(err, req, res, _next) {
    if (err instanceof multer_1.default.MulterError) {
        let message = err.message;
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = `File exceeds the maximum allowed size (${process.env.MAX_FILE_SIZE_MB || '50'} MB).`;
        }
        return res.status(400).json({ error: message });
    }
    // Multer fileFilter passes a plain Error (no status) — avoid treating as 5xx.
    const msg = typeof err?.message === 'string' ? err.message : '';
    if (msg && !err?.status && !err?.statusCode && msg.includes('Allowed:')) {
        return res.status(400).json({ error: msg });
    }
    const status = err?.statusCode || err?.status || 500;
    const message = err?.message || 'Internal server error';
    // Only log as ERROR for unexpected server errors (5xx)
    // 4xx are expected operational errors (e.g. 401 on /auth/refresh) — no need to log
    if (status >= 500) {
        console.error(`[ERROR] ${req.method} ${req.path} ${status}: ${message}`);
        if (err?.stack)
            console.error(err.stack);
    }
    const isProd = process.env.NODE_ENV === 'production';
    res.status(status).json({
        error: isProd && status >= 500 ? 'An unexpected error occurred' : message
    });
}
