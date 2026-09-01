"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guessInvoiceNumberFromEmailContext = guessInvoiceNumberFromEmailContext;
exports.guessVendorFromEmailMetadata = guessVendorFromEmailMetadata;
exports.guessDocumentTypeFromText = guessDocumentTypeFromText;
exports.pdfLikelyContainsMultipleInvoices = pdfLikelyContainsMultipleInvoices;
exports.splitPdfTextIntoSections = splitPdfTextIntoSections;
exports.resolveIncomingDocumentsFromAttachments = resolveIncomingDocumentsFromAttachments;
exports.documentsAreDistinct = documentsAreDistinct;
const invoicePdfText_1 = require("../lib/invoicePdfText");
const incomingInvoiceAiService_1 = require("./incomingInvoiceAiService");
function hasInvoiceDocumentStructure(text) {
    return /\bINVOICE\b/i.test(text) && /invoice\s+no/i.test(text);
}
function hasReceiptDocumentStructure(text) {
    return (/\bpayment\s+receipt\b/i.test(text)
        || /\btransaction\s+record\b/i.test(text)
        || /\bpayment\s+confirmation\b/i.test(text)
        || /\belectronic\s+receipt\b/i.test(text)
        || (/\breceipt\b/i.test(text) && !hasInvoiceDocumentStructure(text)));
}
function hasStatementDocumentStructure(text, subject, filename) {
    const subjectLower = (subject ?? '').toLowerCase();
    const filenameLower = (filename ?? '').toLowerCase();
    if (/\bstatement\b/.test(subjectLower) || /\bstatement\b/.test(filenameLower))
        return true;
    return /\bstatement\b/i.test(text)
        && !hasInvoiceDocumentStructure(text)
        && (/\bcurrent\s+balance\b/i.test(text) || /\bstatement\s+date\b/i.test(text) || /\bplease\s+remit\b/i.test(text));
}
function guessInvoiceNumberFromEmailContext(subject) {
    if (!subject)
        return undefined;
    const cleaned = subject.replace(/^fwd:\s*/i, '').trim();
    const receiptDash = cleaned.match(/(\d{3,})\s*-\s*receipt/i);
    if (receiptDash?.[1] && (0, invoicePdfText_1.isValidInvoiceNumber)(receiptDash[1]))
        return receiptDash[1];
    const fromSubject = (0, invoicePdfText_1.guessInvoiceNumberFromPdfText)('', { subject });
    return fromSubject ?? undefined;
}
function guessVendorFromEmailMetadata(from, bodyText) {
    return (0, invoicePdfText_1.guessVendorFromPdfText)('', { from, bodyText })
        || (0, invoicePdfText_1.guessVendorFromSender)(from);
}
function guessAmountFromEmailBody(bodyText) {
    if (!bodyText)
        return null;
    const patterns = [
        /\btotal\s*(?:paid|amount)?\s*[:=]?\s*\$?\s*([\d,]+\.\d{2})/i,
        /\bamount\s+paid\s*[:=]?\s*\$?\s*([\d,]+\.\d{2})/i,
        /\bpayment\s+of\s*\$?\s*([\d,]+\.\d{2})/i,
        /\$\s*([\d,]+\.\d{2})\s*(?:cad|usd)?\b/i,
    ];
    for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        const raw = match?.[1]?.replace(/,/g, '');
        const value = raw ? Number(raw) : NaN;
        if (Number.isFinite(value) && value > 0)
            return value;
    }
    return null;
}
function buildFallbackExtractionFromEmail(input, attachment) {
    const documentType = guessDocumentTypeFromText('', {
        subject: input.subject,
        filename: attachment.filename,
    });
    const vendorName = guessVendorFromEmailMetadata(input.from, input.bodyText);
    const totalAmount = guessAmountFromEmailBody(input.bodyText);
    return {
        documentType,
        vendor: vendorName ? { name: vendorName } : undefined,
        invoiceNumber: guessInvoiceNumberFromEmailContext(input.subject),
        totalAmount: totalAmount ?? undefined,
        currency: /\bcad\b/i.test(input.bodyText) ? 'CAD' : 'CAD',
        notes: 'Created from email metadata — attachment text could not be read automatically. Open the file and edit fields if needed.',
    };
}
function guessDocumentTypeFromText(text, context) {
    if (!text.trim() && context?.subject) {
        const subject = context.subject.toLowerCase();
        if (/\bstatement\b/.test(subject))
            return 'STATEMENT';
        if (/\breceipt\b/.test(subject))
            return 'RECEIPT';
        if (/\binvoice\b/.test(subject))
            return 'INVOICE';
    }
    if (hasStatementDocumentStructure(text, context?.subject, context?.filename)) {
        return 'STATEMENT';
    }
    if (hasReceiptDocumentStructure(text) && !hasInvoiceDocumentStructure(text)) {
        return 'RECEIPT';
    }
    if (hasInvoiceDocumentStructure(text)) {
        return 'INVOICE';
    }
    const body = text.toLowerCase();
    const receiptSignals = [
        /\bpayment\s+receipt\b/,
        /\bpaid\s+in\s+full\b/,
        /\bthank\s+you\s+for\s+your\s+payment\b/,
        /\bpayment\s+confirmation\b/,
        /\bpayment\s+received\b/,
        /\btransaction\s+record\b/,
        /\bproof\s+of\s+payment\b/,
    ];
    const invoiceSignals = [
        /\bamount\s+due\b/,
        /\bbalance\s+due\b/,
        /\bdue\s+date\b/,
        /\bpayment\s+terms\b/,
        /\bplease\s+remit\b/,
        /\binvoice\s+total\b/,
        /\bnet\s+\d+\b/,
    ];
    const receiptScore = receiptSignals.reduce((n, pattern) => n + (pattern.test(body) ? 1 : 0), 0);
    const invoiceScore = invoiceSignals.reduce((n, pattern) => n + (pattern.test(body) ? 1 : 0), 0);
    if (receiptScore >= 2 && receiptScore > invoiceScore)
        return 'RECEIPT';
    if (receiptScore >= 1 && invoiceScore === 0)
        return 'RECEIPT';
    return 'INVOICE';
}
/** Detect whether one PDF likely contains multiple separate invoices. */
function pdfLikelyContainsMultipleInvoices(text) {
    const compact = text.replace(/\s+/g, ' ');
    const headerHits = (compact.match(/\bINVOICE\b/gi) ?? []).length;
    if (headerHits >= 2)
        return true;
    const numbers = new Set();
    const patterns = [
        /\bINVOICE\s*#\s*([A-Z0-9][\w-]{2,})/gi,
        /\bInvoice\s+No\.?:\s*(?:Date:\s*)?(?:Page:\s*)?(\d{4,})/gi,
        /\b(\d{8,}-\d{3,4})\b/g,
    ];
    for (const pattern of patterns) {
        for (const match of compact.matchAll(pattern)) {
            const value = match[1]?.trim();
            if (value && (0, invoicePdfText_1.isValidInvoiceNumber)(value))
                numbers.add(value);
        }
    }
    return numbers.size >= 2;
}
function splitPdfTextIntoSections(text) {
    const normalized = text.replace(/\r\n/g, '\n');
    const parts = normalized.split(/(?=\n\s*INVOICE\b|\n\s*Invoice\s*(?:#|No\.?))/i)
        .map((part) => part.trim())
        .filter((part) => part.length > 80);
    if (parts.length >= 2)
        return parts;
    const numbers = [...new Set([...normalized.matchAll(/\b(\d{8,}-\d{3,4})\b/g)]
            .map((match) => match[1])
            .filter((value) => (0, invoicePdfText_1.isValidInvoiceNumber)(value)))];
    if (numbers.length < 2)
        return [text];
    const sections = [];
    for (const number of numbers) {
        const index = normalized.indexOf(number);
        if (index < 0)
            continue;
        const start = Math.max(0, index - 400);
        const end = normalized.indexOf(numbers[numbers.indexOf(number) + 1] ?? '___', index + number.length);
        sections.push(normalized.slice(start, end > start ? end : undefined).trim());
    }
    return sections.length >= 2 ? sections : [text];
}
function resolveOneAttachmentWithoutAi(attachment, context, sourceSequenceStart) {
    const documentType = guessDocumentTypeFromText(attachment.text, {
        subject: context.subject,
        filename: attachment.filename,
    });
    if (pdfLikelyContainsMultipleInvoices(attachment.text)) {
        const sections = splitPdfTextIntoSections(attachment.text);
        if (sections.length >= 2) {
            return sections.map((section, index) => {
                const basic = (0, invoicePdfText_1.extractBasicInvoiceFieldsFromPdfText)(section, {
                    subject: context.subject,
                    from: context.from,
                    bodyText: context.bodyText,
                });
                const extraction = (0, incomingInvoiceAiService_1.reconcileInvoiceExtraction)({ ...basic, documentType }, section, context);
                return {
                    sourceSequence: sourceSequenceStart + index,
                    attachmentIndex: attachment.attachmentIndex,
                    documentType: guessDocumentTypeFromText(section, {
                        subject: context.subject,
                        filename: attachment.filename,
                    }),
                    extraction,
                    pdfText: section,
                };
            });
        }
    }
    const basic = (0, invoicePdfText_1.extractBasicInvoiceFieldsFromPdfText)(attachment.text, {
        subject: context.subject,
        from: context.from,
        bodyText: context.bodyText,
    });
    const extraction = (0, incomingInvoiceAiService_1.reconcileInvoiceExtraction)({ ...basic, documentType }, attachment.text, context);
    return [{
            sourceSequence: sourceSequenceStart,
            attachmentIndex: attachment.attachmentIndex,
            documentType,
            extraction,
            pdfText: attachment.text,
        }];
}
/** Build one or more finance documents from email attachments (bulk PDFs + multi-invoice PDFs). */
async function resolveIncomingDocumentsFromAttachments(input) {
    const meaningful = input.attachments.filter((attachment) => attachment.text.trim().length > 20);
    const unreadable = input.attachments.filter((attachment) => attachment.text.trim().length <= 20);
    if (!meaningful.length) {
        if (!unreadable.length)
            return [];
        return unreadable.map((attachment, index) => ({
            sourceSequence: index,
            attachmentIndex: attachment.attachmentIndex,
            documentType: guessDocumentTypeFromText('', {
                subject: input.subject,
                filename: attachment.filename,
            }),
            extraction: buildFallbackExtractionFromEmail(input, attachment),
            pdfText: '',
        }));
    }
    const context = {
        subject: input.subject,
        from: input.from,
        bodyText: input.bodyText,
    };
    const documents = [];
    let sequence = 0;
    if (process.env.ANTHROPIC_API_KEY) {
        for (const attachment of meaningful) {
            try {
                if (meaningful.length === 1 && pdfLikelyContainsMultipleInvoices(attachment.text)) {
                    const multi = await (0, incomingInvoiceAiService_1.extractMultipleInvoiceDocuments)({
                        ...context,
                        attachmentName: attachment.filename,
                        ocrText: attachment.text,
                    });
                    for (const doc of multi) {
                        documents.push({
                            sourceSequence: sequence,
                            attachmentIndex: attachment.attachmentIndex,
                            documentType: doc.documentType ?? guessDocumentTypeFromText(attachment.text, {
                                subject: context.subject,
                                filename: attachment.filename,
                            }),
                            extraction: doc,
                            pdfText: attachment.text,
                        });
                        sequence += 1;
                    }
                    continue;
                }
                const extracted = await (0, incomingInvoiceAiService_1.extractSingleAttachmentDocument)({
                    ...context,
                    attachmentName: attachment.filename,
                    ocrText: attachment.text,
                });
                documents.push({
                    sourceSequence: sequence,
                    attachmentIndex: attachment.attachmentIndex,
                    documentType: extracted.documentType ?? guessDocumentTypeFromText(attachment.text, {
                        subject: context.subject,
                        filename: attachment.filename,
                    }),
                    extraction: extracted,
                    pdfText: attachment.text,
                });
                sequence += 1;
            }
            catch (error) {
                console.warn('[incoming-invoice] per-attachment AI extraction failed, using fallback', attachment.filename, error);
                const fallback = resolveOneAttachmentWithoutAi(attachment, context, sequence);
                documents.push(...fallback);
                sequence += fallback.length;
            }
        }
        return documents;
    }
    for (const attachment of meaningful) {
        const resolved = resolveOneAttachmentWithoutAi(attachment, context, sequence);
        documents.push(...resolved);
        sequence += resolved.length;
    }
    return documents;
}
function documentsAreDistinct(documents) {
    const keys = documents.map((doc) => {
        const vendor = doc.extraction.vendor?.name?.toLowerCase().trim() ?? '';
        const number = doc.extraction.invoiceNumber?.toLowerCase().trim()
            ?? (0, invoicePdfText_1.guessInvoiceNumberFromPdfText)(doc.pdfText)?.toLowerCase()
            ?? '';
        const total = doc.extraction.totalAmount != null ? String(doc.extraction.totalAmount) : '';
        return `${vendor}|${number}|${total}`;
    });
    return new Set(keys).size === documents.length;
}
