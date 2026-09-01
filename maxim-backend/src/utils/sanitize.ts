import { JSDOM } from 'jsdom'
import DOMPurify, { type WindowLike } from 'dompurify'

const window = new JSDOM('').window
const purify = DOMPurify(window as unknown as WindowLike)

/**
 * Strips all HTML tags and dangerous content from a string.
 * Use on all free-text user input before saving to DB.
 */
export function sanitizeText(input: unknown): string {
    if (typeof input !== 'string') return ''
    return purify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
}

/** Signature images must not go through HTML sanitization (DOMPurify strips/corrupts base64 data URLs). */
function preserveUnsanitizedString(s: string): boolean {
    return s.startsWith('data:image/')
}

/**
 * Recursively sanitizes all string values in an object.
 * Use on req.body before passing to service functions.
 */
export function sanitizeBody(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            result[key] = preserveUnsanitizedString(value) ? value : sanitizeText(value)
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            result[key] = sanitizeBody(value as Record<string, unknown>)
        } else if (Array.isArray(value)) {
            result[key] = value.map((item) => {
                if (typeof item === 'string') {
                    return preserveUnsanitizedString(item) ? item : sanitizeText(item)
                }
                if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                    return sanitizeBody(item as Record<string, unknown>)
                }
                return item
            })
        } else {
            result[key] = value
        }
    }
    return result
}
