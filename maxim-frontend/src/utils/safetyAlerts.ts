import type { Employee, SafetyAlert, SafetyAlertUserAction, UserRole } from '@/types'

export function normalizeSafetyAlertActions(raw: SafetyAlertUserAction[] | string[] | undefined): SafetyAlertUserAction[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (typeof item === 'string') return { userId: item, at: '' }
    return { userId: item.userId, at: item.at ?? '' }
  })
}

/** Keep first action per userId (stable for display/counts). */
export function uniqueSafetyAlertActions(raw: SafetyAlertUserAction[] | string[] | undefined): SafetyAlertUserAction[] {
  const seen = new Set<string>()
  const out: SafetyAlertUserAction[] = []
  for (const a of normalizeSafetyAlertActions(raw)) {
    if (!a.userId || seen.has(a.userId)) continue
    seen.add(a.userId)
    out.push(a)
  }
  return out
}

export function hasSafetyAlertAction(actions: SafetyAlertUserAction[] | string[] | undefined, userId: string): boolean {
  return uniqueSafetyAlertActions(actions).some((a) => a.userId === userId)
}

export type SafetyAlertTrackingBuckets = {
  acknowledged: SafetyAlertUserAction[]
  /** Read but not yet acknowledged — removed from this list once they acknowledge. */
  readPending: SafetyAlertUserAction[]
  outstandingUserIds: string[]
}

function employeeMatchesAlertAudience(emp: Employee, alert: SafetyAlert): boolean {
  if (emp.status === 'terminated') return false
  if (alert.roles?.length) {
    const role = emp.role as UserRole | undefined
    if (!role || !alert.roles.includes(role)) return false
  }
  if (alert.siteNames?.length) {
    const sites = new Set(
      [
        ...(emp.jobAssignments ?? []).map((a) => a.siteName),
        ...(emp.jobSupervisorLinks ?? []).map((a) => a.siteName),
      ]
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase()),
    )
    const wanted = alert.siteNames.map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (!wanted.some((s) => sites.has(s))) return false
  }
  return true
}

/** Audience = active/on-leave employees matching optional role + site filters. */
export function getSafetyAlertAudienceIds(alert: SafetyAlert, employees: Employee[]): string[] {
  return employees.filter((e) => employeeMatchesAlertAudience(e, alert)).map((e) => e.id)
}

export function buildSafetyAlertTrackingBuckets(
  alert: SafetyAlert,
  employees: Employee[],
): SafetyAlertTrackingBuckets {
  const acknowledged = uniqueSafetyAlertActions(alert.acknowledgedBy)
  const ackIds = new Set(acknowledged.map((a) => a.userId))
  const readPending = uniqueSafetyAlertActions(alert.readBy).filter((r) => !ackIds.has(r.userId))
  const audienceIds = getSafetyAlertAudienceIds(alert, employees)
  const outstandingUserIds = audienceIds.filter((id) => !ackIds.has(id))
  return { acknowledged, readPending, outstandingUserIds }
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
