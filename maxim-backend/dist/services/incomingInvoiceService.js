"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryIncomingInvoices = summaryIncomingInvoices;
exports.listIncomingInvoices = listIncomingInvoices;
exports.getIncomingInvoiceDetail = getIncomingInvoiceDetail;
exports.getIncomingInvoiceAttachmentDownloadUrl = getIncomingInvoiceAttachmentDownloadUrl;
exports.getIncomingInvoiceAttachmentBuffer = getIncomingInvoiceAttachmentBuffer;
exports.createManualIncomingInvoice = createManualIncomingInvoice;
exports.deleteIncomingInvoice = deleteIncomingInvoice;
exports.updateIncomingInvoice = updateIncomingInvoice;
exports.rescanIncomingInvoiceFromPdf = rescanIncomingInvoiceFromPdf;
const crypto_1 = require("crypto");
const library_1 = require("@prisma/client/runtime/library");
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const invoiceComposioGmailService_1 = require("../integrations/composio-invoice/invoiceComposioGmailService");
const invoicePdfText_1 = require("../lib/invoicePdfText");
const incomingInvoiceDocumentResolver_1 = require("./incomingInvoiceDocumentResolver");
const incomingInvoiceReceiptLink_1 = require("./incomingInvoiceReceiptLink");
const incomingInvoiceAiService_1 = require("./incomingInvoiceAiService");
function decimalToString(value) {
    if (value == null)
        return null;
    return String(value);
}
async function summaryIncomingInvoices() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [total, thisMonth, failedJobs] = await Promise.all([
        prisma_1.prisma.incomingInvoice.count(),
        prisma_1.prisma.incomingInvoice.count({ where: { createdAt: { gte: monthStart } } }),
        prisma_1.prisma.incomingInvoiceIngestionJob.count({ where: { status: 'FAILED' } }),
    ]);
    return { total, thisMonth, failedJobs };
}
async function listIncomingInvoices(params) {
    const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const where = {};
    if (params.status)
        where.status = params.status;
    if (params.documentType)
        where.documentType = params.documentType;
    if (params.vendor)
        where.vendorName = { contains: params.vendor, mode: 'insensitive' };
    if (params.q) {
        where.OR = [
            { searchText: { contains: params.q, mode: 'insensitive' } },
            { vendorName: { contains: params.q, mode: 'insensitive' } },
            { invoiceNumber: { contains: params.q, mode: 'insensitive' } },
            { poNumber: { contains: params.q, mode: 'insensitive' } },
            { jobReference: { contains: params.q, mode: 'insensitive' } },
            { emailSubject: { contains: params.q, mode: 'insensitive' } },
            { notes: { contains: params.q, mode: 'insensitive' } },
        ];
    }
    if (params.dateFrom || params.dateTo) {
        where.receivedAt = {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
        };
    }
    if (params.minTotal != null || params.maxTotal != null) {
        where.totalAmount = {
            ...(params.minTotal != null ? { gte: params.minTotal } : {}),
            ...(params.maxTotal != null ? { lte: params.maxTotal } : {}),
        };
    }
    let orderBy = { receivedAt: 'desc' };
    if (params.sort === 'vendor')
        orderBy = { vendorName: 'asc' };
    else if (params.sort === 'total')
        orderBy = { totalAmount: 'desc' };
    else if (params.sort === 'invoiceDate')
        orderBy = { invoiceDate: 'desc' };
    else if (params.sort === 'created')
        orderBy = { createdAt: 'desc' };
    const [rows, total] = await Promise.all([
        prisma_1.prisma.incomingInvoice.findMany({
            where,
            orderBy,
            skip: offset,
            take: limit,
            include: {
                _count: { select: { attachments: true } },
                job: { select: { id: true, title: true } },
                attachments: {
                    orderBy: { attachmentIndex: 'asc' },
                    select: { id: true, originalName: true },
                },
            },
        }),
        prisma_1.prisma.incomingInvoice.count({ where }),
    ]);
    const mapped = rows.map((row) => ({
        id: row.id,
        documentType: row.documentType,
        emailSubject: row.emailSubject,
        emailFrom: row.emailFrom,
        receivedAt: row.receivedAt?.toISOString() ?? null,
        vendorName: row.vendorName,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate?.toISOString() ?? null,
        dueDate: row.dueDate?.toISOString() ?? null,
        totalAmount: decimalToString(row.totalAmount),
        currency: row.currency,
        poNumber: row.poNumber,
        jobReference: row.jobReference,
        jobId: row.jobId,
        jobTitle: row.job?.title ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        relatedInvoiceId: row.relatedInvoiceId,
        notes: row.notes,
        status: row.status,
        attachmentCount: row._count.attachments,
        attachments: row.attachments.map((a) => ({ id: a.id, originalName: a.originalName })),
    }));
    return { rows: mapped, total };
}
async function getIncomingInvoiceDetail(id) {
    const invoice = await prisma_1.prisma.incomingInvoice.findUnique({
        where: { id },
        include: {
            attachments: { orderBy: { attachmentIndex: 'asc' } },
        },
    });
    if (!invoice) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 });
    }
    return {
        id: invoice.id,
        gmailMessageId: invoice.gmailMessageId,
        documentType: invoice.documentType,
        sourceSequence: invoice.sourceSequence,
        relatedInvoiceId: invoice.relatedInvoiceId,
        emailSubject: invoice.emailSubject,
        emailBodyText: invoice.emailBodyText,
        emailBodyHtml: invoice.emailBodyHtml,
        emailFrom: invoice.emailFrom,
        emailTo: invoice.emailTo,
        receivedAt: invoice.receivedAt?.toISOString() ?? null,
        status: invoice.status,
        vendorName: invoice.vendorName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate?.toISOString() ?? null,
        dueDate: invoice.dueDate?.toISOString() ?? null,
        subtotal: decimalToString(invoice.subtotal),
        taxAmount: decimalToString(invoice.taxAmount),
        totalAmount: decimalToString(invoice.totalAmount),
        currency: invoice.currency,
        poNumber: invoice.poNumber,
        jobReference: invoice.jobReference,
        jobId: invoice.jobId,
        paidAt: invoice.paidAt?.toISOString() ?? null,
        paymentTerms: invoice.paymentTerms,
        notes: invoice.notes,
        extractedData: invoice.extractedData,
        processedAt: invoice.processedAt?.toISOString() ?? null,
        attachments: invoice.attachments.map((attachment) => ({
            id: attachment.id,
            attachmentIndex: attachment.attachmentIndex,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            ocrText: attachment.ocrText,
        })),
    };
}
function isValidPdfBuffer(buffer) {
    return buffer.length > 100 && buffer.subarray(0, 5).toString('utf8') === '%PDF-';
}
function isValidImageBuffer(buffer) {
    if (buffer.length < 24)
        return false;
    const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
    const jpg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const webp = buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    return png || jpg || webp;
}
function isValidInvoiceAttachmentBuffer(buffer) {
    return isValidPdfBuffer(buffer) || isValidImageBuffer(buffer);
}
async function getIncomingInvoiceAttachmentRecord(invoiceId, attachmentId) {
    const attachment = await prisma_1.prisma.incomingInvoiceAttachment.findFirst({
        where: { id: attachmentId, invoiceId },
    });
    if (!attachment) {
        throw Object.assign(new Error('Attachment not found'), { status: 404 });
    }
    return attachment;
}
async function repairCorruptAttachmentBuffer(attachment, buffer) {
    if (isValidInvoiceAttachmentBuffer(buffer))
        return buffer;
    const invoice = await prisma_1.prisma.incomingInvoice.findUnique({
        where: { id: attachment.invoiceId },
        select: { gmailMessageId: true },
    });
    if (!invoice?.gmailMessageId || invoice.gmailMessageId.startsWith('manual:')) {
        return buffer;
    }
    let gmailAttachmentId = attachment.gmailAttachmentId;
    if (!gmailAttachmentId) {
        const message = await (0, invoiceComposioGmailService_1.fetchGmailMessageById)(invoice.gmailMessageId).catch(() => null);
        const match = message?.attachments[attachment.attachmentIndex]
            ?? message?.attachments.find((a) => a.filename === attachment.originalName);
        gmailAttachmentId = match?.attachmentId ?? null;
    }
    if (!gmailAttachmentId)
        return buffer;
    const repaired = await (0, invoiceComposioGmailService_1.downloadGmailAttachment)(invoice.gmailMessageId, gmailAttachmentId, attachment.originalName);
    if (!isValidInvoiceAttachmentBuffer(repaired))
        return buffer;
    await (0, blobStorageService_1.uploadBufferToBlob)(attachment.filePath, repaired, attachment.mimeType || 'application/octet-stream');
    await prisma_1.prisma.incomingInvoiceAttachment.update({
        where: { id: attachment.id },
        data: { sizeBytes: repaired.length, gmailAttachmentId },
    });
    return repaired;
}
async function getIncomingInvoiceAttachmentDownloadUrl(invoiceId, attachmentId) {
    const attachment = await getIncomingInvoiceAttachmentRecord(invoiceId, attachmentId);
    const url = await (0, blobStorageService_1.getBlobSasUrl)(attachment.filePath, 30);
    return { url, originalName: attachment.originalName };
}
async function getIncomingInvoiceAttachmentBuffer(invoiceId, attachmentId) {
    const attachment = await getIncomingInvoiceAttachmentRecord(invoiceId, attachmentId);
    let buffer;
    try {
        buffer = await (0, blobStorageService_1.getBlobBuffer)(attachment.filePath);
    }
    catch {
        throw Object.assign(new Error('Attachment file not found in storage'), { status: 404 });
    }
    buffer = await repairCorruptAttachmentBuffer(attachment, buffer);
    if (!isValidInvoiceAttachmentBuffer(buffer)) {
        throw Object.assign(new Error('Attachment is missing or corrupted'), { status: 404 });
    }
    const mimeType = attachment.mimeType
        || (isValidImageBuffer(buffer) ? 'image/png' : 'application/pdf');
    return {
        buffer,
        originalName: attachment.originalName,
        mimeType,
    };
}
async function createManualIncomingInvoice(input) {
    const vendorName = input.vendorName.trim();
    if (!vendorName) {
        throw Object.assign(new Error('Vendor name is required'), { status: 400 });
    }
    const gmailMessageId = `manual:${(0, crypto_1.randomUUID)()}`;
    const invoice = await prisma_1.prisma.incomingInvoice.create({
        data: {
            gmailMessageId,
            emailSubject: input.emailSubject?.trim() || `Manual invoice — ${vendorName}`,
            emailBodyText: input.emailBodyText?.trim() || null,
            emailFrom: null,
            emailTo: 'accounting@maximmech.com',
            receivedAt: new Date(),
            status: 'READY',
            processedAt: new Date(),
            vendorName,
            invoiceNumber: input.invoiceNumber?.trim() || null,
            invoiceDate: (0, incomingInvoiceAiService_1.parseIsoDate)(input.invoiceDate),
            dueDate: (0, incomingInvoiceAiService_1.parseIsoDate)(input.dueDate),
            subtotal: null,
            taxAmount: null,
            totalAmount: input.totalAmount != null ? new library_1.Decimal(input.totalAmount) : null,
            currency: input.currency?.trim() || 'CAD',
            poNumber: input.poNumber?.trim() || null,
            jobReference: input.jobReference?.trim() || null,
            paymentTerms: input.paymentTerms?.trim() || null,
            extractedData: { source: 'manual' },
            searchText: (0, incomingInvoiceAiService_1.buildInvoiceSearchText)([
                vendorName,
                input.invoiceNumber,
                input.poNumber,
                input.jobReference,
                input.emailSubject,
                input.emailBodyText,
            ]),
        },
    });
    if (input.pdfBuffer && input.pdfBuffer.length > 0) {
        const safeName = (input.pdfOriginalName || 'invoice.pdf').replace(/[^\w.-]+/g, '_');
        const blobName = `invoices/${Date.now()}-${(0, crypto_1.randomUUID)().slice(0, 8)}-${safeName}`;
        await (0, blobStorageService_1.uploadBufferToBlob)(blobName, input.pdfBuffer, input.pdfMimeType || 'application/pdf');
        await prisma_1.prisma.incomingInvoiceAttachment.create({
            data: {
                invoiceId: invoice.id,
                attachmentIndex: 0,
                filePath: blobName,
                originalName: input.pdfOriginalName || 'invoice.pdf',
                mimeType: input.pdfMimeType || 'application/pdf',
                sizeBytes: input.pdfBuffer.length,
            },
        });
    }
    return getIncomingInvoiceDetail(invoice.id);
}
async function deleteIncomingInvoice(id) {
    const invoice = await prisma_1.prisma.incomingInvoice.findUnique({
        where: { id },
        include: { attachments: true },
    });
    if (!invoice) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 });
    }
    for (const attachment of invoice.attachments) {
        if (attachment.filePath) {
            await (0, blobStorageService_1.deleteBlob)(attachment.filePath).catch(() => undefined);
        }
    }
    await prisma_1.prisma.incomingInvoice.delete({ where: { id } });
    if (invoice.gmailMessageId) {
        const siblings = await prisma_1.prisma.incomingInvoice.count({
            where: { gmailMessageId: invoice.gmailMessageId },
        });
        if (siblings === 0) {
            await prisma_1.prisma.incomingInvoiceIngestionJob.deleteMany({
                where: { gmailMessageId: invoice.gmailMessageId },
            }).catch(() => undefined);
        }
    }
    return { deleted: true };
}
function optionalDecimal(value) {
    if (value == null || !Number.isFinite(value))
        return null;
    return new library_1.Decimal(value);
}
function buildSearchTextFromInvoice(input) {
    return (0, incomingInvoiceAiService_1.buildInvoiceSearchText)([
        input.emailSubject,
        input.emailBodyText,
        input.vendorName,
        input.invoiceNumber,
        input.poNumber,
        input.jobReference,
        input.notes,
        ...(input.ocrTexts ?? []),
    ]);
}
async function resolveInvoiceExtractionFromPdf(input) {
    const combinedText = input.ocrTexts.map((entry) => entry.text).join('\n');
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            return await (0, incomingInvoiceAiService_1.extractInvoiceFields)(input);
        }
        catch (error) {
            console.warn('[incoming-invoice] AI extraction failed, using PDF text fallback', error);
        }
    }
    const basic = (0, invoicePdfText_1.extractBasicInvoiceFieldsFromPdfText)(combinedText, {
        subject: input.subject,
        from: input.from,
        bodyText: input.bodyText,
    });
    return (0, incomingInvoiceAiService_1.reconcileInvoiceExtraction)(basic, combinedText, {
        subject: input.subject,
        from: input.from,
        bodyText: input.bodyText,
    });
}
function extractionToInvoiceFields(extracted) {
    return {
        vendorName: extracted.vendor?.name?.trim() || null,
        invoiceNumber: (0, invoicePdfText_1.isValidInvoiceNumber)(extracted.invoiceNumber)
            ? extracted.invoiceNumber?.trim() || null
            : null,
        invoiceDate: (0, incomingInvoiceAiService_1.parseIsoDate)(extracted.invoiceDate),
        dueDate: (0, incomingInvoiceAiService_1.parseIsoDate)(extracted.dueDate),
        subtotal: optionalDecimal(extracted.subtotal),
        taxAmount: optionalDecimal(extracted.taxAmount),
        totalAmount: optionalDecimal(extracted.totalAmount),
        currency: extracted.currency?.trim() || null,
        poNumber: (0, invoicePdfText_1.isValidPoNumber)(extracted.poNumber) ? extracted.poNumber.trim() : null,
        jobReference: extracted.jobReference?.trim() || extracted.siteReference?.trim() || null,
        paymentTerms: extracted.paymentTerms?.trim() || null,
        aiNotes: extracted.notes?.trim() || null,
        extractedData: extracted,
    };
}
async function updateIncomingInvoice(id, input) {
    const existing = await prisma_1.prisma.incomingInvoice.findUnique({ where: { id } });
    if (!existing) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 });
    }
    const vendorName = input.vendorName !== undefined
        ? (input.vendorName?.trim() || null)
        : existing.vendorName;
    if (input.jobId) {
        const job = await prisma_1.prisma.job.findUnique({ where: { id: input.jobId }, select: { id: true } });
        if (!job) {
            throw Object.assign(new Error('Job not found'), { status: 400 });
        }
    }
    let paidAt;
    if (input.paid === true)
        paidAt = new Date();
    else if (input.paid === false)
        paidAt = null;
    await prisma_1.prisma.incomingInvoice.update({
        where: { id },
        data: {
            vendorName,
            invoiceNumber: input.invoiceNumber !== undefined ? (input.invoiceNumber?.trim() || null) : undefined,
            invoiceDate: input.invoiceDate !== undefined ? (0, incomingInvoiceAiService_1.parseIsoDate)(input.invoiceDate || undefined) : undefined,
            dueDate: input.dueDate !== undefined ? (0, incomingInvoiceAiService_1.parseIsoDate)(input.dueDate || undefined) : undefined,
            subtotal: input.subtotal !== undefined ? optionalDecimal(input.subtotal ?? undefined) : undefined,
            taxAmount: input.taxAmount !== undefined ? optionalDecimal(input.taxAmount ?? undefined) : undefined,
            totalAmount: input.totalAmount !== undefined ? optionalDecimal(input.totalAmount ?? undefined) : undefined,
            currency: input.currency !== undefined ? (input.currency?.trim() || null) : undefined,
            poNumber: input.poNumber !== undefined ? (input.poNumber?.trim() || null) : undefined,
            jobReference: input.jobReference !== undefined ? (input.jobReference?.trim() || null) : undefined,
            jobId: input.jobId !== undefined ? (input.jobId || null) : undefined,
            paidAt: paidAt !== undefined ? paidAt : undefined,
            paymentTerms: input.paymentTerms !== undefined ? (input.paymentTerms?.trim() || null) : undefined,
            notes: input.notes !== undefined ? (input.notes?.trim() || null) : undefined,
            searchText: buildSearchTextFromInvoice({
                emailSubject: existing.emailSubject,
                emailBodyText: existing.emailBodyText,
                vendorName,
                invoiceNumber: input.invoiceNumber !== undefined ? input.invoiceNumber : existing.invoiceNumber,
                poNumber: input.poNumber !== undefined ? input.poNumber : existing.poNumber,
                jobReference: input.jobReference !== undefined ? input.jobReference : existing.jobReference,
                notes: input.notes !== undefined ? input.notes : existing.notes,
            }),
        },
    });
    return getIncomingInvoiceDetail(id);
}
async function rescanIncomingInvoiceFromPdf(id) {
    const invoice = await prisma_1.prisma.incomingInvoice.findUnique({
        where: { id },
        include: { attachments: { orderBy: { attachmentIndex: 'asc' } } },
    });
    if (!invoice) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 });
    }
    if (!invoice.attachments.length) {
        throw Object.assign(new Error('No PDF attachments to scan'), { status: 400 });
    }
    const ocrTexts = [];
    for (const attachment of invoice.attachments) {
        const { buffer } = await getIncomingInvoiceAttachmentBuffer(id, attachment.id);
        let text = '';
        try {
            text = await (0, invoicePdfText_1.extractInvoiceAttachmentText)(buffer, {
                mimeType: attachment.mimeType || undefined,
                filename: attachment.originalName,
            });
        }
        catch (error) {
            console.warn('[incoming-invoice] attachment text extraction failed during rescan', attachment.originalName, error);
        }
        ocrTexts.push({ filename: attachment.originalName, text });
        await prisma_1.prisma.incomingInvoiceAttachment.update({
            where: { id: attachment.id },
            data: { ocrText: text || null },
        });
    }
    if (!ocrTexts.some((entry) => entry.text.length > 20)) {
        throw Object.assign(new Error('Could not read text from the PDF. The file may be scanned — configure Azure Document Intelligence on the server.'), { status: 400 });
    }
    const extracted = await resolveInvoiceExtractionFromPdf({
        subject: invoice.emailSubject || '',
        bodyText: invoice.emailBodyText || '',
        from: invoice.emailFrom || '',
        attachmentNames: invoice.attachments.map((a) => a.originalName),
        ocrTexts,
    });
    const fields = extractionToInvoiceFields(extracted);
    const preserveNotes = invoice.notes?.trim();
    const combinedText = ocrTexts.map((entry) => entry.text).join('\n');
    const documentType = extracted.documentType
        ?? invoice.documentType
        ?? (0, incomingInvoiceDocumentResolver_1.guessDocumentTypeFromText)(combinedText, {
            subject: invoice.emailSubject || '',
            filename: invoice.attachments[0]?.originalName,
        });
    const vendorName = fields.vendorName
        ?? invoice.vendorName
        ?? (0, incomingInvoiceDocumentResolver_1.guessVendorFromEmailMetadata)(invoice.emailFrom || '', invoice.emailBodyText || '');
    const guessedNumber = (0, incomingInvoiceDocumentResolver_1.guessInvoiceNumberFromEmailContext)(invoice.emailSubject || undefined);
    const invoiceNumber = fields.invoiceNumber
        ?? ((0, invoicePdfText_1.isValidInvoiceNumber)(invoice.invoiceNumber) ? invoice.invoiceNumber : null)
        ?? ((0, invoicePdfText_1.isValidInvoiceNumber)(guessedNumber) ? guessedNumber : null);
    const receiptLink = documentType === 'RECEIPT'
        ? await (0, incomingInvoiceReceiptLink_1.applyReceiptLinking)({
            documentType,
            vendorName,
            invoiceNumber,
            totalAmount: fields.totalAmount != null
                ? Number(fields.totalAmount)
                : invoice.totalAmount != null
                    ? Number(invoice.totalAmount)
                    : null,
        })
        : { relatedInvoiceId: null, markPaid: false };
    await prisma_1.prisma.incomingInvoice.update({
        where: { id },
        data: {
            documentType,
            relatedInvoiceId: receiptLink.relatedInvoiceId,
            paidAt: documentType === 'RECEIPT' ? new Date() : invoice.paidAt,
            vendorName,
            invoiceNumber,
            invoiceDate: fields.invoiceDate ?? invoice.invoiceDate,
            dueDate: fields.dueDate ?? invoice.dueDate,
            subtotal: fields.subtotal ?? invoice.subtotal,
            taxAmount: fields.taxAmount ?? invoice.taxAmount,
            totalAmount: fields.totalAmount ?? invoice.totalAmount,
            currency: fields.currency || invoice.currency,
            poNumber: fields.poNumber ?? invoice.poNumber,
            jobReference: fields.jobReference ?? invoice.jobReference,
            paymentTerms: fields.paymentTerms ?? invoice.paymentTerms,
            notes: preserveNotes || fields.aiNotes,
            extractedData: fields.extractedData,
            searchText: buildSearchTextFromInvoice({
                emailSubject: invoice.emailSubject,
                emailBodyText: invoice.emailBodyText,
                vendorName,
                invoiceNumber,
                poNumber: fields.poNumber ?? invoice.poNumber,
                jobReference: fields.jobReference ?? invoice.jobReference,
                notes: preserveNotes || fields.aiNotes,
                ocrTexts: ocrTexts.map((entry) => entry.text),
            }),
        },
    });
    return getIncomingInvoiceDetail(id);
}
