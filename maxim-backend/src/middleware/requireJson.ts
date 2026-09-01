import { Request, Response, NextFunction } from 'express'

/**
 * Reject requests that are not application/json.
 * Prevents attackers from uploading files or form-data to login/auth endpoints.
 */
export function requireJson(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
        return next()
    }
    const ct = (req.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
    if (ct !== 'application/json') {
        return res.status(415).json({ error: 'Content-Type must be application/json' })
    }
    next()
}
