"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMaximOutgoingInvoiceText = isMaximOutgoingInvoiceText;
exports.normalizeMaximInvoiceText = normalizeMaximInvoiceText;
exports.formatOutgoingDateOnly = formatOutgoingDateOnly;
exports.parseMaximInvoiceDate = parseMaximInvoiceDate;
exports.parseOutgoingDateString = parseOutgoingDateString;
exports.computeDueDateFromPaymentTerms = computeDueDateFromPaymentTerms;
exports.parseMaximOutgoingInvoiceTemplate = parseMaximOutgoingInvoiceTemplate;
exports.mergeMaximTemplateExtraction = mergeMaximTemplateExtraction;
exports.guessCustomerFromEmailTo = guessCustomerFromEmailTo;
exports.deriveOutgoingInvoiceStatus = deriveOutgoingInvoiceStatus;
const incomingInvoiceAiService_1 = require("./incomingInvoiceAiService");
const MAXIM_ISSUER_RE = /\bMAXIM\s+MECHANICAL\b/i;
/** Labels that start a new block on Maxim outgoing invoice PDFs. */
const TEMPLATE_FIELD_MARKERS = [
    'To:',
    'ATTN:',
    'Supplier No.:',
    'Supplier No:',
    'Order No.:',
    'Order No:',
    'Project:',
    'INVOICE:',
    'Date:',
    'Payment Net',
    'Cost ',
    'HST ',
    'Amount Due ',
    'Main Shop:',
    'Accounting:',
];
const NEXT_FIELD_RE = /\b(?:ATTN:|Supplier\s+No\.?\s*:|Order\s+No\.?\s*:|Project:|INVOICE:|Date:|Payment\s+Net|Cost\s|HST\s|Amount\s+Due|Main\s+Shop:|Accounting:)/i;
function isMaximOutgoingInvoiceText(text) {
    return MAXIM_ISSUER_RE.test(text);
}
/** Insert line breaks before known labels when OCR collapses the layout onto one line. */
function normalizeMaximInvoiceText(text) {
    let normalized = text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
    for (const marker of TEMPLATE_FIELD_MARKERS) {
        const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        normalized = normalized.replace(new RegExp(`\\s+(${escaped})`, 'gi'), '\n$1');
    }
    return normalized;
}
function formatOutgoingDateOnly(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function parseMoney(raw) {
    if (!raw)
        return null;
    const cleaned = raw.replace(/[$,\s]/g, '');
    const value = Number(cleaned);
    if (!Number.isFinite(value) || value < 0)
        return null;
    return Number(value.toFixed(2));
}
/** Parse dates like "June 22nd, 2026" or "2026-06-22" (local calendar date). */
function parseMaximInvoiceDate(raw) {
    if (!raw)
        return null;
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [y, m, d] = trimmed.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0, 0);
    }
    const iso = (0, incomingInvoiceAiService_1.parseIsoDate)(trimmed);
    if (iso) {
        return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate(), 12, 0, 0, 0);
    }
    const ordinal = trimmed.replace(/(\d+)(st|nd|rd|th)/i, '$1');
    const monthMatch = ordinal.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (monthMatch) {
        const attempt = new Date(`${monthMatch[1]} ${monthMatch[2]}, ${monthMatch[3]} 12:00:00`);
        if (!Number.isNaN(attempt.getTime()))
            return attempt;
    }
    const parsed = new Date(ordinal);
    if (!Number.isNaN(parsed.getTime())) {
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
    }
    return null;
}
function parseOutgoingDateString(raw) {
    if (!raw)
        return null;
    return parseMaximInvoiceDate(raw);
}
function computeDueDateFromPaymentTerms(invoiceDate, paymentTerms) {
    if (!invoiceDate)
        return null;
    const netMatch = paymentTerms?.match(/net\s*(\d+)\s*days?/i);
    if (!netMatch)
        return null;
    const days = Number(netMatch[1]);
    if (!Number.isFinite(days) || days < 0)
        return null;
    const due = new Date(invoiceDate.getFullYear(), invoiceDate.getMonth(), invoiceDate.getDate(), 12, 0, 0, 0);
    due.setDate(due.getDate() + days);
    return due;
}
function sliceUntilNextField(value) {
    const match = value.match(NEXT_FIELD_RE);
    if (!match || match.index == null || match.index === 0)
        return value.trim();
    return value.slice(0, match.index).trim();
}
function trimCustomerCompanyName(value) {
    const line = sliceUntilNextField(value.split('\n')[0] || '').trim();
    const suffixMatch = line.match(/^(.+?(?:Inc\.|Ltd\.|Corp\.|LLC|Limited|Co\.))/i);
    if (suffixMatch)
        return suffixMatch[1].trim();
    const companySuffix = line.match(/^(.+?\b(?:Inc|Ltd|Corp|LLC|Limited|Co)\b)/i);
    if (companySuffix)
        return companySuffix[1].trim();
    const beforeAttn = line.split(/\s+ATTN:/i)[0]?.trim();
    if (beforeAttn)
        return beforeAttn;
    return line.split(/\s{2,}/)[0]?.trim() || line;
}
function extractCustomerName(text) {
    const normalized = normalizeMaximInvoiceText(text);
    const match = normalized.match(/\bTo:\s*([\s\S]*?)(?=\n\s*(?:ATTN:|Supplier\s+No|Order\s+No|Project:|INVOICE:)|$)/i);
    if (!match)
        return null;
    const firstLine = trimCustomerCompanyName(match[1])
        .replace(/\s+Order\s+No.*$/i, '')
        .trim();
    if (!firstLine || /maxim\s+mechanical/i.test(firstLine))
        return null;
    return firstLine;
}
function extractField(text, pattern) {
    const normalized = normalizeMaximInvoiceText(text);
    const match = normalized.match(pattern);
    if (!match?.[1])
        return null;
    return sliceUntilNextField(match[1].trim());
}
function extractOrderNumber(text) {
    const raw = extractField(text, /\bOrder\s+No\.?\s*:?\s*([^\n]+)/i);
    if (!raw)
        return null;
    const digits = raw.match(/[A-Z0-9][A-Z0-9-]*/i)?.[0]?.trim();
    return digits || null;
}
function extractPaymentTerms(text) {
    const normalized = normalizeMaximInvoiceText(text);
    const paymentLine = extractField(normalized, /\bPayment\s+(Net\s+\d+\s+Days)/i);
    if (paymentLine)
        return paymentLine;
    const netDaysMatch = normalized.match(/\bNet\s+(\d+)\s+Days\b/i);
    if (netDaysMatch)
        return `Net ${netDaysMatch[1]} Days`;
    return undefined;
}
function parseMaximOutgoingInvoiceTemplate(text) {
    if (!isMaximOutgoingInvoiceText(text))
        return null;
    const customerName = extractCustomerName(text) || undefined;
    const invoiceNumber = extractField(text, /\bINVOICE:\s*#?\s*([A-Z0-9-]+)/i) || undefined;
    const orderNumber = extractOrderNumber(text) || undefined;
    const supplierNumber = extractField(text, /\bSupplier\s+No\.?\s*:?\s*([^\n]+)/i)
        ?.match(/[A-Z0-9][A-Z0-9-]*/i)?.[0] || undefined;
    const projectName = extractField(text, /\bProject:\s*([^\n]+)/i) || undefined;
    const dateRaw = extractField(text, /\bDate:\s*([^\n]+)/i);
    const paymentTermsRaw = extractPaymentTerms(text);
    const subtotal = parseMoney(extractField(text, /\bCost\s+([\d,]+\.\d{2})/i) || undefined) ?? undefined;
    const taxAmount = parseMoney(extractField(text, /\bHST\s+([\d,]+\.\d{2})/i) || undefined) ?? undefined;
    const totalAmount = parseMoney(extractField(text, /\bAmount\s+Due\s+([\d,]+\.\d{2})/i) || undefined) ?? undefined;
    const invoiceDateObj = parseMaximInvoiceDate(dateRaw || undefined);
    const invoiceDate = invoiceDateObj ? formatOutgoingDateOnly(invoiceDateObj) : undefined;
    const dueDateObj = computeDueDateFromPaymentTerms(invoiceDateObj, paymentTermsRaw);
    const dueDate = dueDateObj ? formatOutgoingDateOnly(dueDateObj) : undefined;
    const hasCoreFields = Boolean(customerName || invoiceNumber || orderNumber || totalAmount != null);
    if (!hasCoreFields)
        return null;
    return {
        customerName,
        invoiceNumber,
        invoiceDate,
        dueDate,
        paymentTerms: paymentTermsRaw,
        orderNumber,
        supplierNumber,
        projectName,
        subtotal,
        taxAmount,
        totalAmount,
        currency: 'CAD',
        confidence: 0.95,
        source: 'template',
    };
}
/** Prefer template values for fixed-layout Maxim fields; fill due date when missing. */
function mergeMaximTemplateExtraction(extracted, pdfText) {
    const template = parseMaximOutgoingInvoiceTemplate(pdfText);
    if (!template)
        return extracted;
    const invoiceDate = extracted.invoiceDate || template.invoiceDate;
    const paymentTerms = extracted.paymentTerms || template.paymentTerms;
    let dueDate = extracted.dueDate || template.dueDate;
    if (!dueDate && invoiceDate && paymentTerms) {
        const due = computeDueDateFromPaymentTerms(parseOutgoingDateString(invoiceDate), paymentTerms);
        if (due)
            dueDate = formatOutgoingDateOnly(due);
    }
    return {
        ...extracted,
        customerName: extracted.customerName || template.customerName,
        orderNumber: extracted.orderNumber || template.orderNumber,
        supplierNumber: extracted.supplierNumber || template.supplierNumber,
        projectName: extracted.projectName || template.projectName,
        invoiceNumber: extracted.invoiceNumber || template.invoiceNumber,
        invoiceDate,
        dueDate,
        paymentTerms,
        subtotal: extracted.subtotal ?? template.subtotal,
        taxAmount: extracted.taxAmount ?? template.taxAmount,
        totalAmount: extracted.totalAmount ?? template.totalAmount,
        currency: extracted.currency || template.currency,
        confidence: Math.max(extracted.confidence ?? 0, template.confidence ?? 0),
        source: template.source,
    };
}
function guessCustomerFromEmailTo(emailTo) {
    if (!emailTo)
        return null;
    const match = emailTo.match(/<?([^<,@]+@[^>,@]+)>?/) || emailTo.match(/^([^,]+)/);
    if (!match)
        return null;
    const raw = match[1].trim();
    if (/@/.test(raw)) {
        const local = raw.split('@')[0].replace(/[._-]+/g, ' ').trim();
        return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
    }
    return raw.replace(/"/g, '').trim() || null;
}
function deriveOutgoingInvoiceStatus(input) {
    const now = input.now ?? new Date();
    const total = input.totalAmount != null ? Number(input.totalAmount) : null;
    const paid = input.paidAmount != null ? Number(input.paidAmount) : null;
    if (input.paidAt) {
        if (total != null && paid != null && paid > 0 && paid < total)
            return 'PARTIAL';
        return 'PAID';
    }
    if (input.dueDate && input.dueDate < now)
        return 'OVERDUE';
    return 'SENT';
}
