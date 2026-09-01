import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import {
    computeDueDateFromPaymentTerms,
    formatOutgoingDateOnly,
    mergeMaximTemplateExtraction,
    parseMaximInvoiceDate,
    parseMaximOutgoingInvoiceTemplate,
    type OutgoingInvoiceExtraction,
} from './outgoingInvoiceExtractionService'

const MODEL = 'claude-sonnet-4-6'

const outgoingExtractionSchema = z.object({
    customerName: z.string().optional(),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    paymentTerms: z.string().optional(),
    orderNumber: z.string().optional(),
    supplierNumber: z.string().optional(),
    projectName: z.string().optional(),
    subtotal: z.number().optional(),
    taxAmount: z.number().optional(),
    totalAmount: z.number().optional(),
    currency: z.string().optional(),
    confidence: z.number().optional(),
})

export function buildOutgoingInvoiceSearchText(parts: Array<string | null | undefined>): string {
    return parts
        .map((part) => (part || '').trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 8000)
}

export async function extractOutgoingInvoiceFields(input: {
    subject: string
    bodyText: string
    to: string
    pdfText: string
}): Promise<OutgoingInvoiceExtraction> {
    const template = parseMaximOutgoingInvoiceTemplate(input.pdfText)
    if (template && (template.confidence ?? 0) >= 0.8) {
        return template
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        return mergeMaximTemplateExtraction(template || { confidence: 0.2, source: 'template' }, input.pdfText)
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
        return mergeMaximTemplateExtraction(template || { confidence: 0.3, source: 'ai' }, input.pdfText)
    }

    const parsed = outgoingExtractionSchema.safeParse(JSON.parse(jsonMatch[0]))
    if (!parsed.success) {
        return mergeMaximTemplateExtraction(template || { confidence: 0.3, source: 'ai' }, input.pdfText)
    }

    const data = parsed.data
    let invoiceDate = data.invoiceDate
    let dueDate = data.dueDate
    if (!dueDate && invoiceDate && data.paymentTerms) {
        const invoiceDateObj = parseMaximInvoiceDate(invoiceDate)
        const computed = computeDueDateFromPaymentTerms(invoiceDateObj, data.paymentTerms)
        if (computed) dueDate = formatOutgoingDateOnly(computed)
    }

    return mergeMaximTemplateExtraction({
        ...data,
        invoiceDate,
        dueDate,
        currency: data.currency || 'CAD',
        confidence: data.confidence ?? 0.75,
        source: 'ai',
    }, input.pdfText)
}
