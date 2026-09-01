export interface KissOptions {
  largeTouchTargets: boolean
  guidedStepMode: boolean
  simplifiedNav: boolean
  showOnlyRequiredFirst: boolean
}

export interface NotificationPreferences {
  forms_pending: boolean
  incidents: boolean
  digest: boolean
  digest_hr_owner_8am: boolean
  signatures: boolean
  incidents_site: boolean
  signature_required: boolean
  announcements: boolean
}

/** Key used to gate a notification email against `notificationPreferences`. */
export type NotificationPreferenceKey = keyof NotificationPreferences

export interface UiPreferences {
  kissModeEnabled: boolean
  kissPresetName: string | null
  kissOptions: KissOptions
  notificationPreferences: NotificationPreferences
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  kissModeEnabled: false,
  kissPresetName: null,
  kissOptions: {
    largeTouchTargets: true,
    guidedStepMode: true,
    simplifiedNav: true,
    showOnlyRequiredFirst: true,
  },
  notificationPreferences: {
    forms_pending: true,
    incidents: true,
    digest: false,
    digest_hr_owner_8am: false,
    signatures: true,
    incidents_site: true,
    signature_required: true,
    announcements: true,
  },
}

/** Valid `notificationPreferences` keys (for runtime checks on stored delivery rows). */
export const NOTIFICATION_PREFERENCE_KEY_SET = new Set<string>(
  Object.keys(DEFAULT_UI_PREFERENCES.notificationPreferences),
)

export function normalizeUiPreferences(input: unknown): UiPreferences {
  const src = (input && typeof input === 'object') ? (input as Record<string, any>) : {}
  const options = (src.kissOptions && typeof src.kissOptions === 'object') ? src.kissOptions as Record<string, any> : {}
  const notifications = (src.notificationPreferences && typeof src.notificationPreferences === 'object')
    ? src.notificationPreferences as Record<string, any>
    : {}
  return {
    kissModeEnabled: Boolean(src.kissModeEnabled),
    kissPresetName: typeof src.kissPresetName === 'string' ? src.kissPresetName : null,
    kissOptions: {
      largeTouchTargets: Boolean(options.largeTouchTargets ?? true),
      guidedStepMode: Boolean(options.guidedStepMode ?? true),
      simplifiedNav: Boolean(options.simplifiedNav ?? true),
      showOnlyRequiredFirst: Boolean(options.showOnlyRequiredFirst ?? true),
    },
    notificationPreferences: {
      forms_pending: Boolean(notifications.forms_pending ?? true),
      incidents: Boolean(notifications.incidents ?? true),
      digest: Boolean(notifications.digest ?? false),
      digest_hr_owner_8am: Boolean(notifications.digest_hr_owner_8am ?? false),
      signatures: Boolean(notifications.signatures ?? true),
      incidents_site: Boolean(notifications.incidents_site ?? true),
      signature_required: Boolean(notifications.signature_required ?? true),
      announcements: Boolean(notifications.announcements ?? true),
    },
  }
}

/**
 * True if at least one per-category email toggle is on.
 * Used to keep `User.emailNotificationsEnabled` in sync with `uiPreferences.notificationPreferences`
 * (the mailer requires both the global flag and the category to allow a send).
 */
export function anyNotificationEmailCategoryEnabled(prefs: UiPreferences): boolean {
  return Object.values(prefs.notificationPreferences).some(Boolean)
}

export function mergeUiPreferences(current: unknown, patch: unknown): UiPreferences {
  const base = normalizeUiPreferences(current)
  const incoming = (patch && typeof patch === 'object') ? patch as Record<string, any> : {}
  const incomingOptions = (incoming.kissOptions && typeof incoming.kissOptions === 'object') ? incoming.kissOptions as Record<string, any> : {}
  const incomingNotifications = (incoming.notificationPreferences && typeof incoming.notificationPreferences === 'object')
    ? incoming.notificationPreferences as Record<string, any>
    : {}

  return {
    kissModeEnabled: incoming.kissModeEnabled === undefined ? base.kissModeEnabled : Boolean(incoming.kissModeEnabled),
    kissPresetName: incoming.kissPresetName === undefined ? base.kissPresetName : (incoming.kissPresetName === null ? null : String(incoming.kissPresetName)),
    kissOptions: {
      largeTouchTargets: incomingOptions.largeTouchTargets === undefined ? base.kissOptions.largeTouchTargets : Boolean(incomingOptions.largeTouchTargets),
      guidedStepMode: incomingOptions.guidedStepMode === undefined ? base.kissOptions.guidedStepMode : Boolean(incomingOptions.guidedStepMode),
      simplifiedNav: incomingOptions.simplifiedNav === undefined ? base.kissOptions.simplifiedNav : Boolean(incomingOptions.simplifiedNav),
      showOnlyRequiredFirst: incomingOptions.showOnlyRequiredFirst === undefined ? base.kissOptions.showOnlyRequiredFirst : Boolean(incomingOptions.showOnlyRequiredFirst),
    },
    notificationPreferences: {
      forms_pending: incomingNotifications.forms_pending === undefined ? base.notificationPreferences.forms_pending : Boolean(incomingNotifications.forms_pending),
      incidents: incomingNotifications.incidents === undefined ? base.notificationPreferences.incidents : Boolean(incomingNotifications.incidents),
      digest: incomingNotifications.digest === undefined ? base.notificationPreferences.digest : Boolean(incomingNotifications.digest),
      digest_hr_owner_8am: incomingNotifications.digest_hr_owner_8am === undefined
        ? base.notificationPreferences.digest_hr_owner_8am
        : Boolean(incomingNotifications.digest_hr_owner_8am),
      signatures: incomingNotifications.signatures === undefined ? base.notificationPreferences.signatures : Boolean(incomingNotifications.signatures),
      incidents_site: incomingNotifications.incidents_site === undefined ? base.notificationPreferences.incidents_site : Boolean(incomingNotifications.incidents_site),
      signature_required: incomingNotifications.signature_required === undefined ? base.notificationPreferences.signature_required : Boolean(incomingNotifications.signature_required),
      announcements: incomingNotifications.announcements === undefined ? base.notificationPreferences.announcements : Boolean(incomingNotifications.announcements),
    },
  }
}

