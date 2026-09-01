"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInviteCode = generateInviteCode;
exports.validateInviteCode = validateInviteCode;
exports.redeemInviteCode = redeemInviteCode;
exports.listInviteCodes = listInviteCodes;
exports.regenerateInviteCode = regenerateInviteCode;
const client_1 = require("@prisma/client");
const nanoid_1 = require("nanoid");
const prisma = new client_1.PrismaClient();
const CODE_LENGTH = 8;
const EXPIRY_DAYS = 30;
/**
 * Generate a one-time invite code tied to a specific employee email.
 * Called when HR creates a new employee.
 */
async function generateInviteCode(createdById, email) {
    const code = (0, nanoid_1.nanoid)(CODE_LENGTH).toUpperCase();
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const invite = await prisma.inviteCode.create({
        data: {
            code,
            email: email.toLowerCase(),
            createdById,
            expiresAt,
        },
    });
    return { code: invite.code, expiresAt: invite.expiresAt };
}
/**
 * Validate an invite code for a specific email.
 * Returns the invite if valid, throws otherwise.
 */
async function validateInviteCode(code, email) {
    const invite = await prisma.inviteCode.findUnique({ where: { code } });
    if (!invite)
        throw Object.assign(new Error('Invalid invite code'), { status: 400 });
    if (invite.isUsed)
        throw Object.assign(new Error('This invite code has already been used'), { status: 400 });
    if (invite.expiresAt < new Date())
        throw Object.assign(new Error('This invite code has expired'), { status: 400 });
    if (invite.email !== email.toLowerCase())
        throw Object.assign(new Error('This invite code is not associated with this email'), { status: 400 });
    return invite;
}
/**
 * Mark an invite code as used after successful first login.
 */
async function redeemInviteCode(code, userId) {
    await prisma.inviteCode.update({
        where: { code },
        data: { isUsed: true, usedById: userId, usedAt: new Date() },
    });
}
/**
 * List all invite codes (HR dashboard).
 */
async function listInviteCodes() {
    const codes = await prisma.inviteCode.findMany({
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
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
    }));
}
/**
 * Regenerate a new code for an existing employee email (e.g. if code expired).
 */
async function regenerateInviteCode(createdById, email) {
    // Invalidate any old unused codes for this email
    await prisma.inviteCode.updateMany({
        where: { email: email.toLowerCase(), isUsed: false },
        data: { isUsed: true },
    });
    return generateInviteCode(createdById, email);
}
