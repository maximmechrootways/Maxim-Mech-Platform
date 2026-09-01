"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryOutgoingInvoices = summaryOutgoingInvoices;
exports.listOutgoingInvoices = listOutgoingInvoices;
exports.getOutgoingInvoiceDetail = getOutgoingInvoiceDetail;
exports.getOutgoingInvoiceAttachmentDownloadUrl = getOutgoingInvoiceAttachmentDownloadUrl;
exports.getOutgoingInvoiceAttachmentBuffer = getOutgoingInvoiceAttachmentBuffer;
exports.deleteOutgoingInvoice = deleteOutgoingInvoice;
exports.updateOutgoingInvoice = updateOutgoingInvoice;
exports.rescanOutgoingInvoiceFromPdf = rescanOutgoingInvoiceFromPdf;
const library_1 = require("@prisma/client/runtime/library");
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const invoiceComposioGmailService_1 = require("../integrations/composio-invoice/invoiceComposioGmailService");
const invoicePdfText_1 = require("../lib/invoicePdfText");
const outgoingInvoiceAiService_1 = require("./outgoingInvoiceAiService");
const outgoingInvoiceExtractionService_1 = require("./outgoingInvoiceExtractionService");
function decimalToString(value) {
    if (value == null)
        return null;
    return String(value);
}
function startOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}
async function summaryOutgoingInvoices() {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [total, sentThisMonth, paidThisMonth, failedJobs, openRows, overdueRows] = await Promise.all([
        prisma_1.prisma.outgoingInvoice.count(),
        prisma_1.prisma.outgoingInvoice.count({ where: { sentAt: { gte: monthStart } } }),
        prisma_1.prisma.outgoingInvoice.count({ where: { paidAt: { gte: monthStart } } }),
        prisma_1.prisma.outgoingInvoiceIngestionJob.count({ where: { status: 'FAILED' } }),
        prisma_1.prisma.outgoingInvoice.findMany({
            where: { status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] } },
            select: { totalAmount: true, paidAmount: true },
        }),
        prisma_1.prisma.outgoingInvoice.findMany({
            where: {
                status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] },
                dueDate: { lt: todayStart },
            },
            select: { totalAmount: true, paidAmount: true },
        }),
    ]);
    const outstandingTotal = openRows.reduce((sum, row) => {
        const totalAmt = row.totalAmount != null ? Number(row.totalAmount) : 0;
        const paidAmt = row.paidAmount != null ? Number(row.paidAmount) : 0;
        return sum + Math.max(0, totalAmt - paidAmt);
    }, 0);
    const overdueAmount = overdueRows.reduce((sum, row) => {
        const totalAmt = row.totalAmount != null ? Number(row.totalAmount) : 0;
        const paidAmt = row.paidAmount != null ? Number(row.paidAmount) : 0;
        return sum + Math.max(0, totalAmt - paidAmt);
    }, 0);
    return {
        total,
        sentThisMonth,
        paidThisMonth,
        failedJobs,
        outstandingTotal: Number(outstandingTotal.toFixed(2)),
        overdueCount: overdueRows.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
    };
}
async function listOutgoingInvoices(params) {
    const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const where = {};
    if (params.status)
        where.status = params.status;
    if (params.customer)
        where.customerName = { contains: params.customer, mode: 'insensitive' };
    if (params.q) {
        where.OR = [
            { searchText: { contains: params.q, mode: 'insensitive' } },
            { customerName: { contains: params.q, mode: 'insensitive' } },
            { invoiceNumber: { contains: params.q, mode: 'insensitive' } },
            { orderNumber: { contains: params.q, mode: 'insensitive' } },
            { supplierNumber: { contains: params.q, mode: 'insensitive' } },
            { projectName: { contains: params.q, mode: 'insensitive' } },
            { emailSubject: { contains: params.q, mode: 'insensitive' } },
            { notes: { contains: params.q, mode: 'insensitive' } },
        ];
    }
    if (params.dateFrom || params.dateTo) {
        where.sentAt = {
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
    let orderBy = { sentAt: 'desc' };
    if (params.sort === 'customer')
        orderBy = { customerName: 'asc' };
    else if (params.sort === 'total')
        orderBy = { totalAmount: 'desc' };
    else if (params.sort === 'dueDate')
        orderBy = { dueDate: 'asc' };
    else if (params.sort === 'invoiceDate')
        orderBy = { invoiceDate: 'desc' };
    else if (params.sort === 'created')
        orderBy = { createdAt: 'desc' };
    const [rows, total] = await Promise.all([
        prisma_1.prisma.outgoingInvoice.findMany({
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
        prisma_1.prisma.outgoingInvoice.count({ where }),
    ]);
    const mapped = rows.map((row) => ({
        id: row.id,
        emailSubject: row.emailSubject,
        emailTo: row.emailTo,
        sentAt: row.sentAt?.toISOString() ?? null,
        customerName: row.customerName,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate?.toISOString() ?? null,
        dueDate: row.dueDate?.toISOString() ?? null,
        totalAmount: decimalToString(row.totalAmount),
        paidAmount: decimalToString(row.paidAmount),
        currency: row.currency,
        orderNumber: row.orderNumber,
        supplierNumber: row.supplierNumber,
        projectName: row.projectName,
        jobId: row.jobId,
        jobTitle: row.job?.title ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        paymentTerms: row.paymentTerms,
        notes: row.notes,
        status: row.status,
        attachmentCount: row._count.attachments,
        attachments: row.attachments.map((a) => ({ id: a.id, originalName: a.originalName })),
    }));
    return { rows: mapped, total };
}
async function getOutgoingInvoiceDetail(id) {
    const invoice = await prisma_1.prisma.outgoingInvoice.findUnique({
        where: { id },
        include: {
            attachments: { orderBy: { attachmentIndex: 'asc' } },
            job: { select: { id: true, title: true } },
        },
    });
    if (!invoice) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 });
    }
    return {
        id: invoice.id,
        gmailMessageId: invoice.gmailMessageId,
        sourceSequence: invoice.sourceSequence,
        emailSubject: invoice.emailSubject,
        emailBodyText: invoice.emailBodyText,
        emailBodyHtml: invoice.emailBodyHtml,
        emailFrom: invoice.emailFrom,
        emailTo: invoice.emailTo,
        sentAt: invoice.sentAt?.toISOString() ?? null,
        status: invoice.status,
        customerName: invoice.customerName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate?.toISOString() ?? null,
        dueDate: invoice.dueDate?.toISOString() ?? null,
        subtotal: decimalToString(invoice.subtotal),
        taxAmount: decimalToString(invoice.taxAmount),
        totalAmount: decimalToString(invoice.totalAmount),
        paidAmount: decimalToString(invoice.paidAmount),
        currency: invoice.currency,
        orderNumber: invoice.orderNumber,
        supplierNumber: invoice.supplierNumber,
        projectName: invoice.projectName,
        jobId: invoice.jobId,
        jobTitle: invoice.job?.title ?? null,
        paidAt: invoice.paidAt?.toISOString() ?? null,
        paymentTerms: invoice.paymentTerms,
        notes: invoice.notes,
        extractedData: invoice.extractedData,
        processedAt: invoice.processedAt?.toISOString() ?? null,
        lastReminderAt: invoice.lastReminderAt?.toISOString() ?? null,
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
async function getOutgoingInvoiceAttachmentRecord(invoiceId, attachmentId) {
    const attachment = await prisma_1.prisma.outgoingInvoiceAttachment.findFirst({
        where: { id: attachmentId, invoiceId },
    });
    if (!attachment) {
        throw Object.assign(new Error('Attachment not found'), { status: 404 });
    }
    return attachment;
}
async function getOutgoingInvoiceAttachmentDownloadUrl(invoiceId, attachmentId) {
    const attachment = await getOutgoingInvoiceAttachmentRecord(invoiceId, attachmentId);
    const url = await (0, blobStorageService_1.getBlobSasUrl)(attachment.filePath, 30);
    return { url, originalName: attachment.originalName };
}
async function getOutgoingInvoiceAttachmentBuffer(invoiceId, attachmentId) {
    const attachment = await getOutgoingInvoiceAttachmentRecord(invoiceId, attachmentId);
    let buffer;
    try {
        buffer = await (0, blobStorageService_1.getBlobBuffer)(attachment.filePath);
    }
    catch {
        throw Object.assign(new Error('Attachment file not found in storage'), { status: 404 });
    }
    if (!isValidPdfBuffer(buffer)) {
        const invoice = await prisma_1.prisma.outgoingInvoice.findUnique({
            where: { id: invoiceId },
            select: { gmailMessageId: true },
        });
        if (invoice?.gmailMessageId && !invoice.gmailMessageId.startsWith('manual:') && attachment.gmailAttachmentId) {
            const repaired = await (0, invoiceComposioGmailService_1.downloadGmailAttachment)(invoice.gmailMessageId, attachment.gmailAttachmentId, attachment.originalName).catch(() => null);
            if (repaired && isValidPdfBuffer(repaired))
                buffer = repaired;
        }
    }
    if (!isValidPdfBuffer(buffer)) {
        throw Object.assign(new Error('Attachment is missing or corrupted'), { status: 404 });
    }
    return {
        buffer,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType || 'application/pdf',
    };
}
async function deleteOutgoingInvoice(id) {
    const invoice = await prisma_1.prisma.outgoingInvoice.findUnique({
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
    await prisma_1.prisma.outgoingInvoice.delete({ where: { id } });
    if (invoice.gmailMessageId) {
        const siblings = await prisma_1.prisma.outgoingInvoice.count({
            where: { gmailMessageId: invoice.gmailMessageId },
        });
        if (siblings === 0) {
            await prisma_1.prisma.outgoingInvoiceIngestionJob.deleteMany({
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
async function updateOutgoingInvoice(id, input) {
    const existing = await prisma_1.prisma.outgoingInvoice.findUnique({ where: { id } });
    if (!existing) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 });
    }
    if (input.jobId) {
        const job = await prisma_1.prisma.job.findUnique({ where: { id: input.jobId }, select: { id: true } });
        if (!job) {
            throw Object.assign(new Error('Job not found'), { status: 400 });
        }
    }
    const customerName = input.customerName !== undefined
        ? (input.customerName?.trim() || null)
        : existing.customerName;
    let paidAt;
    let paidAmount;
    if (input.paid === true) {
        paidAt = new Date();
        const total = input.totalAmount != null
            ? input.totalAmount
            : existing.totalAmount != null
                ? Number(existing.totalAmount)
                : null;
        paidAmount = optionalDecimal(input.paidAmount != null ? input.paidAmount : total);
    }
    else if (input.paid === false) {
        paidAt = null;
        paidAmount = null;
    }
    else if (input.paidAmount !== undefined) {
        paidAmount = optionalDecimal(input.paidAmount ?? undefined);
    }
    const totalAmount = input.totalAmount !== undefined
        ? optionalDecimal(input.totalAmount ?? undefined)
        : existing.totalAmount;
    const resolvedPaidAmount = paidAmount !== undefined ? paidAmount : existing.paidAmount;
    const resolvedPaidAt = paidAt !== undefined ? paidAt : existing.paidAt;
    const resolvedDueDate = input.dueDate !== undefined
        ? (0, outgoingInvoiceExtractionService_1.parseOutgoingDateString)(input.dueDate || undefined)
        : existing.dueDate;
    const status = (0, outgoingInvoiceExtractionService_1.deriveOutgoingInvoiceStatus)({
        paidAt: resolvedPaidAt,
        paidAmount: resolvedPaidAmount != null ? Number(resolvedPaidAmount) : null,
        totalAmount: totalAmount != null ? Number(totalAmount) : null,
        dueDate: resolvedDueDate,
    });
    await prisma_1.prisma.outgoingInvoice.update({
        where: { id },
        data: {
            customerName,
            invoiceNumber: input.invoiceNumber !== undefined ? (input.invoiceNumber?.trim() || null) : undefined,
            invoiceDate: input.invoiceDate !== undefined ? (0, outgoingInvoiceExtractionService_1.parseOutgoingDateString)(input.invoiceDate || undefined) : undefined,
            dueDate: input.dueDate !== undefined ? (0, outgoingInvoiceExtractionService_1.parseOutgoingDateString)(input.dueDate || undefined) : undefined,
            subtotal: input.subtotal !== undefined ? optionalDecimal(input.subtotal ?? undefined) : undefined,
            taxAmount: input.taxAmount !== undefined ? optionalDecimal(input.taxAmount ?? undefined) : undefined,
            totalAmount: input.totalAmount !== undefined ? optionalDecimal(input.totalAmount ?? undefined) : undefined,
            paidAmount: paidAmount !== undefined ? paidAmount : undefined,
            currency: input.currency !== undefined ? (input.currency?.trim() || null) : undefined,
            orderNumber: input.orderNumber !== undefined ? (input.orderNumber?.trim() || null) : undefined,
            supplierNumber: input.supplierNumber !== undefined ? (input.supplierNumber?.trim() || null) : undefined,
            projectName: input.projectName !== undefined ? (input.projectName?.trim() || null) : undefined,
            jobId: input.jobId !== undefined ? (input.jobId || null) : undefined,
            paidAt: paidAt !== undefined ? paidAt : undefined,
            paymentTerms: input.paymentTerms !== undefined ? (input.paymentTerms?.trim() || null) : undefined,
            notes: input.notes !== undefined ? (input.notes?.trim() || null) : undefined,
            status,
            searchText: (0, outgoingInvoiceAiService_1.buildOutgoingInvoiceSearchText)([
                existing.emailSubject,
                customerName,
                input.invoiceNumber !== undefined ? input.invoiceNumber : existing.invoiceNumber,
                input.orderNumber !== undefined ? input.orderNumber : existing.orderNumber,
                input.supplierNumber !== undefined ? input.supplierNumber : existing.supplierNumber,
                input.projectName !== undefined ? input.projectName : existing.projectName,
                input.notes !== undefined ? input.notes : existing.notes,
            ]),
        },
    });
    return getOutgoingInvoiceDetail(id);
}
async function rescanOutgoingInvoiceFromPdf(id) {
    const invoice = await prisma_1.prisma.outgoingInvoice.findUnique({
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
        const { buffer } = await getOutgoingInvoiceAttachmentBuffer(id, attachment.id);
        let text = '';
        try {
            text = await (0, invoicePdfText_1.extractInvoiceAttachmentText)(buffer, {
                mimeType: attachment.mimeType || undefined,
                filename: attachment.originalName,
            });
        }
        catch (error) {
            console.warn('[outgoing-invoice] attachment text extraction failed during rescan', attachment.originalName, error);
        }
        ocrTexts.push({ filename: attachment.originalName, text });
        await prisma_1.prisma.outgoingInvoiceAttachment.update({
            where: { id: attachment.id },
            data: { ocrText: text || null },
        });
    }
    const combinedText = ocrTexts.map((entry) => entry.text).join('\n');
    if (!combinedText || combinedText.length < 20) {
        throw Object.assign(new Error('Could not read text from the PDF. Configure Azure Document Intelligence on the server.'), { status: 400 });
    }
    const template = (0, outgoingInvoiceExtractionService_1.parseMaximOutgoingInvoiceTemplate)(combinedText);
    const extracted = (0, outgoingInvoiceExtractionService_1.mergeMaximTemplateExtraction)(template && (template.confidence ?? 0) >= 0.8
        ? template
        : await (0, outgoingInvoiceAiService_1.extractOutgoingInvoiceFields)({
            subject: invoice.emailSubject || '',
            bodyText: invoice.emailBodyText || '',
            to: invoice.emailTo || '',
            pdfText: combinedText,
        }), combinedText);
    const customerName = extracted.customerName
        || invoice.customerName
        || (0, outgoingInvoiceExtractionService_1.guessCustomerFromEmailTo)(invoice.emailTo || undefined);
    const invoiceDate = (0, outgoingInvoiceExtractionService_1.parseOutgoingDateString)(extracted.invoiceDate) ?? invoice.invoiceDate;
    const dueDate = (0, outgoingInvoiceExtractionService_1.parseOutgoingDateString)(extracted.dueDate) ?? invoice.dueDate;
    const totalAmount = extracted.totalAmount != null ? new library_1.Decimal(extracted.totalAmount) : invoice.totalAmount;
    const status = (0, outgoingInvoiceExtractionService_1.deriveOutgoingInvoiceStatus)({
        paidAt: invoice.paidAt,
        paidAmount: invoice.paidAmount != null ? Number(invoice.paidAmount) : null,
        totalAmount: totalAmount != null ? Number(totalAmount) : null,
        dueDate,
    });
    await prisma_1.prisma.outgoingInvoice.update({
        where: { id },
        data: {
            status,
            customerName,
            invoiceNumber: extracted.invoiceNumber || invoice.invoiceNumber,
            invoiceDate,
            dueDate,
            subtotal: extracted.subtotal != null ? new library_1.Decimal(extracted.subtotal) : invoice.subtotal,
            taxAmount: extracted.taxAmount != null ? new library_1.Decimal(extracted.taxAmount) : invoice.taxAmount,
            totalAmount,
            currency: extracted.currency || invoice.currency,
            orderNumber: extracted.orderNumber || invoice.orderNumber,
            supplierNumber: extracted.supplierNumber || invoice.supplierNumber,
            projectName: extracted.projectName || invoice.projectName,
            paymentTerms: extracted.paymentTerms || invoice.paymentTerms,
            extractedData: extracted,
            searchText: (0, outgoingInvoiceAiService_1.buildOutgoingInvoiceSearchText)([
                invoice.emailSubject,
                invoice.emailTo,
                customerName,
                extracted.invoiceNumber,
                extracted.orderNumber,
                extracted.supplierNumber,
                extracted.projectName,
                combinedText,
            ]),
        },
    });
    return getOutgoingInvoiceDetail(id);
}
