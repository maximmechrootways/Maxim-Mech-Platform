import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, TokenPayload } from '../utils/jwt'

declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload
        }
    }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
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
        next()
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' })
    }
}
