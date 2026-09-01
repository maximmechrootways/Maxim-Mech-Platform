"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const outgoingInvoiceExtractionService_1 = require("../services/outgoingInvoiceExtractionService");
const outgoingInvoiceIngestionService_1 = require("../services/outgoingInvoiceIngestionService");
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
`;
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
MAXIM MECHANICAL GROUP INC`;
const COLLAPSED_OCR_TEXT = `Payment Net 45 Days MAXIM MECHANICAL GROUP INC. To: Bombardier Inc. Bombardier Aerospace ATTN: Accounts Payable Supplier No.: 122894 Order No.: 73100014586 Project: BFP Testing – Annual INVOICE: #3292A Cost 1,280.00 HST 166.40 Amount Due 1,446.40 Date: June 22nd, 2026`;
(0, node_test_1.default)('isMaximOutgoingInvoiceText detects Maxim issuer', () => {
    strict_1.default.equal((0, outgoingInvoiceExtractionService_1.isMaximOutgoingInvoiceText)(EXAMPLE_PDF_TEXT), true);
    strict_1.default.equal((0, outgoingInvoiceExtractionService_1.isMaximOutgoingInvoiceText)('Vendor Co invoice'), false);
});
(0, node_test_1.default)('parseMaximOutgoingInvoiceTemplate extracts example fields', () => {
    const parsed = (0, outgoingInvoiceExtractionService_1.parseMaximOutgoingInvoiceTemplate)(EXAMPLE_PDF_TEXT);
    strict_1.default.ok(parsed);
    strict_1.default.equal(parsed?.customerName, 'Bombardier Inc.');
    strict_1.default.equal(parsed?.invoiceNumber, '3292A');
    strict_1.default.equal(parsed?.orderNumber, '73100014586');
    strict_1.default.equal(parsed?.supplierNumber, '122894');
    strict_1.default.match(parsed?.projectName || '', /BFP Testing/);
    strict_1.default.equal(parsed?.subtotal, 1280);
    strict_1.default.equal(parsed?.taxAmount, 166.4);
    strict_1.default.equal(parsed?.totalAmount, 1446.4);
    strict_1.default.equal(parsed?.paymentTerms, 'Net 45 Days');
    strict_1.default.equal(parsed?.invoiceDate, '2026-06-22');
    strict_1.default.equal(parsed?.dueDate, '2026-08-06');
});
(0, node_test_1.default)('parseMaximOutgoingInvoiceTemplate handles full Maxim PDF layout', () => {
    const parsed = (0, outgoingInvoiceExtractionService_1.parseMaximOutgoingInvoiceTemplate)(FULL_EXAMPLE_PDF_TEXT);
    strict_1.default.ok(parsed);
    strict_1.default.equal(parsed?.customerName, 'Bombardier Inc.');
    strict_1.default.equal(parsed?.orderNumber, '73100014586');
    strict_1.default.equal(parsed?.dueDate, '2026-08-06');
});
(0, node_test_1.default)('parseMaximOutgoingInvoiceTemplate handles collapsed OCR text', () => {
    const parsed = (0, outgoingInvoiceExtractionService_1.parseMaximOutgoingInvoiceTemplate)(COLLAPSED_OCR_TEXT);
    strict_1.default.ok(parsed);
    strict_1.default.equal(parsed?.customerName, 'Bombardier Inc.');
    strict_1.default.equal(parsed?.orderNumber, '73100014586');
    strict_1.default.equal(parsed?.dueDate, '2026-08-06');
    strict_1.default.ok((0, outgoingInvoiceExtractionService_1.normalizeMaximInvoiceText)(COLLAPSED_OCR_TEXT).includes('\nTo:'));
});
(0, node_test_1.default)('parseMaximInvoiceDate handles ordinals', () => {
    const date = (0, outgoingInvoiceExtractionService_1.parseMaximInvoiceDate)('June 22nd, 2026');
    strict_1.default.ok(date);
    strict_1.default.equal(date?.getFullYear(), 2026);
    strict_1.default.equal(date?.getMonth(), 5);
    strict_1.default.equal(date?.getDate(), 22);
});
(0, node_test_1.default)('computeDueDateFromPaymentTerms adds net days', () => {
    const invoiceDate = new Date(2026, 5, 22, 12, 0, 0);
    const due = (0, outgoingInvoiceExtractionService_1.computeDueDateFromPaymentTerms)(invoiceDate, 'Net 45 Days');
    strict_1.default.ok(due);
    strict_1.default.equal(due?.getFullYear(), 2026);
    strict_1.default.equal(due?.getMonth(), 7);
    strict_1.default.equal(due?.getDate(), 6);
});
(0, node_test_1.default)('deriveOutgoingInvoiceStatus transitions', () => {
    const dueFuture = new Date('2099-01-01');
    const duePast = new Date('2020-01-01');
    strict_1.default.equal((0, outgoingInvoiceExtractionService_1.deriveOutgoingInvoiceStatus)({ dueDate: dueFuture }), 'SENT');
    strict_1.default.equal((0, outgoingInvoiceExtractionService_1.deriveOutgoingInvoiceStatus)({ dueDate: duePast }), 'OVERDUE');
    strict_1.default.equal((0, outgoingInvoiceExtractionService_1.deriveOutgoingInvoiceStatus)({ paidAt: new Date(), totalAmount: 100 }), 'PAID');
    strict_1.default.equal((0, outgoingInvoiceExtractionService_1.deriveOutgoingInvoiceStatus)({
        paidAt: new Date(),
        totalAmount: 100,
        paidAmount: 40,
    }), 'PARTIAL');
});
(0, node_test_1.default)('computeOutgoingInvoiceBackoffMs grows with attempts', () => {
    strict_1.default.equal((0, outgoingInvoiceIngestionService_1.computeOutgoingInvoiceBackoffMs)(1), 5000);
    strict_1.default.ok((0, outgoingInvoiceIngestionService_1.computeOutgoingInvoiceBackoffMs)(3) > (0, outgoingInvoiceIngestionService_1.computeOutgoingInvoiceBackoffMs)(1));
});
