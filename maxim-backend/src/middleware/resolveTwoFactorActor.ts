import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, verifyTwoFactorPendingToken, type TwoFactorPendingPurpose } from '../utils/jwt'

declare global {
  namespace Express {
    interface Request {
      /** User id resolved from access token or 2FA pending token */
      twoFactorActorId?: string
    }
  }
}

/**
 * Resolve the acting user for 2FA setup/verify from either a Bearer access token
 * or a body/query pendingToken (2fa_setup / 2fa_pending).
 */
export const resolveTwoFactorActor = (
  allowedPending: TwoFactorPendingPurpose[] = ['2fa_setup', '2fa_pending'],
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const pendingToken =
        (typeof req.body?.pendingToken === 'string' && req.body.pendingToken) ||
        (typeof req.query?.pendingToken === 'string' && req.query.pendingToken) ||
        null

      if (pendingToken) {
        const decoded = verifyTwoFactorPendingToken(pendingToken, allowedPending)
        req.twoFactorActorId = decoded.id
        return next()
      }

      const bearer = req.headers.authorization?.split(' ')[1]
      if (bearer) {
        const decoded = verifyAccessToken(bearer)
        req.twoFactorActorId = decoded.id
        req.user = decoded
        return next()
      }

      return res.status(401).json({ error: 'Authentication or pending token required' })
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }
  }
}
