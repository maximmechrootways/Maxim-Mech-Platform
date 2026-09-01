"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const incomingInvoiceDocumentResolver_1 = require("../services/incomingInvoiceDocumentResolver");
(0, node_test_1.default)('guessDocumentTypeFromText identifies payment receipts', () => {
    const receiptText = `
        PAYMENT RECEIPT
        Thank you for your payment.
        Amount Paid: $587.60
        Invoice #28651
        Balance Due: $0.00
    `;
    strict_1.default.equal((0, incomingInvoiceDocumentResolver_1.guessDocumentTypeFromText)(receiptText, { subject: 'Payment receipt for invoice 28651' }), 'RECEIPT');
});
(0, node_test_1.default)('guessDocumentTypeFromText identifies unpaid invoices', () => {
    const invoiceText = `
        INVOICE
        Invoice No.: 28651
        Due Date: 2026-07-01
        Amount Due: $587.60
        Payment Terms: Net 30
    `;
    strict_1.default.equal((0, incomingInvoiceDocumentResolver_1.guessDocumentTypeFromText)(invoiceText, { subject: 'Invoice 28651 from vendor' }), 'INVOICE');
});
(0, node_test_1.default)('guessDocumentTypeFromText keeps paid invoices as invoice when invoice structure exists', () => {
    const paidInvoiceText = `
        INVOICE
        Invoice No.: 28651
        DUE ON RECEIPT
        Amount Paid 587.60
        Amount Owing 0.00
        Total Amount 587.60
    `;
    strict_1.default.equal((0, incomingInvoiceDocumentResolver_1.guessDocumentTypeFromText)(paidInvoiceText), 'INVOICE');
});
(0, node_test_1.default)('guessDocumentTypeFromText identifies account statements from subject', () => {
    strict_1.default.equal((0, incomingInvoiceDocumentResolver_1.guessDocumentTypeFromText)('Statement Date: 31/05/26 Customer #: 41489', {
        subject: 'Fwd: Statement 41489',
        filename: 'Statement_41489_20260601_0421.pdf',
    }), 'STATEMENT');
});
(0, node_test_1.default)('guessDocumentTypeFromText identifies card transaction receipts', () => {
    const receiptText = `
        Packing Slip 802433086
        TRANSACTION RECORD
        VISA Auth# 041582
        Total: 544.95 CAD
    `;
    strict_1.default.equal((0, incomingInvoiceDocumentResolver_1.guessDocumentTypeFromText)(receiptText, { subject: 'Fwd: Invoice and reciept' }), 'RECEIPT');
});
(0, node_test_1.default)('pdfLikelyContainsMultipleInvoices detects repeated invoice headers', () => {
    const bulkPdf = `
        INVOICE
        Invoice #10001
        Total $100.00

        INVOICE
        Invoice #10002
        Total $250.00
    `;
    strict_1.default.equal((0, incomingInvoiceDocumentResolver_1.pdfLikelyContainsMultipleInvoices)(bulkPdf), true);
});
(0, node_test_1.default)('splitPdfTextIntoSections splits bulk PDFs into separate sections', () => {
    const bulkPdf = `
        INVOICE
        Sunbelt Rentals
        Invoice #79632146-0001
        Total $100.00

        INVOICE
        Sunbelt Rentals
        Invoice #79632146-0002
        Total $250.00
    `;
    const sections = (0, incomingInvoiceDocumentResolver_1.splitPdfTextIntoSections)(bulkPdf);
    strict_1.default.ok(sections.length >= 2);
    strict_1.default.ok(sections.some((section) => section.includes('79632146-0001')));
    strict_1.default.ok(sections.some((section) => section.includes('79632146-0002')));
});
(0, node_test_1.default)('documentsAreDistinct treats different invoice numbers as separate records', () => {
    const distinct = (0, incomingInvoiceDocumentResolver_1.documentsAreDistinct)([
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
    ]);
    strict_1.default.equal(distinct, true);
});
(0, node_test_1.default)('documentsAreDistinct flags duplicate invoice numbers', () => {
    const distinct = (0, incomingInvoiceDocumentResolver_1.documentsAreDistinct)([
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
    ]);
    strict_1.default.equal(distinct, false);
});
