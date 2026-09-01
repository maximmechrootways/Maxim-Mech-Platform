"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceExtractionSchema = void 0;
exports.reconcileInvoiceVendor = reconcileInvoiceVendor;
exports.reconcileInvoiceIdentifiers = reconcileInvoiceIdentifiers;
exports.reconcileInvoiceExtraction = reconcileInvoiceExtraction;
exports.reconcileInvoiceAmounts = reconcileInvoiceAmounts;
exports.normalizeInvoiceExtraction = normalizeInvoiceExtraction;
exports.classifyIncomingFinanceEmail = classifyIncomingFinanceEmail;
exports.classifyEmailAsInvoice = classifyEmailAsInvoice;
exports.extractSingleAttachmentDocument = extractSingleAttachmentDocument;
exports.extractMultipleInvoiceDocuments = extractMultipleInvoiceDocuments;
exports.extractInvoiceFields = extractInvoiceFields;
exports.parseIsoDate = parseIsoDate;
exports.buildInvoiceSearchText = buildInvoiceSearchText;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const zod_1 = require("zod");
const invoicePdfText_1 = require("../lib/invoicePdfText");
const MODEL = 'claude-sonnet-4-6';
const lineItemSchema = zod_1.z.object({
    description: zod_1.z.string().optional(),
    quantity: zod_1.z.number().optional(),
    unitPrice: zod_1.z.number().optional(),
    amount: zod_1.z.number().optional(),
    sku: zod_1.z.string().optional(),
});
const addressSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    line1: zod_1.z.string().optional(),
    line2: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    province: zod_1.z.string().optional(),
    postalCode: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
});
exports.invoiceExtractionSchema = zod_1.z.object({
    vendor: zod_1.z.object({
        name: zod_1.z.string().optional(),
        address: addressSchema.optional(),
        phone: zod_1.z.string().optional(),
        email: zod_1.z.string().optional(),
        taxId: zod_1.z.string().optional(),
        website: zod_1.z.string().optional(),
    }).optional(),
    billTo: addressSchema.optional(),
    shipTo: addressSchema.optional(),
    invoiceNumber: zod_1.z.string().optional(),
    invoiceDate: zod_1.z.string().optional(),
    dueDate: zod_1.z.string().optional(),
    poNumber: zod_1.z.string().optional(),
    jobReference: zod_1.z.string().optional(),
    siteReference: zod_1.z.string().optional(),
    paymentTerms: zod_1.z.string().optional(),
    currency: zod_1.z.string().optional(),
    subtotal: zod_1.z.number().optional(),
    taxAmount: zod_1.z.number().optional(),
    taxBreakdown: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().optional(),
        rate: zod_1.z.string().optional(),
        amount: zod_1.z.number().optional(),
    })).optional(),
    discountAmount: zod_1.z.number().optional(),
    shippingAmount: zod_1.z.number().optional(),
    totalAmount: zod_1.z.number().optional(),
    amountDue: zod_1.z.number().optional(),
    lineItems: zod_1.z.array(lineItemSchema).optional(),
    remittance: zod_1.z.object({
        bankName: zod_1.z.string().optional(),
        accountNumber: zod_1.z.string().optional(),
        routingNumber: zod_1.z.string().optional(),
        iban: zod_1.z.string().optional(),
        swift: zod_1.z.string().optional(),
        instructions: zod_1.z.string().optional(),
    }).optional(),
    notes: zod_1.z.string().optional(),
    confidence: zod_1.z.number().optional(),
    documentType: zod_1.z.enum(['INVOICE', 'RECEIPT', 'STATEMENT']).optional(),
    paymentReference: zod_1.z.string().optional(),
});
function roundMoney(value) {
    return Number(value.toFixed(2));
}
function lineItemsSubtotal(lineItems) {
    if (!lineItems?.length)
        return null;
    const sum = lineItems.reduce((acc, item) => acc + (item.amount ?? 0), 0);
    return sum > 0 ? roundMoney(sum) : null;
}
/** Normalize vendor name — company only, not addresses or remit blocks. */
function reconcileInvoiceVendor(extracted, pdfText, context) {
    const pdfVendor = pdfText ? (0, invoicePdfText_1.guessVendorFromPdfText)(pdfText, context) : null;
    const aiVendor = extracted.vendor?.name ? (0, invoicePdfText_1.cleanVendorName)(extracted.vendor.name) : null;
    const best = pdfVendor || aiVendor;
    if (!best)
        return extracted;
    return { ...extracted, vendor: { ...extracted.vendor, name: best } };
}
function isGarbageJobReference(value) {
    if (!value)
        return false;
    return /charge|balance|paid|customer/i.test(value.trim());
}
/** Correct invoice # and PO when AI captures field labels instead of values. */
function reconcileInvoiceIdentifiers(extracted, pdfText, context) {
    const result = { ...extracted };
    const pdfInvoiceNum = pdfText ? (0, invoicePdfText_1.guessInvoiceNumberFromPdfText)(pdfText, { subject: context?.subject }) : null;
    if (pdfInvoiceNum) {
        result.invoiceNumber = pdfInvoiceNum;
    }
    else if (!(0, invoicePdfText_1.isValidInvoiceNumber)(result.invoiceNumber)) {
        result.invoiceNumber = undefined;
    }
    const pdfPo = pdfText ? (0, invoicePdfText_1.guessPoNumberFromPdfText)(pdfText) : null;
    if (pdfPo) {
        result.poNumber = pdfPo;
    }
    else if (!(0, invoicePdfText_1.isValidPoNumber)(result.poNumber)) {
        result.poNumber = undefined;
    }
    if (isGarbageJobReference(result.jobReference)) {
        result.jobReference = undefined;
    }
    return result;
}
function reconcileInvoiceExtraction(extracted, pdfText, context) {
    const withAmounts = reconcileInvoiceAmounts(extracted, pdfText);
    const withVendor = reconcileInvoiceVendor(withAmounts, pdfText, context);
    return reconcileInvoiceIdentifiers(withVendor, pdfText, context);
}
/** Fill and correct subtotal / tax / total using PDF labels and arithmetic. */
function reconcileInvoiceAmounts(extracted, pdfText) {
    const result = { ...extracted };
    const pdfAmounts = pdfText ? (0, invoicePdfText_1.guessAmountsFromPdfText)(pdfText) : { subtotal: null, taxAmount: null, totalAmount: null };
    const lineSum = lineItemsSubtotal(result.lineItems);
    if (pdfAmounts.subtotal != null)
        result.subtotal = pdfAmounts.subtotal;
    else if (result.subtotal == null && lineSum != null)
        result.subtotal = lineSum;
    if (pdfAmounts.taxAmount != null)
        result.taxAmount = pdfAmounts.taxAmount;
    if (pdfAmounts.totalAmount != null)
        result.totalAmount = pdfAmounts.totalAmount;
    else if (result.totalAmount == null && result.amountDue != null)
        result.totalAmount = result.amountDue;
    if (result.subtotal != null && result.taxAmount != null) {
        const expectedTotal = roundMoney(result.subtotal + result.taxAmount);
        if (result.totalAmount == null || Math.abs(result.totalAmount - result.subtotal) < 0.01) {
            result.totalAmount = expectedTotal;
        }
    }
    if (result.totalAmount == null && result.subtotal != null && result.taxAmount != null) {
        result.totalAmount = roundMoney(result.subtotal + result.taxAmount);
    }
    if (result.totalAmount == null && lineSum != null && (result.taxAmount == null || result.taxAmount === 0)) {
        result.totalAmount = lineSum;
        if (result.subtotal == null)
            result.subtotal = lineSum;
    }
    if (result.lineItems?.length === 1) {
        const item = result.lineItems[0];
        if (item.unitPrice != null && item.amount != null && item.amount > item.unitPrice) {
            if (result.totalAmount === item.unitPrice)
                result.totalAmount = item.amount;
            if (result.subtotal == null || result.subtotal === item.unitPrice)
                result.subtotal = item.amount;
        }
    }
    if (result.subtotal != null
        && result.taxAmount != null
        && result.totalAmount != null
        && result.totalAmount < result.subtotal) {
        result.totalAmount = roundMoney(result.subtotal + result.taxAmount);
    }
    return result;
}
/** Fill totalAmount from other extracted fields when the model omits it. */
function normalizeInvoiceExtraction(extracted) {
    return reconcileInvoiceExtraction(extracted);
}
function getClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        throw new Error('ANTHROPIC_API_KEY is required for invoice AI processing');
    return new sdk_1.default({ apiKey });
}
function extractJsonText(raw) {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1])
        return fenced[1].trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start)
        return trimmed.slice(start, end + 1);
    return trimmed;
}
const classificationSchema = zod_1.z.object({
    isInvoice: zod_1.z.boolean(),
    confidence: zod_1.z.number().min(0).max(1),
    reason: zod_1.z.string(),
});
const financeClassificationSchema = zod_1.z.object({
    shouldProcess: zod_1.z.boolean(),
    confidence: zod_1.z.number().min(0).max(1),
    reason: zod_1.z.string(),
    documentTypes: zod_1.z.array(zod_1.z.enum(['INVOICE', 'RECEIPT', 'STATEMENT'])).default(['INVOICE']),
});
const multiDocumentSchema = zod_1.z.object({
    documents: zod_1.z.array(exports.invoiceExtractionSchema.extend({
        documentType: zod_1.z.enum(['INVOICE', 'RECEIPT', 'STATEMENT']).optional(),
    })),
});
async function classifyIncomingFinanceEmail(input) {
    const client = getClient();
    const prompt = [
        'Decide whether this email should be processed for accounts payable / payment records.',
        'Return strict JSON: {"shouldProcess":boolean,"confidence":0-1,"reason":"...","documentTypes":["INVOICE"|"RECEIPT"|"STATEMENT"]}.',
        'Process vendor invoices, bills, account statements, and payment receipts.',
        'documentTypes may include multiple values when the email contains several document kinds.',
        'INVOICE = bill requesting payment. RECEIPT = proof payment was already made. STATEMENT = account summary.',
        'Ignore quotes, purchase orders only, marketing, general correspondence, and shipping notices without charges.',
        `Subject: ${input.subject}`,
        `From: ${input.from}`,
        `Attachments: ${input.attachmentNames.join(', ') || '(none)'}`,
        'Body:',
        input.bodyText.slice(0, 8000),
    ].join('\n');
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 500,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n');
    return financeClassificationSchema.parse(JSON.parse(extractJsonText(text)));
}
/** @deprecated Use classifyIncomingFinanceEmail */
async function classifyEmailAsInvoice(input) {
    const result = await classifyIncomingFinanceEmail(input);
    return {
        isInvoice: result.shouldProcess,
        confidence: result.confidence,
        reason: result.reason,
    };
}
function buildSingleDocumentExtractionPrompt(input) {
    const multiRules = input.multi
        ? [
            'This PDF may contain MULTIPLE separate invoices. Return strict JSON:',
            '{"documents":[{"documentType":"INVOICE"|"RECEIPT"|"STATEMENT","vendor":{...},"invoiceNumber":"","totalAmount":0,...}]}',
            'Return one entry per distinct invoice/receipt in the PDF. Do not merge separate invoices.',
        ]
        : [
            'Return strict JSON matching this shape:',
            '{"documentType":"INVOICE"|"RECEIPT"|"STATEMENT","vendor":{"name":"","address":{},"phone":"","email":"","taxId":""},"billTo":{},"shipTo":{},"invoiceNumber":"","invoiceDate":"YYYY-MM-DD","dueDate":"YYYY-MM-DD","poNumber":"","jobReference":"","siteReference":"","paymentTerms":"","currency":"CAD","subtotal":0,"taxAmount":0,"taxBreakdown":[],"discountAmount":0,"shippingAmount":0,"totalAmount":0,"amountDue":0,"lineItems":[{"description":"","quantity":0,"unitPrice":0,"amount":0}],"remittance":{},"notes":"","paymentReference":"","confidence":0-1}',
        ];
    return [
        'Extract finance document information from this email attachment.',
        ...multiRules,
        'documentType rules:',
        '- INVOICE = requests payment (amount due, due date, payment terms).',
        '- RECEIPT = confirms payment already received (amount paid, thank you for payment, balance $0).',
        '- STATEMENT = account summary with multiple line items / running balance.',
        'CRITICAL amount rules — these are different fields:',
        '- subtotal = pre-tax sum of line items (look for "Subtotal"). Never use unit price or hourly rate as subtotal.',
        '- taxAmount = tax line only (HST, GST, PST, VAT).',
        '- totalAmount = final amount due INCLUDING tax (look for "Balance Due", "Amount Due", "Grand Total", "Invoice Total").',
        '- For RECEIPT documents, totalAmount is the amount paid.',
        '- Do NOT put subtotal into totalAmount when tax exists. Example: subtotal 2200 + HST 286 => totalAmount 2486.',
        '- Do NOT confuse unit price ($55/hr) or quantity with subtotal/total. Use the line-item amount column and summary rows.',
        '- For account statements (multiple invoices), use the statement Balance Due / Current balance as totalAmount, not a single line item.',
        'Vendor rules:',
        '- vendor.name must be ONLY the billing company name (e.g. "Sunbelt Rentals", "Traditional Air Systems Inc").',
        '- Do NOT include addresses, PO boxes, phone, fax, email, remit-to blocks, or payment instructions in vendor.name.',
        '- Put addresses and remittance details in vendor.address or remittance, not vendor.name.',
        'Invoice number rules:',
        '- invoiceNumber must be a real document number containing digits (e.g. 28651, 79632146-0004, 41489).',
        '- Never use column/field labels as invoiceNumber (Date, Customer, Page, Box, Charge, Balance).',
        '- When labels are glued together (e.g. "Invoice No.: Date: Page: 28651"), use the numeric value 28651.',
        '- For statements, use the statement number from the subject or header, not table column labels.',
        '- For receipts, put the paid invoice number in invoiceNumber and any transaction id in paymentReference.',
        'PO / job rules:',
        '- poNumber is a purchase order reference only — not "PO BOX" from a mailing address.',
        '- jobReference is a job name or code on the invoice — not payment fields like ChargePaidBalance.',
        'If subtotal and tax are present but total is not explicit, compute totalAmount = subtotal + taxAmount.',
        'Use ISO dates when possible. Prefer values found in PDF OCR over email body when they conflict.',
        'Include all line items you can find. Put invoice footnotes or payment instructions in notes. Leave unknown fields null or omit them.',
        `Subject: ${input.subject}`,
        `From: ${input.from}`,
        `Attachment: ${input.attachmentName}`,
        'Email body:',
        input.bodyText.slice(0, 4000),
        'PDF OCR:',
        input.ocrText.slice(0, 48000),
    ].join('\n\n');
}
async function extractSingleAttachmentDocument(input) {
    const client = getClient();
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: buildSingleDocumentExtractionPrompt({ ...input, multi: false }) }],
    });
    const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n');
    const parsed = exports.invoiceExtractionSchema.parse(JSON.parse(extractJsonText(text)));
    return reconcileInvoiceExtraction(parsed, input.ocrText, {
        from: input.from,
        subject: input.subject,
        bodyText: input.bodyText,
    });
}
async function extractMultipleInvoiceDocuments(input) {
    const client = getClient();
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        temperature: 0,
        messages: [{ role: 'user', content: buildSingleDocumentExtractionPrompt({ ...input, multi: true }) }],
    });
    const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n');
    const parsed = multiDocumentSchema.parse(JSON.parse(extractJsonText(text)));
    return parsed.documents.map((doc) => reconcileInvoiceExtraction(doc, input.ocrText, {
        from: input.from,
        subject: input.subject,
        bodyText: input.bodyText,
    }));
}
async function extractInvoiceFields(input) {
    const client = getClient();
    const ocrBlock = input.ocrTexts
        .map((entry, index) => `--- PDF ${index + 1}: ${entry.filename} ---\n${entry.text.slice(0, 12000)}`)
        .join('\n\n');
    const prompt = [
        'Extract as much invoice information as possible from the email and PDF OCR text.',
        'Return strict JSON matching this shape:',
        '{"vendor":{"name":"","address":{},"phone":"","email":"","taxId":""},"billTo":{},"shipTo":{},"invoiceNumber":"","invoiceDate":"YYYY-MM-DD","dueDate":"YYYY-MM-DD","poNumber":"","jobReference":"","siteReference":"","paymentTerms":"","currency":"CAD","subtotal":0,"taxAmount":0,"taxBreakdown":[],"discountAmount":0,"shippingAmount":0,"totalAmount":0,"amountDue":0,"lineItems":[{"description":"","quantity":0,"unitPrice":0,"amount":0}],"remittance":{},"notes":"","confidence":0-1}',
        'CRITICAL amount rules — these are different fields:',
        '- subtotal = pre-tax sum of line items (look for "Subtotal"). Never use unit price or hourly rate as subtotal.',
        '- taxAmount = tax line only (HST, GST, PST, VAT).',
        '- totalAmount = final amount due INCLUDING tax (look for "Balance Due", "Amount Due", "Grand Total", "Invoice Total").',
        '- Do NOT put subtotal into totalAmount when tax exists. Example: subtotal 2200 + HST 286 => totalAmount 2486.',
        '- Do NOT confuse unit price ($55/hr) or quantity with subtotal/total. Use the line-item amount column and summary rows.',
        '- For account statements (multiple invoices), use the statement Balance Due / Current balance as totalAmount, not a single line item.',
        'Vendor rules:',
        '- vendor.name must be ONLY the billing company name (e.g. "Sunbelt Rentals", "Traditional Air Systems Inc").',
        '- Do NOT include addresses, PO boxes, phone, fax, email, remit-to blocks, or payment instructions in vendor.name.',
        '- Put addresses and remittance details in vendor.address or remittance, not vendor.name.',
        'Invoice number rules:',
        '- invoiceNumber must be a real document number containing digits (e.g. 28651, 79632146-0004, 41489).',
        '- Never use column/field labels as invoiceNumber (Date, Customer, Page, Box, Charge, Balance).',
        '- When labels are glued together (e.g. "Invoice No.: Date: Page: 28651"), use the numeric value 28651.',
        '- For statements, use the statement number from the subject or header, not table column labels.',
        'PO / job rules:',
        '- poNumber is a purchase order reference only — not "PO BOX" from a mailing address.',
        '- jobReference is a job name or code on the invoice — not payment fields like ChargePaidBalance.',
        'If subtotal and tax are present but total is not explicit, compute totalAmount = subtotal + taxAmount.',
        'Use ISO dates when possible. Prefer values found in PDF OCR over email body when they conflict.',
        'Include all line items you can find. Put invoice footnotes or payment instructions in notes. Leave unknown fields null or omit them.',
        `Subject: ${input.subject}`,
        `From: ${input.from}`,
        `Attachments: ${input.attachmentNames.join(', ')}`,
        'Email body:',
        input.bodyText.slice(0, 6000),
        'PDF OCR:',
        ocrBlock.slice(0, 48000),
    ].join('\n\n');
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n');
    const parsed = exports.invoiceExtractionSchema.parse(JSON.parse(extractJsonText(text)));
    const pdfText = input.ocrTexts.map((entry) => entry.text).join('\n');
    return reconcileInvoiceExtraction(parsed, pdfText, {
        from: input.from,
        subject: input.subject,
        bodyText: input.bodyText,
    });
}
function parseIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function buildInvoiceSearchText(parts) {
    return parts
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 50000);
}
