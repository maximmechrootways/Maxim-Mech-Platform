import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { isTwoFactorEnforcementEnabled } from '../config/twoFactor'

/**
 * Paths allowed while enforcement is on and the user has not finished TOTP setup.
 */
const SETUP_ALLOWED_PREFIXES = [
  '/auth/2fa',
  '/auth/me',
  '/auth/setup-profile',
  '/auth/logout',
]

function isSetupAllowedPath(path: string): boolean {
  const p = path.split('?')[0]
  return SETUP_ALLOWED_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'))
}

/**
 * After authenticate: when 2FA enforcement is on and the user has no TOTP yet,
 * block all routes except setup-related auth endpoints.
 */
export const requireTwoFactorComplete = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!isTwoFactorEnforcementEnabled()) return next()
    if (!req.user?.id) return next()
    if (isSetupAllowedPath(req.path) || isSetupAllowedPath(req.originalUrl || '')) {
      // Mounted under /auth — check both path and originalUrl
    }

    const pathToCheck = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path
    const original = (req.originalUrl || '').split('?')[0]
    if (isSetupAllowedPath(pathToCheck) || isSetupAllowedPath(original)) {
      return next()
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
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
    next()
  } catch (e) {
    next(e)
  }
}
