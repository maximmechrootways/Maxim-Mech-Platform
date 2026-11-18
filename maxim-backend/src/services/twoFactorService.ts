import QRCode from 'qrcode'
import { generateSecret, generateURI, verifySync } from 'otplib'
import { prisma } from '../lib/prisma'
import { hashPassword, comparePassword } from '../utils/password'
import {
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  hashTrustedDeviceToken,
  generateOpaqueToken,
} from '../utils/totpCrypto'
import {
  getTotpIssuer,
  isTwoFactorEnforcementEnabled,
  TRUSTED_DEVICE_MAX_AGE_SEC,
} from '../config/twoFactor'
import { generateAccessToken, generateRefreshToken } from '../utils/jwt'

type AuthUserRow = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  hasCompletedSetup: boolean
  uiPreferences: unknown
  totpEnabled: boolean
}

export function publicUserPayload(user: AuthUserRow) {
  const enforcement = isTwoFactorEnforcementEnabled()
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    hasCompletedSetup: user.hasCompletedSetup,
    uiPreferences: user.uiPreferences ?? {},
    totpEnabled: user.totpEnabled,
    twoFactorRequired: enforcement && !user.totpEnabled,
  }
}

export async function issueFullSession(user: AuthUserRow) {
  const accessToken = generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
  })
  const refreshToken = await generateRefreshToken(user.id)
  return {
    accessToken,
    refreshToken,
    user: publicUserPayload(user),
  }
}

export async function findValidTrustedDevice(
  userId: string,
  rawToken: string | undefined | null,
): Promise<boolean> {
  if (!rawToken) return false
  const tokenHash = hashTrustedDeviceToken(rawToken)
  const device = await prisma.trustedDevice.findFirst({
    where: {
      userId,
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  })
  return !!device
}

export async function createTrustedDevice(
  userId: string,
  userAgent?: string | null,
): Promise<{ token: string; maxAgeSec: number }> {
  const token = generateOpaqueToken()
  const tokenHash = hashTrustedDeviceToken(token)
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_MAX_AGE_SEC * 1000)
  await prisma.trustedDevice.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: userAgent || null,
    },
  })
  return { token, maxAgeSec: TRUSTED_DEVICE_MAX_AGE_SEC }
}

export async function revokeTrustedDevicesForUser(userId: string) {
  await prisma.trustedDevice.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function revokeRefreshTokensForUser(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  })
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes(10)
  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorRecoveryCode.createMany({
      data: await Promise.all(
        codes.map(async (code) => ({
          userId,
          codeHash: await hashPassword(normalizeRecoveryCode(code)),
        })),
      ),
    }),
  ])
  return codes
}

function verifyTotpCode(plainSecret: string, code: string): boolean {
  const cleaned = String(code || '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  try {
    const result = verifySync({ secret: plainSecret, token: cleaned })
    return !!(result && result.valid)
  } catch {
    return false
  }
}

export async function startTwoFactorSetup(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, totpEnabled: true },
  })
  if (!user) throw { status: 404, message: 'User not found' }
  if (user.totpEnabled) {
    throw { status: 400, message: 'Two-factor authentication is already enabled' }
  }

  const secret = generateSecret()
  const encrypted = encryptTotpSecret(secret)
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecretEncrypted: encrypted, totpEnabled: false, totpEnabledAt: null },
  })

  const issuer = getTotpIssuer()
  const otpauthUrl = generateURI({
    issuer,
    label: user.email,
    secret,
  })
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 })

  return {
    otpauthUrl,
    qrDataUrl,
    manualKey: secret,
  }
}

export async function confirmTwoFactorSetup(userId: string, code: string) {
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
      totpSecretEncrypted: true,
    },
  })
  if (!user) throw { status: 404, message: 'User not found' }
  if (user.totpEnabled) {
    throw { status: 400, message: 'Two-factor authentication is already enabled' }
  }
  if (!user.totpSecretEncrypted) {
    throw { status: 400, message: 'Start two-factor setup first' }
  }

  const plainSecret = decryptTotpSecret(user.totpSecretEncrypted)
  if (!verifyTotpCode(plainSecret, code)) {
    throw { status: 401, message: 'Invalid authenticator code' }
  }

  const recoveryCodes = await replaceRecoveryCodes(user.id)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabled: true,
      totpEnabledAt: new Date(),
    },
  })

  const session = await issueFullSession({
    ...user,
    totpEnabled: true,
  })

  return {
    ...session,
    recoveryCodes,
  }
}

async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(code)
  if (!normalized || normalized.length < 8) return false

  const unused = await prisma.twoFactorRecoveryCode.findMany({
    where: { userId, usedAt: null },
  })
  for (const row of unused) {
    if (await comparePassword(normalized, row.codeHash)) {
      await prisma.twoFactorRecoveryCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      })
      return true
    }
  }
  return false
}

export async function verifyTwoFactorLogin(
  userId: string,
  opts: { code?: string; recoveryCode?: string; rememberDevice?: boolean; userAgent?: string | null },
) {
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
      totpSecretEncrypted: true,
    },
  })
  if (!user || !user.totpEnabled || !user.totpSecretEncrypted) {
    throw { status: 400, message: 'Two-factor authentication is not enabled for this account' }
  }

  let ok = false
  if (opts.recoveryCode) {
    ok = await consumeRecoveryCode(user.id, opts.recoveryCode)
  } else if (opts.code) {
    const plainSecret = decryptTotpSecret(user.totpSecretEncrypted)
    ok = verifyTotpCode(plainSecret, opts.code)
  }

  if (!ok) {
    throw { status: 401, message: 'Invalid verification code' }
  }

  const session = await issueFullSession(user)
  let trustedDeviceToken: string | undefined
  let trustedDeviceMaxAgeSec: number | undefined
  if (opts.rememberDevice) {
    const device = await createTrustedDevice(user.id, opts.userAgent)
    trustedDeviceToken = device.token
    trustedDeviceMaxAgeSec = device.maxAgeSec
  }

  return {
    ...session,
    trustedDeviceToken,
    trustedDeviceMaxAgeSec,
  }
}

export async function regenerateRecoveryCodes(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, totpEnabled: true },
  })
  if (!user) throw { status: 404, message: 'User not found' }
  if (!user.totpEnabled) {
    throw { status: 400, message: 'Two-factor authentication is not enabled' }
  }
  const recoveryCodes = await replaceRecoveryCodes(userId)
  return { recoveryCodes }
}

/**
 * Owner/HR temporary disable: clear secret + codes + trusted devices + refresh tokens.
 * Next login forces re-setup when enforcement is on.
 */
export async function disableTwoFactorForUser(adminRole: string, targetUserId: string) {
  if (adminRole !== 'owner' && adminRole !== 'hr') {
    throw { status: 403, message: 'Only Owner or HR can disable two-factor authentication' }
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, totpEnabled: true },
  })
  if (!user) throw { status: 404, message: 'User not found' }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: {
        totpEnabled: false,
        totpSecretEncrypted: null,
        totpEnabledAt: null,
      },
    }),
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: targetUserId } }),
    prisma.trustedDevice.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: targetUserId, revoked: false },
      data: { revoked: true },
    }),
  ])

  return { success: true, totpEnabled: false }
}
