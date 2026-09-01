"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const uiPreferencesService_1 = require("../services/uiPreferencesService");
(0, node_test_1.default)('normalizeUiPreferences returns defaults for empty input', () => {
    const normalized = (0, uiPreferencesService_1.normalizeUiPreferences)(null);
    strict_1.default.equal(normalized.kissModeEnabled, false);
    strict_1.default.equal(normalized.kissPresetName, null);
    strict_1.default.equal(normalized.kissOptions.largeTouchTargets, true);
    strict_1.default.equal(normalized.kissOptions.guidedStepMode, true);
    strict_1.default.equal(normalized.kissOptions.simplifiedNav, true);
    strict_1.default.equal(normalized.kissOptions.showOnlyRequiredFirst, true);
});
(0, node_test_1.default)('mergeUiPreferences preserves existing values when patch omits them', () => {
    const current = {
        kissModeEnabled: true,
        kissPresetName: 'Simple',
        kissOptions: {
            largeTouchTargets: true,
            guidedStepMode: false,
            simplifiedNav: true,
            showOnlyRequiredFirst: false,
        },
    };
    const merged = (0, uiPreferencesService_1.mergeUiPreferences)(current, {
        kissOptions: {
            guidedStepMode: true,
        },
    });
    strict_1.default.equal(merged.kissModeEnabled, true);
    strict_1.default.equal(merged.kissPresetName, 'Simple');
    strict_1.default.equal(merged.kissOptions.largeTouchTargets, true);
    strict_1.default.equal(merged.kissOptions.guidedStepMode, true);
    strict_1.default.equal(merged.kissOptions.simplifiedNav, true);
    strict_1.default.equal(merged.kissOptions.showOnlyRequiredFirst, false);
});
(0, node_test_1.default)('anyNotificationEmailCategoryEnabled is true if any category is on', () => {
    const allOff = (0, uiPreferencesService_1.normalizeUiPreferences)({
        notificationPreferences: {
            forms_pending: false,
            incidents: false,
            digest: false,
            digest_hr_owner_8am: false,
            signatures: false,
            incidents_site: false,
            signature_required: false,
            announcements: false,
        },
    });
    strict_1.default.equal((0, uiPreferencesService_1.anyNotificationEmailCategoryEnabled)(allOff), false);
    const oneOn = (0, uiPreferencesService_1.normalizeUiPreferences)({
        notificationPreferences: {
            forms_pending: true,
            incidents: false,
            digest: false,
            digest_hr_owner_8am: false,
            signatures: false,
            incidents_site: false,
            signature_required: false,
            announcements: false,
        },
    });
    strict_1.default.equal((0, uiPreferencesService_1.anyNotificationEmailCategoryEnabled)(oneOn), true);
});
