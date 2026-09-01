import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'
import { hashPassword, comparePassword } from '../utils/password'
import { generateAccessToken, generateRefreshToken } from '../utils/jwt'
import { z } from 'zod'
import { loginSchema } from '../schemas/authSchemas'
import { validateInviteCode, redeemInviteCode } from './inviteService'

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
} satisfies Prisma.UserSelect

/**
 * Login with email + password (normal login).
 */
export const loginUser = async (data: z.infer<typeof loginSchema>, ipAddress: string) => {
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
            userId: success && user ? user.id : null
        }
    })

    if (!success || !user) {
        throw { status: 401, message: 'Invalid credentials' }
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
    })

    const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role
    })

    const refreshToken = await generateRefreshToken(user.id)

    return {
        accessToken,
        refreshToken,
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            hasCompletedSetup: user.hasCompletedSetup,
            uiPreferences: user.uiPreferences ?? {},
        }
    }
}

/**
 * Login with email + one-time invite code (first-time login).
 */
export const loginWithInviteCode = async (email: string, code: string, ipAddress: string) => {
    // Validate the invite code is tied to this email
    const invite = await validateInviteCode(code, email)

    // Find the user by email
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

    // Redeem the code (one-time use)
    await redeemInviteCode(code, user.id)

    // Log the attempt
    await prisma.loginAttempt.create({
        data: { email, ipAddress, success: true, userId: user.id }
    })

    // Update last login
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
    })

    const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role
    })

    const refreshToken = await generateRefreshToken(user.id)

    return {
        accessToken,
        refreshToken,
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            hasCompletedSetup: user.hasCompletedSetup,
            uiPreferences: user.uiPreferences ?? {},
        }
    }
}

/**
 * Setup profile: set password on first login.
 */
export const setupProfile = async (userId: string, password: string, displayName?: string) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) throw { status: 404, message: 'User not found' }

    const hashedPassword = await hashPassword(password)

    const updates: any = {
        passwordHash: hashedPassword,
        hasCompletedSetup: true,
    }
    if (displayName) {
        const parts = displayName.trim().split(/\s+/)
        updates.firstName = parts[0]
        if (parts.length > 1) updates.lastName = parts.slice(1).join(' ')
    }

    await prisma.user.update({ where: { id: userId }, data: updates })

    return { success: true }
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
        data: { revoked: true }
    })

    const accessToken = generateAccessToken({
        id: rfDB.user.id,
        email: rfDB.user.email,
        role: rfDB.user.role
    })

    const newRefreshToken = await generateRefreshToken(rfDB.user.id)

    const user = {
        id: rfDB.user.id,
        email: rfDB.user.email,
        firstName: rfDB.user.firstName,
        lastName: rfDB.user.lastName,
        role: rfDB.user.role,
        hasCompletedSetup: rfDB.user.hasCompletedSetup ?? true,
        uiPreferences: rfDB.user.uiPreferences ?? {},
    }

    return { accessToken, refreshToken: newRefreshToken, user }
}

export const logoutUser = async (refreshToken: string) => {
    try {
        await prisma.refreshToken.update({
            where: { token: refreshToken },
            data: { revoked: true }
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
            createdAt: true,
            lastLogin: true
        }
    })

    if (!user) throw { status: 404, message: 'User not found' }
    return user
}
