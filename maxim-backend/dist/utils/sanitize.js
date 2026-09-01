"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeText = sanitizeText;
exports.sanitizeBody = sanitizeBody;
const jsdom_1 = require("jsdom");
const dompurify_1 = __importDefault(require("dompurify"));
const window = new jsdom_1.JSDOM('').window;
const purify = (0, dompurify_1.default)(window);
/**
 * Strips all HTML tags and dangerous content from a string.
 * Use on all free-text user input before saving to DB.
 */
function sanitizeText(input) {
    if (typeof input !== 'string')
        return '';
    return purify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}
/** Signature images must not go through HTML sanitization (DOMPurify strips/corrupts base64 data URLs). */
function preserveUnsanitizedString(s) {
    return s.startsWith('data:image/');
}
/**
 * Recursively sanitizes all string values in an object.
 * Use on req.body before passing to service functions.
 */
function sanitizeBody(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            result[key] = preserveUnsanitizedString(value) ? value : sanitizeText(value);
        }
        else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            result[key] = sanitizeBody(value);
        }
        else if (Array.isArray(value)) {
            result[key] = value.map((item) => {
                if (typeof item === 'string') {
                    return preserveUnsanitizedString(item) ? item : sanitizeText(item);
                }
                if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                    return sanitizeBody(item);
                }
                return item;
            });
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
