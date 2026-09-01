import test from 'node:test'
import assert from 'node:assert/strict'
import {
    documentsAreDistinct,
    guessDocumentTypeFromText,
    pdfLikelyContainsMultipleInvoices,
    splitPdfTextIntoSections,
} from '../services/incomingInvoiceDocumentResolver'

test('guessDocumentTypeFromText identifies payment receipts', () => {
    const receiptText = `
        PAYMENT RECEIPT
        Thank you for your payment.
        Amount Paid: $587.60
        Invoice #28651
        Balance Due: $0.00
    `
    assert.equal(
        guessDocumentTypeFromText(receiptText, { subject: 'Payment receipt for invoice 28651' }),
        'RECEIPT',
    )
})

test('guessDocumentTypeFromText identifies unpaid invoices', () => {
    const invoiceText = `
        INVOICE
        Invoice No.: 28651
        Due Date: 2026-07-01
        Amount Due: $587.60
        Payment Terms: Net 30
    `
    assert.equal(
        guessDocumentTypeFromText(invoiceText, { subject: 'Invoice 28651 from vendor' }),
        'INVOICE',
    )
})

test('guessDocumentTypeFromText keeps paid invoices as invoice when invoice structure exists', () => {
    const paidInvoiceText = `
        INVOICE
        Invoice No.: 28651
        DUE ON RECEIPT
        Amount Paid 587.60
        Amount Owing 0.00
        Total Amount 587.60
    `
    assert.equal(guessDocumentTypeFromText(paidInvoiceText), 'INVOICE')
})

test('guessDocumentTypeFromText identifies account statements from subject', () => {
    assert.equal(
        guessDocumentTypeFromText('Statement Date: 31/05/26 Customer #: 41489', {
            subject: 'Fwd: Statement 41489',
            filename: 'Statement_41489_20260601_0421.pdf',
        }),
        'STATEMENT',
    )
})

test('guessDocumentTypeFromText identifies card transaction receipts', () => {
    const receiptText = `
        Packing Slip 802433086
        TRANSACTION RECORD
        VISA Auth# 041582
        Total: 544.95 CAD
    `
    assert.equal(
        guessDocumentTypeFromText(receiptText, { subject: 'Fwd: Invoice and reciept' }),
        'RECEIPT',
    )
})

test('pdfLikelyContainsMultipleInvoices detects repeated invoice headers', () => {
    const bulkPdf = `
        INVOICE
        Invoice #10001
        Total $100.00

        INVOICE
        Invoice #10002
        Total $250.00
    `
    assert.equal(pdfLikelyContainsMultipleInvoices(bulkPdf), true)
})

test('splitPdfTextIntoSections splits bulk PDFs into separate sections', () => {
    const bulkPdf = `
        INVOICE
        Sunbelt Rentals
        Invoice #79632146-0001
        Total $100.00

        INVOICE
        Sunbelt Rentals
        Invoice #79632146-0002
        Total $250.00
    `
    const sections = splitPdfTextIntoSections(bulkPdf)
    assert.ok(sections.length >= 2)
    assert.ok(sections.some((section) => section.includes('79632146-0001')))
    assert.ok(sections.some((section) => section.includes('79632146-0002')))
})

test('documentsAreDistinct treats different invoice numbers as separate records', () => {
    const distinct = documentsAreDistinct([
        {
            sourceSequence: 0,
            attachmentIndex: 0,
            documentType: 'INVOICE',
            pdfText: 'Invoice #10001 total 100',
            extraction: { vendor: { name: 'Vendor A' }, invoiceNumber: '10001', totalAmount: 100 },
        },
        {
            sourceSequence: 1,
            attachmentIndex: 1,
            documentType: 'INVOICE',
            pdfText: 'Invoice #10002 total 250',
            extraction: { vendor: { name: 'Vendor A' }, invoiceNumber: '10002', totalAmount: 250 },
        },
    ])
    assert.equal(distinct, true)
})

test('documentsAreDistinct flags duplicate invoice numbers', () => {
    const distinct = documentsAreDistinct([
        {
            sourceSequence: 0,
            attachmentIndex: 0,
            documentType: 'INVOICE',
            pdfText: 'Invoice #10001 total 100',
            extraction: { vendor: { name: 'Vendor A' }, invoiceNumber: '10001', totalAmount: 100 },
        },
        {
            sourceSequence: 1,
            attachmentIndex: 1,
            documentType: 'INVOICE',
            pdfText: 'Invoice #10001 total 100',
            extraction: { vendor: { name: 'Vendor A' }, invoiceNumber: '10001', totalAmount: 100 },
        },
    ])
    assert.equal(distinct, false)
})
