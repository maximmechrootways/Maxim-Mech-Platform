import { Request, Response, NextFunction } from 'express'
import multer from 'multer'

export function errorHandler(
    err: any,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    if (err instanceof multer.MulterError) {
        let message = err.message
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = `File exceeds the maximum allowed size (${process.env.MAX_FILE_SIZE_MB || '50'} MB).`
        }
        return res.status(400).json({ error: message })
    }

    // Multer fileFilter passes a plain Error (no status) — treat as bad request.
    const msg = typeof err?.message === 'string' ? err.message : ''
    if (
        msg &&
        !err?.status &&
        !err?.statusCode &&
        (msg.includes('Allowed:') || msg.includes('Only PDF') || msg.includes('files are allowed'))
    ) {
        return res.status(400).json({ error: msg })
    }

    const status = err?.statusCode || err?.status || 500
    const message = err?.message || 'Internal server error'
    const expose = Boolean(err?.expose)

    // Only log as ERROR for unexpected server errors (5xx)
    // 4xx are expected operational errors (e.g. 401 on /auth/refresh) — no need to log
    if (status >= 500) {
        console.error(`[ERROR] ${req.method} ${req.path} ${status}: ${message}`)
        if (err?.stack) console.error(err.stack)
    }

    const isProd = process.env.NODE_ENV === 'production'
    const knownOps =
        /file storage failed|could not generate file|HTTPS is required|Invalid form data|Only PDF/i.test(message)
    // Keep intentional operational messages visible to the client.
    res.status(status).json({
        error: isProd && status >= 500 && !expose && !knownOps ? 'An unexpected error occurred' : message
    })
}
