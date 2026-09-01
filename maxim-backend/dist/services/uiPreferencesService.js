"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTIFICATION_PREFERENCE_KEY_SET = exports.DEFAULT_UI_PREFERENCES = void 0;
exports.normalizeUiPreferences = normalizeUiPreferences;
exports.anyNotificationEmailCategoryEnabled = anyNotificationEmailCategoryEnabled;
exports.mergeUiPreferences = mergeUiPreferences;
exports.DEFAULT_UI_PREFERENCES = {
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
};
/** Valid `notificationPreferences` keys (for runtime checks on stored delivery rows). */
exports.NOTIFICATION_PREFERENCE_KEY_SET = new Set(Object.keys(exports.DEFAULT_UI_PREFERENCES.notificationPreferences));
function normalizeUiPreferences(input) {
    const src = (input && typeof input === 'object') ? input : {};
    const options = (src.kissOptions && typeof src.kissOptions === 'object') ? src.kissOptions : {};
    const notifications = (src.notificationPreferences && typeof src.notificationPreferences === 'object')
        ? src.notificationPreferences
        : {};
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
    };
}
/**
 * True if at least one per-category email toggle is on.
 * Used to keep `User.emailNotificationsEnabled` in sync with `uiPreferences.notificationPreferences`
 * (the mailer requires both the global flag and the category to allow a send).
 */
function anyNotificationEmailCategoryEnabled(prefs) {
    return Object.values(prefs.notificationPreferences).some(Boolean);
}
function mergeUiPreferences(current, patch) {
    const base = normalizeUiPreferences(current);
    const incoming = (patch && typeof patch === 'object') ? patch : {};
    const incomingOptions = (incoming.kissOptions && typeof incoming.kissOptions === 'object') ? incoming.kissOptions : {};
    const incomingNotifications = (incoming.notificationPreferences && typeof incoming.notificationPreferences === 'object')
        ? incoming.notificationPreferences
        : {};
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
    };
}
