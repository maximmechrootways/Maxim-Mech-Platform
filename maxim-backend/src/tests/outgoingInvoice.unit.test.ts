import test from 'node:test'
import assert from 'node:assert/strict'
import {
    computeDueDateFromPaymentTerms,
    deriveOutgoingInvoiceStatus,
    isMaximOutgoingInvoiceText,
    normalizeMaximInvoiceText,
    parseMaximInvoiceDate,
    parseMaximOutgoingInvoiceTemplate,
} from '../services/outgoingInvoiceExtractionService'
import { computeOutgoingInvoiceBackoffMs } from '../services/outgoingInvoiceIngestionService'

const EXAMPLE_PDF_TEXT = `
MAXIM MECHANICAL GROUP INC.
To: Bombardier Inc.
Bombardier Aerospace
Order No.: 73100014586
Supplier No.: 122894
Project: BFP Testing – Annual
Payment Net 45 Days
INVOICE: #3292A
Cost 1,280.00
HST 166.40
Amount Due 1,446.40
Date: June 22nd, 2026
`

const FULL_EXAMPLE_PDF_TEXT = `cc. Mr. Wolfgang Wittman, P.Eng. – Plant Engineer
HST# 77389 3532 RT0001
Payment Net 45 Days
MAXIM MECHANICAL GROUP INC.
To: Bombardier Inc.
Bombardier Aerospace
Canadair Operations Centre
ATTN: Accounts Payable
Supplier No.: 122894
Order No.: 73100014586
Project: BFP Testing – Annual
INVOICE: #3292A
Cost 1,280.00
HST 166.40
Amount Due 1,446.40
Date: June 22nd, 2026
MAXIM MECHANICAL GROUP INC`

const COLLAPSED_OCR_TEXT = `Payment Net 45 Days MAXIM MECHANICAL GROUP INC. To: Bombardier Inc. Bombardier Aerospace ATTN: Accounts Payable Supplier No.: 122894 Order No.: 73100014586 Project: BFP Testing – Annual INVOICE: #3292A Cost 1,280.00 HST 166.40 Amount Due 1,446.40 Date: June 22nd, 2026`

test('isMaximOutgoingInvoiceText detects Maxim issuer', () => {
    assert.equal(isMaximOutgoingInvoiceText(EXAMPLE_PDF_TEXT), true)
    assert.equal(isMaximOutgoingInvoiceText('Vendor Co invoice'), false)
})

test('parseMaximOutgoingInvoiceTemplate extracts example fields', () => {
    const parsed = parseMaximOutgoingInvoiceTemplate(EXAMPLE_PDF_TEXT)
    assert.ok(parsed)
    assert.equal(parsed?.customerName, 'Bombardier Inc.')
    assert.equal(parsed?.invoiceNumber, '3292A')
    assert.equal(parsed?.orderNumber, '73100014586')
    assert.equal(parsed?.supplierNumber, '122894')
    assert.match(parsed?.projectName || '', /BFP Testing/)
    assert.equal(parsed?.subtotal, 1280)
    assert.equal(parsed?.taxAmount, 166.4)
    assert.equal(parsed?.totalAmount, 1446.4)
    assert.equal(parsed?.paymentTerms, 'Net 45 Days')
    assert.equal(parsed?.invoiceDate, '2026-06-22')
    assert.equal(parsed?.dueDate, '2026-08-06')
})

test('parseMaximOutgoingInvoiceTemplate handles full Maxim PDF layout', () => {
    const parsed = parseMaximOutgoingInvoiceTemplate(FULL_EXAMPLE_PDF_TEXT)
    assert.ok(parsed)
    assert.equal(parsed?.customerName, 'Bombardier Inc.')
    assert.equal(parsed?.orderNumber, '73100014586')
    assert.equal(parsed?.dueDate, '2026-08-06')
})

test('parseMaximOutgoingInvoiceTemplate handles collapsed OCR text', () => {
    const parsed = parseMaximOutgoingInvoiceTemplate(COLLAPSED_OCR_TEXT)
    assert.ok(parsed)
    assert.equal(parsed?.customerName, 'Bombardier Inc.')
    assert.equal(parsed?.orderNumber, '73100014586')
    assert.equal(parsed?.dueDate, '2026-08-06')
    assert.ok(normalizeMaximInvoiceText(COLLAPSED_OCR_TEXT).includes('\nTo:'))
})

test('parseMaximInvoiceDate handles ordinals', () => {
    const date = parseMaximInvoiceDate('June 22nd, 2026')
    assert.ok(date)
    assert.equal(date?.getFullYear(), 2026)
    assert.equal(date?.getMonth(), 5)
    assert.equal(date?.getDate(), 22)
})

test('computeDueDateFromPaymentTerms adds net days', () => {
    const invoiceDate = new Date(2026, 5, 22, 12, 0, 0)
    const due = computeDueDateFromPaymentTerms(invoiceDate, 'Net 45 Days')
    assert.ok(due)
    assert.equal(due?.getFullYear(), 2026)
    assert.equal(due?.getMonth(), 7)
    assert.equal(due?.getDate(), 6)
})

test('deriveOutgoingInvoiceStatus transitions', () => {
    const dueFuture = new Date('2099-01-01')
    const duePast = new Date('2020-01-01')
    assert.equal(deriveOutgoingInvoiceStatus({ dueDate: dueFuture }), 'SENT')
    assert.equal(deriveOutgoingInvoiceStatus({ dueDate: duePast }), 'OVERDUE')
    assert.equal(deriveOutgoingInvoiceStatus({ paidAt: new Date(), totalAmount: 100 }), 'PAID')
    assert.equal(deriveOutgoingInvoiceStatus({
        paidAt: new Date(),
        totalAmount: 100,
        paidAmount: 40,
    }), 'PARTIAL')
})

test('computeOutgoingInvoiceBackoffMs grows with attempts', () => {
    assert.equal(computeOutgoingInvoiceBackoffMs(1), 5000)
    assert.ok(computeOutgoingInvoiceBackoffMs(3) > computeOutgoingInvoiceBackoffMs(1))
})
