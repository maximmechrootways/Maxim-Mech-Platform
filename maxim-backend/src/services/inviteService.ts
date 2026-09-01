import { PrismaClient } from '@prisma/client'
import { nanoid } from 'nanoid'

const prisma = new PrismaClient()

const CODE_LENGTH = 8
const EXPIRY_DAYS = 30

/**
 * Generate a one-time invite code tied to a specific employee email.
 * Called when HR creates a new employee.
 */
export async function generateInviteCode(createdById: string, email: string) {
    const code = nanoid(CODE_LENGTH).toUpperCase()
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    const invite = await prisma.inviteCode.create({
        data: {
            code,
            email: email.toLowerCase(),
            createdById,
            expiresAt,
        },
    })

    return { code: invite.code, expiresAt: invite.expiresAt }
}

/**
 * Validate an invite code for a specific email.
 * Returns the invite if valid, throws otherwise.
 */
export async function validateInviteCode(code: string, email: string) {
    const invite = await prisma.inviteCode.findUnique({ where: { code } })

    if (!invite) throw Object.assign(new Error('Invalid invite code'), { status: 400 })
    if (invite.isUsed) throw Object.assign(new Error('This invite code has already been used'), { status: 400 })
    if (invite.expiresAt < new Date()) throw Object.assign(new Error('This invite code has expired'), { status: 400 })
    if (invite.email !== email.toLowerCase()) throw Object.assign(new Error('This invite code is not associated with this email'), { status: 400 })

    return invite
}

/**
 * Mark an invite code as used after successful first login.
 */
export async function redeemInviteCode(code: string, userId: string) {
    await prisma.inviteCode.update({
        where: { code },
        data: { isUsed: true, usedById: userId, usedAt: new Date() },
    })
}

/**
 * List all invite codes (HR dashboard).
 */
export async function listInviteCodes() {
    const codes = await prisma.inviteCode.findMany({
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
    })

    return codes.map((c) => ({
        id: c.id,
        code: c.code,
        email: c.email,
        createdBy: `${c.createdBy.firstName} ${c.createdBy.lastName}`,
        isUsed: c.isUsed,
        usedAt: c.usedAt,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
        status: c.isUsed ? 'used' : c.expiresAt < new Date() ? 'expired' : 'pending',
    }))
}

/**
 * Regenerate a new code for an existing employee email (e.g. if code expired).
 */
export async function regenerateInviteCode(createdById: string, email: string) {
    // Invalidate any old unused codes for this email
    await prisma.inviteCode.updateMany({
        where: { email: email.toLowerCase(), isUsed: false },
        data: { isUsed: true },
    })

    return generateInviteCode(createdById, email)
}
