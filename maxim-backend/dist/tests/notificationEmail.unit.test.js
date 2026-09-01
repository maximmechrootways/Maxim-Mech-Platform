"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const notificationEmailQueue_1 = require("../services/notificationEmailQueue");
const composioEmailService_1 = require("../integrations/composio/composioEmailService");
(0, node_test_1.default)('buildNotificationEmailIdempotencyKey is deterministic', () => {
    const keyA = (0, notificationEmailQueue_1.buildNotificationEmailIdempotencyKey)('n-123');
    const keyB = (0, notificationEmailQueue_1.buildNotificationEmailIdempotencyKey)('n-123');
    strict_1.default.equal(keyA, 'notif:n-123:email');
    strict_1.default.equal(keyA, keyB);
});
(0, node_test_1.default)('computeBackoffMs increases exponentially and caps', () => {
    strict_1.default.equal((0, notificationEmailQueue_1.computeBackoffMs)(1), 2000);
    strict_1.default.equal((0, notificationEmailQueue_1.computeBackoffMs)(2), 4000);
    strict_1.default.equal((0, notificationEmailQueue_1.computeBackoffMs)(3), 8000);
    strict_1.default.equal((0, notificationEmailQueue_1.computeBackoffMs)(20), 300000);
});
(0, node_test_1.default)('isTransientComposioError detects retryable failures', () => {
    strict_1.default.equal((0, composioEmailService_1.isTransientComposioError)(new Error('429 rate limit exceeded')), true);
    strict_1.default.equal((0, composioEmailService_1.isTransientComposioError)(new Error('network timeout')), true);
    strict_1.default.equal((0, composioEmailService_1.isTransientComposioError)(new Error('invalid recipient format')), false);
});
(0, node_test_1.default)('hasAllEmailNotificationTogglesDisabled returns true only when all toggles are off', () => {
    strict_1.default.equal((0, notificationEmailQueue_1.hasAllEmailNotificationTogglesDisabled)(undefined), false);
    strict_1.default.equal((0, notificationEmailQueue_1.hasAllEmailNotificationTogglesDisabled)({}), false);
    strict_1.default.equal((0, notificationEmailQueue_1.hasAllEmailNotificationTogglesDisabled)({
        notificationPreferences: {
            forms_pending: false,
            incidents: false,
            digest: false,
            signatures: false,
            incidents_site: false,
            signature_required: false,
            announcements: false,
        },
    }), true);
    strict_1.default.equal((0, notificationEmailQueue_1.hasAllEmailNotificationTogglesDisabled)({
        notificationPreferences: {
            forms_pending: false,
            incidents: true,
            digest: false,
            signatures: false,
            incidents_site: false,
            signature_required: false,
            announcements: false,
        },
    }), false);
});
(0, node_test_1.default)('isNotificationEmailAllowedByPreferences checks the specific category', () => {
    const onlyDigestOn = {
        notificationPreferences: {
            forms_pending: false,
            incidents: false,
            digest: true,
            signatures: false,
            incidents_site: false,
            signature_required: false,
            announcements: false,
        },
    };
    strict_1.default.equal((0, notificationEmailQueue_1.isNotificationEmailAllowedByPreferences)(onlyDigestOn, 'digest'), true);
    strict_1.default.equal((0, notificationEmailQueue_1.isNotificationEmailAllowedByPreferences)(onlyDigestOn, 'forms_pending'), false);
    strict_1.default.equal((0, notificationEmailQueue_1.isNotificationEmailAllowedByPreferences)(onlyDigestOn, null), true);
});
(0, node_test_1.default)('isNotificationEmailAllowedByPreferences null category matches legacy any-on behavior', () => {
    strict_1.default.equal((0, notificationEmailQueue_1.isNotificationEmailAllowedByPreferences)(undefined, null), true);
    strict_1.default.equal((0, notificationEmailQueue_1.isNotificationEmailAllowedByPreferences)({
        notificationPreferences: {
            forms_pending: false,
            incidents: false,
            digest: false,
            signatures: false,
            incidents_site: false,
            signature_required: false,
            announcements: false,
        },
    }, null), false);
});
(0, node_test_1.default)('isNotificationEmailAllowedByPreferences rejects unknown category keys', () => {
    strict_1.default.equal((0, notificationEmailQueue_1.isNotificationEmailAllowedByPreferences)(undefined, 'not_a_real_key'), false);
});
