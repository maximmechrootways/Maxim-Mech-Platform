import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildNotificationEmailIdempotencyKey,
    computeBackoffMs,
    hasAllEmailNotificationTogglesDisabled,
    isNotificationEmailAllowedByPreferences,
} from '../services/notificationEmailQueue'
import { isTransientComposioError } from '../integrations/composio/composioEmailService'

test('buildNotificationEmailIdempotencyKey is deterministic', () => {
    const keyA = buildNotificationEmailIdempotencyKey('n-123')
    const keyB = buildNotificationEmailIdempotencyKey('n-123')
    assert.equal(keyA, 'notif:n-123:email')
    assert.equal(keyA, keyB)
})

test('computeBackoffMs increases exponentially and caps', () => {
    assert.equal(computeBackoffMs(1), 2000)
    assert.equal(computeBackoffMs(2), 4000)
    assert.equal(computeBackoffMs(3), 8000)
    assert.equal(computeBackoffMs(20), 300000)
})

test('isTransientComposioError detects retryable failures', () => {
    assert.equal(isTransientComposioError(new Error('429 rate limit exceeded')), true)
    assert.equal(isTransientComposioError(new Error('network timeout')), true)
    assert.equal(isTransientComposioError(new Error('invalid recipient format')), false)
})

test('hasAllEmailNotificationTogglesDisabled returns true only when all toggles are off', () => {
    assert.equal(hasAllEmailNotificationTogglesDisabled(undefined), false)
    assert.equal(hasAllEmailNotificationTogglesDisabled({}), false)
    assert.equal(hasAllEmailNotificationTogglesDisabled({
        notificationPreferences: {
            forms_pending: false,
            incidents: false,
            digest: false,
            signatures: false,
            incidents_site: false,
            signature_required: false,
            announcements: false,
        },
    }), true)
    assert.equal(hasAllEmailNotificationTogglesDisabled({
        notificationPreferences: {
            forms_pending: false,
            incidents: true,
            digest: false,
            signatures: false,
            incidents_site: false,
            signature_required: false,
            announcements: false,
        },
    }), false)
})

test('isNotificationEmailAllowedByPreferences checks the specific category', () => {
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
    }
    assert.equal(isNotificationEmailAllowedByPreferences(onlyDigestOn, 'digest'), true)
    assert.equal(isNotificationEmailAllowedByPreferences(onlyDigestOn, 'forms_pending'), false)
    assert.equal(isNotificationEmailAllowedByPreferences(onlyDigestOn, null), true)
})

test('isNotificationEmailAllowedByPreferences null category matches legacy any-on behavior', () => {
    assert.equal(isNotificationEmailAllowedByPreferences(undefined, null), true)
    assert.equal(isNotificationEmailAllowedByPreferences({
        notificationPreferences: {
            forms_pending: false,
            incidents: false,
            digest: false,
            signatures: false,
            incidents_site: false,
            signature_required: false,
            announcements: false,
        },
    }, null), false)
})

test('isNotificationEmailAllowedByPreferences rejects unknown category keys', () => {
    assert.equal(isNotificationEmailAllowedByPreferences(undefined, 'not_a_real_key' as any), false)
})
