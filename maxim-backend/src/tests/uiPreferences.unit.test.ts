import test from 'node:test'
import assert from 'node:assert/strict'
import { anyNotificationEmailCategoryEnabled, mergeUiPreferences, normalizeUiPreferences } from '../services/uiPreferencesService'

test('normalizeUiPreferences returns defaults for empty input', () => {
  const normalized = normalizeUiPreferences(null)
  assert.equal(normalized.kissModeEnabled, false)
  assert.equal(normalized.kissPresetName, null)
  assert.equal(normalized.kissOptions.largeTouchTargets, true)
  assert.equal(normalized.kissOptions.guidedStepMode, true)
  assert.equal(normalized.kissOptions.simplifiedNav, true)
  assert.equal(normalized.kissOptions.showOnlyRequiredFirst, true)
})

test('mergeUiPreferences preserves existing values when patch omits them', () => {
  const current = {
    kissModeEnabled: true,
    kissPresetName: 'Simple',
    kissOptions: {
      largeTouchTargets: true,
      guidedStepMode: false,
      simplifiedNav: true,
      showOnlyRequiredFirst: false,
    },
  }

  const merged = mergeUiPreferences(current, {
    kissOptions: {
      guidedStepMode: true,
    },
  })

  assert.equal(merged.kissModeEnabled, true)
  assert.equal(merged.kissPresetName, 'Simple')
  assert.equal(merged.kissOptions.largeTouchTargets, true)
  assert.equal(merged.kissOptions.guidedStepMode, true)
  assert.equal(merged.kissOptions.simplifiedNav, true)
  assert.equal(merged.kissOptions.showOnlyRequiredFirst, false)
})

test('anyNotificationEmailCategoryEnabled is true if any category is on', () => {
  const allOff = normalizeUiPreferences({
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
  })
  assert.equal(anyNotificationEmailCategoryEnabled(allOff), false)

  const oneOn = normalizeUiPreferences({
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
  })
  assert.equal(anyNotificationEmailCategoryEnabled(oneOn), true)
})

