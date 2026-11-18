/**
 * TOTP 2FA configuration from environment.
 * TWO_FACTOR_ENFORCEMENT=false keeps login behavior unchanged until flipped on.
 */
export const TRUSTED_DEVICE_COOKIE = 'mm_trusted_device'
export const TRUSTED_DEVICE_MAX_AGE_SEC = 30 * 24 * 60 * 60 // 30 days

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === '') return defaultValue
  return /^(1|true|yes|on)$/i.test(raw.trim())
}

export function isTwoFactorEnforcementEnabled(): boolean {
  return parseBool(process.env.TWO_FACTOR_ENFORCEMENT, false)
}

export function getTotpIssuer(): string {
  return (process.env.TOTP_ISSUER || 'Maxim Mechanical').trim() || 'Maxim Mechanical'
}

/**
 * 32-byte key from hex (64 chars) or base64. Required when encryption is used.
 */
export function getTotpEncryptionKey(): Buffer {
  const raw = (process.env.TOTP_ENCRYPTION_KEY || '').trim()
  if (!raw) {
    throw {
      status: 500,
      message: 'TOTP_ENCRYPTION_KEY is not configured',
      code: 'TOTP_KEY_MISSING',
    }
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  const fromB64 = Buffer.from(raw, 'base64')
  if (fromB64.length === 32) return fromB64
  throw {
    status: 500,
    message: 'TOTP_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)',
    code: 'TOTP_KEY_INVALID',
  }
}

export function assertTotpKeyIfEnforced(): void {
  if (!isTwoFactorEnforcementEnabled()) return
  getTotpEncryptionKey()
}
