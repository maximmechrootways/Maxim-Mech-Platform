"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOutgoingInvoiceSearchText = buildOutgoingInvoiceSearchText;
exports.extractOutgoingInvoiceFields = extractOutgoingInvoiceFields;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const zod_1 = require("zod");
const outgoingInvoiceExtractionService_1 = require("./outgoingInvoiceExtractionService");
const MODEL = 'claude-sonnet-4-6';
const outgoingExtractionSchema = zod_1.z.object({
    customerName: zod_1.z.string().optional(),
    invoiceNumber: zod_1.z.string().optional(),
    invoiceDate: zod_1.z.string().optional(),
    dueDate: zod_1.z.string().optional(),
    paymentTerms: zod_1.z.string().optional(),
    orderNumber: zod_1.z.string().optional(),
    supplierNumber: zod_1.z.string().optional(),
    projectName: zod_1.z.string().optional(),
    subtotal: zod_1.z.number().optional(),
    taxAmount: zod_1.z.number().optional(),
    totalAmount: zod_1.z.number().optional(),
    currency: zod_1.z.string().optional(),
    confidence: zod_1.z.number().optional(),
});
function buildOutgoingInvoiceSearchText(parts) {
    return parts
        .map((part) => (part || '').trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 8000);
}
async function extractOutgoingInvoiceFields(input) {
    const template = (0, outgoingInvoiceExtractionService_1.parseMaximOutgoingInvoiceTemplate)(input.pdfText);
    if (template && (template.confidence ?? 0) >= 0.8) {
        return template;
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        return (0, outgoingInvoiceExtractionService_1.mergeMaximTemplateExtraction)(template || { confidence: 0.2, source: 'template' }, input.pdfText);
    }
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1200,
        messages: [{
                role: 'user',
                content: [
                    'Extract accounts-receivable fields from this Maxim Mechanical outgoing invoice.',
                    'The issuer is always Maxim Mechanical Group Inc. The customer is in the To: block.',
                    'Return strict JSON only with keys: customerName, invoiceNumber, invoiceDate (YYYY-MM-DD),',
                    'dueDate (YYYY-MM-DD), paymentTerms, orderNumber, supplierNumber, projectName,',
                    'subtotal, taxAmount, totalAmount, currency, confidence (0-1).',
                    `Email subject: ${input.subject}`,
                    `Email to: ${input.to}`,
                    `Email body: ${input.bodyText.slice(0, 1500)}`,
                    `PDF text:\n${input.pdfText.slice(0, 12000)}`,
                ].join('\n'),
            }],
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return (0, outgoingInvoiceExtractionService_1.mergeMaximTemplateExtraction)(template || { confidence: 0.3, source: 'ai' }, input.pdfText);
    }
    const parsed = outgoingExtractionSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
        return (0, outgoingInvoiceExtractionService_1.mergeMaximTemplateExtraction)(template || { confidence: 0.3, source: 'ai' }, input.pdfText);
    }
    const data = parsed.data;
    let invoiceDate = data.invoiceDate;
    let dueDate = data.dueDate;
    if (!dueDate && invoiceDate && data.paymentTerms) {
        const invoiceDateObj = (0, outgoingInvoiceExtractionService_1.parseMaximInvoiceDate)(invoiceDate);
        const computed = (0, outgoingInvoiceExtractionService_1.computeDueDateFromPaymentTerms)(invoiceDateObj, data.paymentTerms);
        if (computed)
            dueDate = (0, outgoingInvoiceExtractionService_1.formatOutgoingDateOnly)(computed);
    }
    return (0, outgoingInvoiceExtractionService_1.mergeMaximTemplateExtraction)({
        ...data,
        invoiceDate,
        dueDate,
        currency: data.currency || 'CAD',
        confidence: data.confidence ?? 0.75,
        source: 'ai',
    }, input.pdfText);
}
