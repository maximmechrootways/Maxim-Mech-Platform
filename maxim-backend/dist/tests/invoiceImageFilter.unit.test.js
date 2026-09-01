"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const invoiceImageFilter_1 = require("../lib/invoiceImageFilter");
function makePng(width, height) {
    const buffer = Buffer.alloc(33);
    buffer[0] = 0x89;
    buffer[1] = 0x50;
    buffer[2] = 0x4e;
    buffer[3] = 0x47;
    buffer[4] = 0x0d;
    buffer[5] = 0x0a;
    buffer[6] = 0x1a;
    buffer[7] = 0x0a;
    buffer.write('IHDR', 12, 'ascii');
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
}
(0, node_test_1.default)('isImageAttachmentType detects image mime types and extensions', () => {
    strict_1.default.equal((0, invoiceImageFilter_1.isImageAttachmentType)('image/png', 'logo.png'), true);
    strict_1.default.equal((0, invoiceImageFilter_1.isImageAttachmentType)('application/octet-stream', 'photo.JPG'), true);
    strict_1.default.equal((0, invoiceImageFilter_1.isImageAttachmentType)('application/pdf', 'invoice.pdf'), false);
});
(0, node_test_1.default)('readImageDimensions reads PNG width/height from IHDR', () => {
    const dims = (0, invoiceImageFilter_1.readImageDimensions)(makePng(1700, 2200));
    strict_1.default.deepEqual(dims, { width: 1700, height: 2200 });
});
(0, node_test_1.default)('imageTextHasFinancialContent flags money amounts and finance keywords', () => {
    strict_1.default.equal((0, invoiceImageFilter_1.imageTextHasFinancialContent)('Total Amount Due: 1,234.56'), true);
    strict_1.default.equal((0, invoiceImageFilter_1.imageTextHasFinancialContent)('Invoice Subtotal and HST'), true);
    strict_1.default.equal((0, invoiceImageFilter_1.imageTextHasFinancialContent)('Maxim Mechanical — Quality You Can Trust'), false);
});
(0, node_test_1.default)('classifyInvoiceImageAttachment accepts an image with invoice content', () => {
    const decision = (0, invoiceImageFilter_1.classifyInvoiceImageAttachment)({
        buffer: makePng(1700, 2200),
        ocrText: 'INVOICE\nInvoice No. 28651\nBalance Due $587.60',
    });
    strict_1.default.equal(decision.isLikelyInvoice, true);
    strict_1.default.equal(decision.reason, 'financial_content');
});
(0, node_test_1.default)('classifyInvoiceImageAttachment rejects a small logo with no financial text', () => {
    const decision = (0, invoiceImageFilter_1.classifyInvoiceImageAttachment)({
        buffer: makePng(220, 80),
        ocrText: '',
    });
    strict_1.default.equal(decision.isLikelyInvoice, false);
    strict_1.default.equal(decision.reason, 'image_too_small_for_document');
});
(0, node_test_1.default)('classifyInvoiceImageAttachment rejects a readable logo without financial signals', () => {
    const decision = (0, invoiceImageFilter_1.classifyInvoiceImageAttachment)({
        buffer: makePng(900, 300),
        ocrText: 'Maxim Mechanical Heating Cooling Refrigeration Serving Ontario Since 1998',
    });
    strict_1.default.equal(decision.isLikelyInvoice, false);
    strict_1.default.equal(decision.reason, 'image_text_not_financial');
});
(0, node_test_1.default)('classifyInvoiceImageAttachment keeps large unreadable images as possible scans', () => {
    const decision = (0, invoiceImageFilter_1.classifyInvoiceImageAttachment)({
        buffer: makePng(1654, 2339),
        ocrText: '',
    });
    strict_1.default.equal(decision.isLikelyInvoice, true);
    strict_1.default.equal(decision.reason, 'large_image_possible_scan');
});
