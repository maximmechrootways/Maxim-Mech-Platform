import test from 'node:test'
import assert from 'node:assert/strict'
import { detectPdfChecklistSubstandard, normalizeChecklistValueForFinding } from '../services/qualityFindings/detectPdfSubmission'

test('normalizeChecklistValueForFinding only substandard', () => {
  assert.equal(normalizeChecklistValueForFinding('substandard'), 'substandard')
  assert.equal(normalizeChecklistValueForFinding('SubStandard'), 'substandard')
  assert.equal(normalizeChecklistValueForFinding('  sub-standard  '), 'substandard')
  assert.equal(normalizeChecklistValueForFinding('no'), null)
  assert.equal(normalizeChecklistValueForFinding('standard'), null)
})

test('detectPdfChecklistSubstandard ignores duplicate template field rows (same id)', () => {
  const fields = [
    { id: 'b', type: 'CHECKBOX', label: 'Item B' },
    { id: 'b', type: 'CHECKBOX', label: 'Item B' },
  ]
  const out = detectPdfChecklistSubstandard({
    templateId: 'tpl',
    templateName: 'Weekly Project Inspection',
    fields,
    fieldValues: { b: 'substandard' },
  })
  assert.equal(out.length, 1)
  assert.equal(out[0].fieldId, 'b')
})

test('detectPdfChecklistSubstandard flags CHECKBOX substandard only', () => {
  const fields = [
    { id: 'a', type: 'CHECKBOX', label: 'Item A' },
    { id: 'b', type: 'CHECKBOX', label: 'Item B' },
    { id: 't', type: 'TEXT', label: 'Note' },
  ]
  const fieldValues = { a: 'standard', b: 'substandard', t: 'substandard', __jobId__: 'job-1' }
  const out = detectPdfChecklistSubstandard({
    templateId: 'tpl',
    templateName: 'T',
    fields,
    fieldValues,
  })
  assert.equal(out.length, 1)
  assert.equal(out[0].fieldId, 'b')
  assert.equal(out[0].ruleCode, 'checklist_substandard')
  assert.equal(out[0].linkedJobId, 'job-1')
})

test('detectPdfChecklistSubstandard ignores non-checkbox', () => {
  const fields = [{ id: 't', type: 'TEXT', label: 'X' }]
  const out = detectPdfChecklistSubstandard({
    templateId: 'tpl',
    templateName: 'T',
    fields,
    fieldValues: { t: 'substandard' },
  })
  assert.equal(out.length, 0)
})

test('detectPdfChecklistSubstandard treats washroom [WASHROOM_ITEM] CHECKBOX no as finding', () => {
  const fields = [
    {
      id: 'w1',
      type: 'CHECKBOX',
      label: '[WASHROOM_ITEM]Floors::Clean, without dirt',
    },
    { id: 'hw', type: 'CHECKBOX', label: 'Fire watch assigned?' },
  ]
  const out = detectPdfChecklistSubstandard({
    templateId: 'tpl',
    templateName: 'Washroom',
    fields,
    fieldValues: { w1: 'no', hw: 'no' },
  })
  assert.equal(out.length, 1)
  assert.equal(out[0].fieldId, 'w1')
})

test('detectPdfChecklistSubstandard treats checkbox no as substandard on Fall Arrest template (legacy storage)', () => {
  const fields = [{ id: 'x', type: 'CHECKBOX', label: 'Full Body Harness:Webbing' }]
  const out = detectPdfChecklistSubstandard({
    templateId: 'tpl',
    templateName: 'Fall Arrest Inspection Checklist',
    fields,
    fieldValues: { x: 'no' },
  })
  assert.equal(out.length, 1)
  assert.equal(out[0].fieldId, 'x')
})

test('detectPdfChecklistSubstandard treats no as substandard when template omits Checklist suffix', () => {
  const fields = [{ id: 'x', type: 'CHECKBOX', label: 'Full Body Harness:Webbing' }]
  const out = detectPdfChecklistSubstandard({
    templateId: 'tpl',
    templateName: 'Fall Arrest Inspection',
    fields,
    fieldValues: { x: 'no' },
  })
  assert.equal(out.length, 1)
})

test('detectPdfChecklistSubstandard does not treat no as substandard on Hot Work permit', () => {
  const fields = [{ id: 'x', type: 'CHECKBOX', label: 'Fire watch assigned?' }]
  const out = detectPdfChecklistSubstandard({
    templateId: 'tpl',
    templateName: 'Hot Work Permit',
    fields,
    fieldValues: { x: 'no' },
  })
  assert.equal(out.length, 0)
})

test('detectPdfChecklistSubstandard does not treat plain CHECKBOX no as finding (non-washroom)', () => {
  const fields = [{ id: 'x', type: 'CHECKBOX', label: 'Some question' }]
  const out = detectPdfChecklistSubstandard({
    templateId: 'tpl',
    templateName: 'Other',
    fields,
    fieldValues: { x: 'no' },
  })
  assert.equal(out.length, 0)
})
