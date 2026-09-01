import { Request, Response, NextFunction } from 'express'
import { sanitizeBody } from '../utils/sanitize'

/**
 * Middleware that sanitizes all string fields in req.body.
 * Apply after express.json(); applies to all POST/PATCH that accept free text.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeBody(req.body as Record<string, unknown>)
    }
    next()
}
