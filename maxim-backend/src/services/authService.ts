import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'
import { hashPassword, comparePassword } from '../utils/password'
import { generateAccessToken, generateRefreshToken, generateTwoFactorPendingToken } from '../utils/jwt'
import { z } from 'zod'
import { loginSchema } from '../schemas/authSchemas'
import { validateInviteCode, redeemInviteCode } from './inviteService'
import { isTwoFactorEnforcementEnabled } from '../config/twoFactor'
import {
    findValidTrustedDevice,
    issueFullSession,
    publicUserPayload,
} from './twoFactorService'

/**
 * Narrow selects for auth so login/refresh work before optional DB migrations add new User columns.
 * (Bare findUnique loads every scalar; missing columns break Prisma at runtime.)
 */
const loginUserSelect = {
    id: true,
    email: true,
    passwordHash: true,
    firstName: true,
    lastName: true,
    role: true,
    hasCompletedSetup: true,
    uiPreferences: true,
    totpEnabled: true,
} satisfies Prisma.UserSelect

const inviteLoginUserSelect = {
    ...loginUserSelect,
    isActive: true,
} satisfies Prisma.UserSelect

const refreshUserSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    hasCompletedSetup: true,
    uiPreferences: true,
    totpEnabled: true,
} satisfies Prisma.UserSelect

type LoginUser = Prisma.UserGetPayload<{ select: typeof loginUserSelect }>

async function finishPasswordVerifiedLogin(
    user: LoginUser,
    trustedDeviceCookie?: string | null,
) {
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
    })

    const enforcement = isTwoFactorEnforcementEnabled()

    if (!enforcement) {
        return issueFullSession(user)
    }

    if (!user.totpEnabled) {
        // Invite / incomplete profile still needs a session for setup-profile first.
        if (!user.hasCompletedSetup) {
            return issueFullSession(user)
        }
        const pendingToken = generateTwoFactorPendingToken({
            id: user.id,
            email: user.email,
            purpose: '2fa_setup',
        })
        return {
            requiresTwoFactorSetup: true as const,
            pendingToken,
            user: publicUserPayload(user),
        }
    }

    const trusted = await findValidTrustedDevice(user.id, trustedDeviceCookie)
    if (trusted) {
        return issueFullSession(user)
    }

    const pendingToken = generateTwoFactorPendingToken({
        id: user.id,
        email: user.email,
        purpose: '2fa_pending',
    })
    return {
        requiresTwoFactor: true as const,
        pendingToken,
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
        },
    }
}

/**
 * Login with email + password (normal login).
 */
export const loginUser = async (
    data: z.infer<typeof loginSchema>,
    ipAddress: string,
    trustedDeviceCookie?: string | null,
) => {
    const user = await prisma.user.findUnique({
        where: { email: data.email },
        select: loginUserSelect,
    })

    let success = false
    if (user && user.passwordHash && await comparePassword(data.password, user.passwordHash)) {
        success = true
    }

    await prisma.loginAttempt.create({
        data: {
            email: data.email,
            ipAddress,
            success,
            userId: success && user ? user.id : null,
        },
    })

    if (!success || !user) {
        throw { status: 401, message: 'Invalid credentials' }
    }

    return finishPasswordVerifiedLogin(user, trustedDeviceCookie)
}

/**
 * Login with email + one-time invite code (first-time login).
 * Issues a session so the user can complete password setup, then 2FA.
 */
export const loginWithInviteCode = async (email: string, code: string, ipAddress: string) => {
    const invite = await validateInviteCode(code, email)

    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: inviteLoginUserSelect,
    })
    if (!user) {
        throw { status: 401, message: 'No account found for this email. Ask HR to create your account.' }
    }
    if (!user.isActive) {
        throw { status: 401, message: 'Account is deactivated. Contact HR.' }
    }

    await redeemInviteCode(code, user.id)

    await prisma.loginAttempt.create({
        data: { email, ipAddress, success: true, userId: user.id },
    })

    await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
    })

    return issueFullSession(user)
}

/**
 * Setup profile: set password on first login.
 */
export const setupProfile = async (userId: string, password: string, displayName?: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            hasCompletedSetup: true,
            uiPreferences: true,
            totpEnabled: true,
        },
    })
    if (!user) throw { status: 404, message: 'User not found' }

    const hashedPassword = await hashPassword(password)

    const updates: Prisma.UserUpdateInput = {
        passwordHash: hashedPassword,
        hasCompletedSetup: true,
    }
    if (displayName) {
        const parts = displayName.trim().split(/\s+/)
        updates.firstName = parts[0]
        if (parts.length > 1) updates.lastName = parts.slice(1).join(' ')
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: updates,
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            hasCompletedSetup: true,
            uiPreferences: true,
            totpEnabled: true,
        },
    })

    const enforcement = isTwoFactorEnforcementEnabled()
    if (enforcement && !updated.totpEnabled) {
        const pendingToken = generateTwoFactorPendingToken({
            id: updated.id,
            email: updated.email,
            purpose: '2fa_setup',
        })
        return {
            success: true,
            requiresTwoFactorSetup: true as const,
            pendingToken,
            user: publicUserPayload(updated),
        }
    }

    return {
        success: true,
        requiresTwoFactorSetup: false as const,
        user: publicUserPayload(updated),
    }
}

export const refreshUserToken = async (refreshToken: string) => {
    const rfDB = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: { select: refreshUserSelect } },
    })

    if (!rfDB || rfDB.revoked || rfDB.expiresAt < new Date()) {
        throw { status: 401, message: 'Invalid or expired refresh token' }
    }

    await prisma.refreshToken.update({
        where: { id: rfDB.id },
        data: { revoked: true },
    })

    const accessToken = generateAccessToken({
        id: rfDB.user.id,
        email: rfDB.user.email,
        role: rfDB.user.role,
    })

    const newRefreshToken = await generateRefreshToken(rfDB.user.id)

    return {
        accessToken,
        refreshToken: newRefreshToken,
        user: publicUserPayload(rfDB.user),
    }
}

export const logoutUser = async (refreshToken: string) => {
    try {
        await prisma.refreshToken.update({
            where: { token: refreshToken },
            data: { revoked: true },
        })
    } catch (e) {
        // Return success even if not found (idempotent)
    }
}

export const getMe = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            hasCompletedSetup: true,
            uiPreferences: true,
            totpEnabled: true,
            createdAt: true,
            lastLogin: true,
        },
    })

    if (!user) throw { status: 404, message: 'User not found' }
    return {
        ...user,
        uiPreferences: user.uiPreferences ?? {},
        twoFactorRequired: isTwoFactorEnforcementEnabled() && !user.totpEnabled,
    }
}
