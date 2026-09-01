import rateLimit from 'express-rate-limit'

function keyGenerator(req: import('express').Request): string {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown'
    return String(ip).replace(/:\d+$/, '').replace(/^::ffff:/, '')
}

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later' },
    keyGenerator,
})

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many registration attempts, please try again later' },
    keyGenerator,
})

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600, // Raised from 200 — SPA fires 10-15 parallel fetches per page load
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => req.path.startsWith('/auth'),
    keyGenerator,
})
