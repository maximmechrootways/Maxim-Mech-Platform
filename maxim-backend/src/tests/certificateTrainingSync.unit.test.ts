import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTrainingExpirationDate } from '../services/certificateTrainingSync'

test('resolveTrainingExpirationDate returns null for empty values', () => {
  assert.equal(resolveTrainingExpirationDate(undefined), null)
  assert.equal(resolveTrainingExpirationDate(null), null)
  assert.equal(resolveTrainingExpirationDate(''), null)
  assert.equal(resolveTrainingExpirationDate('   '), null)
})

test('resolveTrainingExpirationDate trims valid dates', () => {
  assert.equal(resolveTrainingExpirationDate(' 2026-12-31 '), '2026-12-31')
  assert.equal(resolveTrainingExpirationDate('2027-01-15'), '2027-01-15')
})
