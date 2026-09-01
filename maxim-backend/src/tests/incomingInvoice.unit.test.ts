import test from 'node:test'
import assert from 'node:assert/strict'
import {
    extractGmailMessageIdFromTriggerPayload,
    extractGmailThreadIdFromTriggerPayload,
    computeIncomingInvoiceBackoffMs,
} from '../services/incomingInvoiceIngestionService'
import { buildInvoiceSearchText, parseIsoDate } from '../services/incomingInvoiceAiService'

test('extractGmailMessageIdFromTriggerPayload reads nested ids', () => {
    const payload = {
        data: {
            payload: {
                id: 'abc123message',
                thread_id: 'thread-1',
            },
        },
    }
    assert.equal(extractGmailMessageIdFromTriggerPayload(payload), 'abc123message')
    assert.equal(extractGmailThreadIdFromTriggerPayload(payload), 'thread-1')
})

test('computeIncomingInvoiceBackoffMs grows with attempts', () => {
    assert.equal(computeIncomingInvoiceBackoffMs(1), 5000)
    assert.ok(computeIncomingInvoiceBackoffMs(3) > computeIncomingInvoiceBackoffMs(1))
})

test('parseIsoDate accepts ISO strings', () => {
    const date = parseIsoDate('2026-06-01')
    assert.ok(date instanceof Date)
    assert.equal(parseIsoDate('not-a-date'), null)
})

test('buildInvoiceSearchText joins non-empty parts', () => {
    const text = buildInvoiceSearchText(['Vendor Co', '', 'INV-100', null])
    assert.match(text, /Vendor Co/)
    assert.match(text, /INV-100/)
})
