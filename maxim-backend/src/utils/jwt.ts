import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev'
const ACCESS_TOKEN_EXPIRES_IN = '15m'
const REFRESH_TOKEN_DAYS = 7
const TWO_FACTOR_PENDING_EXPIRES_IN = '10m'

export interface TokenPayload {
    id: string
    email: string
    role: string
}

export type TwoFactorPendingPurpose = '2fa_pending' | '2fa_setup'

export interface TwoFactorPendingPayload {
    id: string
    email: string
    purpose: TwoFactorPendingPurpose
}

export const generateAccessToken = (payload: TokenPayload): string => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN })
}

export const verifyAccessToken = (token: string): TokenPayload => {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload & { purpose?: string }
    if (decoded.purpose === '2fa_pending' || decoded.purpose === '2fa_setup') {
        throw new Error('Pending two-factor token cannot be used as access token')
    }
    return decoded
}

export const generateTwoFactorPendingToken = (
    payload: Omit<TwoFactorPendingPayload, 'purpose'> & { purpose: TwoFactorPendingPurpose },
): string => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TWO_FACTOR_PENDING_EXPIRES_IN })
}

export const verifyTwoFactorPendingToken = (
    token: string,
    expectedPurposes?: TwoFactorPendingPurpose[],
): TwoFactorPendingPayload => {
    const decoded = jwt.verify(token, JWT_SECRET) as TwoFactorPendingPayload
    if (decoded.purpose !== '2fa_pending' && decoded.purpose !== '2fa_setup') {
        throw new Error('Invalid two-factor pending token')
    }
    if (expectedPurposes && !expectedPurposes.includes(decoded.purpose)) {
        throw new Error('Invalid two-factor pending token purpose')
    }
    if (!decoded.id || !decoded.email) throw new Error('Invalid two-factor pending token')
    return decoded
}

/** Short-lived state token for OAuth callbacks (e.g. Google Calendar connect). */
export const signCalendarConnectState = (userId: string): string => {
    return jwt.sign({ userId, purpose: 'google-calendar-connect' }, JWT_SECRET, { expiresIn: '10m' })
}

export const verifyCalendarConnectState = (state: string): { userId: string } => {
    const decoded = jwt.verify(state, JWT_SECRET) as { userId: string; purpose?: string }
    if (decoded.purpose !== 'google-calendar-connect' || !decoded.userId) throw new Error('Invalid state')
    return { userId: decoded.userId }
}

export const generateRefreshToken = async (userId: string): Promise<string> => {
    const token = uuidv4()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS)

    await prisma.refreshToken.create({
        data: {
            token,
            userId,
            expiresAt
        }
    })

    return token
}
