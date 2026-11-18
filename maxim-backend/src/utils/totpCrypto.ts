import crypto from 'crypto'
import { getTotpEncryptionKey } from '../config/twoFactor'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12

/** Encrypt plaintext TOTP secret for storage. Format: base64(iv):base64(tag):base64(ciphertext) */
export function encryptTotpSecret(plainSecret: string): string {
  const key = getTotpEncryptionKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function decryptTotpSecret(payload: string): string {
  const key = getTotpEncryptionKey()
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted TOTP secret')
  const [ivB64, tagB64, dataB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function hashTrustedDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** Generate 10 recovery codes like GitHub: xxxx-xxxx */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex')
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`)
  }
  return codes
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, '').replace(/-/g, '')
}
