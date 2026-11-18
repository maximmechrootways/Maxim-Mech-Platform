import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, TokenPayload } from '../utils/jwt'
import { prisma } from '../lib/prisma'
import { isTwoFactorEnforcementEnabled } from '../config/twoFactor'

declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload
        }
    }
}

const SETUP_ALLOWED_PREFIXES = [
    '/auth/2fa',
    '/auth/me',
    '/auth/setup-profile',
    '/auth/logout',
]

function isSetupAllowedPath(urlPath: string): boolean {
    const p = urlPath.split('?')[0]
    return SETUP_ALLOWED_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    let token = req.headers.authorization?.split(' ')[1]
    if (!token && req.query.token && typeof req.query.token === 'string') {
        token = req.query.token
    }

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' })
    }

    try {
        const decoded = verifyAccessToken(token)
        req.user = decoded

        if (isTwoFactorEnforcementEnabled()) {
            const original = (req.originalUrl || req.url || '').split('?')[0]
            if (!isSetupAllowedPath(original)) {
                const user = await prisma.user.findUnique({
                    where: { id: decoded.id },
                    select: { totpEnabled: true },
                })
                if (!user) {
                    return res.status(401).json({ error: 'Authentication required' })
                }
                if (!user.totpEnabled) {
                    return res.status(403).json({
                        error: 'Two-factor authentication setup is required',
                        code: 'TWO_FACTOR_SETUP_REQUIRED',
                    })
                }
            }
        }

        next()
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' })
    }
}
