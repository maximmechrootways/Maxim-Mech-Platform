"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const incomingInvoiceIngestionService_1 = require("../services/incomingInvoiceIngestionService");
const incomingInvoiceAiService_1 = require("../services/incomingInvoiceAiService");
(0, node_test_1.default)('extractGmailMessageIdFromTriggerPayload reads nested ids', () => {
    const payload = {
        data: {
            payload: {
                id: 'abc123message',
                thread_id: 'thread-1',
            },
        },
    };
    strict_1.default.equal((0, incomingInvoiceIngestionService_1.extractGmailMessageIdFromTriggerPayload)(payload), 'abc123message');
    strict_1.default.equal((0, incomingInvoiceIngestionService_1.extractGmailThreadIdFromTriggerPayload)(payload), 'thread-1');
});
(0, node_test_1.default)('computeIncomingInvoiceBackoffMs grows with attempts', () => {
    strict_1.default.equal((0, incomingInvoiceIngestionService_1.computeIncomingInvoiceBackoffMs)(1), 5000);
    strict_1.default.ok((0, incomingInvoiceIngestionService_1.computeIncomingInvoiceBackoffMs)(3) > (0, incomingInvoiceIngestionService_1.computeIncomingInvoiceBackoffMs)(1));
});
(0, node_test_1.default)('parseIsoDate accepts ISO strings', () => {
    const date = (0, incomingInvoiceAiService_1.parseIsoDate)('2026-06-01');
    strict_1.default.ok(date instanceof Date);
    strict_1.default.equal((0, incomingInvoiceAiService_1.parseIsoDate)('not-a-date'), null);
});
(0, node_test_1.default)('buildInvoiceSearchText joins non-empty parts', () => {
    const text = (0, incomingInvoiceAiService_1.buildInvoiceSearchText)(['Vendor Co', '', 'INV-100', null]);
    strict_1.default.match(text, /Vendor Co/);
    strict_1.default.match(text, /INV-100/);
});
