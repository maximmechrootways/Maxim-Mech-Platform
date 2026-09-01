import { prisma } from '../lib/prisma'
import { hashPassword } from '../utils/password'
import { regenerateInviteCode } from './inviteService'
import { enqueueInviteCodeEmail } from './inviteEmailService'
/**
 * Forgot password: verify the email exists, regenerate a one-time invite code,
 * and email it via Composio so the user can sign in and set a new password.
 */
export async function sendPasswordResetEmail(email: string) {
    const normalizedEmail = email.toLowerCase()
    const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, firstName: true, isActive: true },
    })

    if (!user) {
        throw Object.assign(new Error('No account found with this email address.'), { status: 404 })
    }
    if (!user.isActive) {
        throw Object.assign(new Error('This account is deactivated. Contact HR for assistance.'), { status: 403 })
    }

    const { code, expiresAt } = await regenerateInviteCode(user.id, user.email)

    await prisma.user.update({
        where: { id: user.id },
        data: { hasCompletedSetup: false },
    })

    await enqueueInviteCodeEmail({
        userId: user.id,
        toEmail: user.email,
        inviteCode: code,
        expiresAt,
        firstName: user.firstName,
        reason: 'forgot_password',
    })
    return {
        success: true,
        message: 'A new login code has been sent to your email.',
    }
}

/**
 * Validate a password reset token and set the new password.
 */
export async function resetPasswordWithToken(token: string, newPassword: string) {
    const invite = await prisma.inviteCode.findUnique({ where: { code: token } })

    if (!invite) throw Object.assign(new Error('Invalid reset link'), { status: 400 })
    if (invite.isUsed) throw Object.assign(new Error('This reset link has already been used'), { status: 400 })
    if (invite.expiresAt < new Date()) throw Object.assign(new Error('This reset link has expired'), { status: 400 })

    const user = await prisma.user.findUnique({
        where: { email: invite.email },
        select: { id: true, email: true },
    })
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 })

    const hashedPassword = await hashPassword(newPassword)

    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hashedPassword, hasCompletedSetup: true },
    })

    // Mark token as used
    await prisma.inviteCode.update({
        where: { code: token },
        data: { isUsed: true, usedById: user.id, usedAt: new Date() },
    })

    return { success: true }
}
