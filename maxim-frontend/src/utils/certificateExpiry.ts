/** Shared certificate expiry helpers — keep Management Review, Dashboard, and Certificates aligned. */

export type ExpiryBucket = 'expiry-60' | 'expiry-30' | 'expired' | 'current'

const EXPIRING_30_DAYS = 30
const EXPIRING_60_DAYS = 60

/** Calendar-day comparison in local time (avoids UTC midnight date-only skew). */
export function daysUntilExpiration(expirationDate?: string | null): number | null {
  if (!expirationDate?.trim()) return null
  const exp = new Date(expirationDate)
  if (Number.isNaN(exp.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  exp.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function getExpiryBucket(expirationDate?: string | null): ExpiryBucket {
  const daysLeft = daysUntilExpiration(expirationDate)
  if (daysLeft == null) return 'current'
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= EXPIRING_30_DAYS) return 'expiry-30'
  if (daysLeft <= EXPIRING_60_DAYS) return 'expiry-60'
  return 'current'
}

export function isCertificateExpired(expirationDate?: string | null): boolean {
  return getExpiryBucket(expirationDate) === 'expired'
}

export function isCertificateExpiringWithin30Days(expirationDate?: string | null): boolean {
  return getExpiryBucket(expirationDate) === 'expiry-30'
}
