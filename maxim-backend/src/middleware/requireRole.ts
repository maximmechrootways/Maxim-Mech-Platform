import { Request, Response, NextFunction } from 'express'

/**
 * Middleware factory – restricts access to users whose JWT `role`
 * matches one of the allowed roles.
 *
 * Usage: `router.post('/invite', authenticate, requireRole('hr', 'owner'), handler)`
 */
export const requireRole = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const userRole = req.user?.role
        if (!userRole || !roles.includes(userRole)) {
            return res.status(403).json({ error: 'Forbidden: insufficient role' })
        }
        next()
    }
}
