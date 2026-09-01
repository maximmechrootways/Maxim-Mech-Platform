import type { SafetyAlert, SafetyAlertUserAction, UserRole } from '@/types'

export function normalizeSafetyAlertActions(raw: SafetyAlertUserAction[] | string[] | undefined): SafetyAlertUserAction[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (typeof item === 'string') return { userId: item, at: '' }
    return { userId: item.userId, at: item.at ?? '' }
  })
}

export function hasSafetyAlertAction(actions: SafetyAlertUserAction[] | string[] | undefined, userId: string): boolean {
  return normalizeSafetyAlertActions(actions).some((a) => a.userId === userId)
}

export function isAlertActiveForUser(
  alert: SafetyAlert,
  user: { id: string; role: UserRole } | null | undefined,
  options?: { includeAcknowledged?: boolean },
): boolean {
  const now = new Date().toISOString()
  if (alert.roles?.length && user && !alert.roles.includes(user.role)) return false
  if (alert.expiresAt && alert.expiresAt <= now) return false
  if (!options?.includeAcknowledged && user && hasSafetyAlertAction(alert.acknowledgedBy, user.id)) return false
  return true
}

export function filterActiveAlertsForUser(
  alerts: SafetyAlert[],
  user: { id: string; role: UserRole } | null | undefined,
  options?: { includeAcknowledged?: boolean },
): SafetyAlert[] {
  return alerts.filter((a) => isAlertActiveForUser(a, user, options))
}

export const SAFETY_ALERT_RED_CARD =
  'border-l-4 border-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'

export const SAFETY_ALERT_RED_BANNER =
  'border-b border-red-200 dark:border-red-800 bg-red-50/90 dark:bg-red-950/40'

export const SAFETY_ALERT_RED_TEXT = 'text-red-800 dark:text-red-200'
export const SAFETY_ALERT_RED_TEXT_MUTED = 'text-red-700 dark:text-red-300'
