import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '../lib/prisma'
import { deleteBlob, getBlobBuffer, getBlobSasUrl } from './blobStorageService'
import { downloadGmailAttachment, fetchGmailMessageById } from '../integrations/composio-invoice/invoiceComposioGmailService'
import { extractInvoiceAttachmentText } from '../lib/invoicePdfText'
import { buildOutgoingInvoiceSearchText, extractOutgoingInvoiceFields } from './outgoingInvoiceAiService'
import {
    deriveOutgoingInvoiceStatus,
    guessCustomerFromEmailTo,
    mergeMaximTemplateExtraction,
    parseMaximOutgoingInvoiceTemplate,
    parseOutgoingDateString,
} from './outgoingInvoiceExtractionService'

function displayName(user: { firstName: string; lastName: string } | null | undefined): string | null {
    if (!user) return null
    const name = `${user.firstName} ${user.lastName}`.trim()
    return name || null
}

export type OutgoingInvoiceListRow = {
    id: string
    emailSubject: string | null
    emailTo: string | null
    sentAt: string | null
    customerName: string | null
    invoiceNumber: string | null
    invoiceDate: string | null
    dueDate: string | null
    totalAmount: string | null
    paidAmount: string | null
    currency: string | null
    orderNumber: string | null
    supplierNumber: string | null
    projectName: string | null
    jobId: string | null
    jobTitle: string | null
    paidAt: string | null
    reviewedAt: string | null
    reviewedById: string | null
    reviewedByName: string | null
    paymentTerms: string | null
    notes: string | null
    status: string
    attachmentCount: number
    attachments: Array<{ id: string; originalName: string }>
}

function decimalToString(value: unknown): string | null {
    if (value == null) return null
    return String(value)
}

function startOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

export async function summaryOutgoingInvoices() {
    const now = new Date()
    const monthStart = startOfMonth(now)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [total, sentThisMonth, paidThisMonth, failedJobs, openRows, overdueRows] = await Promise.all([
        prisma.outgoingInvoice.count(),
        prisma.outgoingInvoice.count({ where: { sentAt: { gte: monthStart } } }),
        prisma.outgoingInvoice.count({ where: { paidAt: { gte: monthStart } } }),
        prisma.outgoingInvoiceIngestionJob.count({ where: { status: 'FAILED' } }),
        prisma.outgoingInvoice.findMany({
            where: { status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] } },
            select: { totalAmount: true, paidAmount: true },
        }),
        prisma.outgoingInvoice.findMany({
            where: {
                status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] },
                dueDate: { lt: todayStart },
            },
            select: { totalAmount: true, paidAmount: true },
        }),
    ])

    const outstandingTotal = openRows.reduce((sum, row) => {
        const totalAmt = row.totalAmount != null ? Number(row.totalAmount) : 0
        const paidAmt = row.paidAmount != null ? Number(row.paidAmount) : 0
        return sum + Math.max(0, totalAmt - paidAmt)
    }, 0)

    const overdueAmount = overdueRows.reduce((sum, row) => {
        const totalAmt = row.totalAmount != null ? Number(row.totalAmount) : 0
        const paidAmt = row.paidAmount != null ? Number(row.paidAmount) : 0
        return sum + Math.max(0, totalAmt - paidAmt)
    }, 0)

    return {
        total,
        sentThisMonth,
        paidThisMonth,
        failedJobs,
        outstandingTotal: Number(outstandingTotal.toFixed(2)),
        overdueCount: overdueRows.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
    }
}

export async function listOutgoingInvoices(params: {
    q?: string
    customer?: string
    dateFrom?: string
    dateTo?: string
    minTotal?: number
    maxTotal?: number
    status?: string
    reviewed?: string
    sort?: string
    limit?: number
    offset?: number
}) {
    const limit = Math.min(Math.max(params.limit ?? 40, 1), 100)
    const offset = Math.max(params.offset ?? 0, 0)
    const where: Record<string, unknown> = {}

    if (params.status) where.status = params.status
    if (params.reviewed === 'reviewed') where.reviewedAt = { not: null }
    else if (params.reviewed === 'unreviewed') where.reviewedAt = null
    if (params.customer) where.customerName = { contains: params.customer, mode: 'insensitive' }
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
        ]
    }
    if (params.dateFrom || params.dateTo) {
        where.sentAt = {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
        }
    }
    if (params.minTotal != null || params.maxTotal != null) {
        where.totalAmount = {
            ...(params.minTotal != null ? { gte: params.minTotal } : {}),
            ...(params.maxTotal != null ? { lte: params.maxTotal } : {}),
        }
    }

    let orderBy: Record<string, 'asc' | 'desc'> = { sentAt: 'desc' }
    if (params.sort === 'customer') orderBy = { customerName: 'asc' }
    else if (params.sort === 'total') orderBy = { totalAmount: 'desc' }
    else if (params.sort === 'dueDate') orderBy = { dueDate: 'asc' }
    else if (params.sort === 'invoiceDate') orderBy = { invoiceDate: 'desc' }
    else if (params.sort === 'created') orderBy = { createdAt: 'desc' }

    const [rows, total] = await Promise.all([
        prisma.outgoingInvoice.findMany({
            where,
            orderBy,
            skip: offset,
            take: limit,
            include: {
                _count: { select: { attachments: true } },
                job: { select: { id: true, title: true } },
                reviewedBy: { select: { id: true, firstName: true, lastName: true } },
                attachments: {
                    orderBy: { attachmentIndex: 'asc' },
                    select: { id: true, originalName: true },
                },
            },
        }),
        prisma.outgoingInvoice.count({ where }),
    ])

    const mapped: OutgoingInvoiceListRow[] = rows.map((row) => ({
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
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        reviewedById: row.reviewedById,
        reviewedByName: displayName(row.reviewedBy),
        paymentTerms: row.paymentTerms,
        notes: row.notes,
        status: row.status,
        attachmentCount: row._count.attachments,
        attachments: row.attachments.map((a) => ({ id: a.id, originalName: a.originalName })),
    }))

    return { rows: mapped, total }
}

export async function getOutgoingInvoiceDetail(id: string) {
    const invoice = await prisma.outgoingInvoice.findUnique({
        where: { id },
        include: {
            attachments: { orderBy: { attachmentIndex: 'asc' } },
            job: { select: { id: true, title: true } },
            reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
    })
    if (!invoice) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 })
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
        reviewedAt: invoice.reviewedAt?.toISOString() ?? null,
        reviewedById: invoice.reviewedById,
        reviewedByName: displayName(invoice.reviewedBy),
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
    }
}

function isValidPdfBuffer(buffer: Buffer): boolean {
    return buffer.length > 100 && buffer.subarray(0, 5).toString('utf8') === '%PDF-'
}

async function getOutgoingInvoiceAttachmentRecord(invoiceId: string, attachmentId: string) {
    const attachment = await prisma.outgoingInvoiceAttachment.findFirst({
        where: { id: attachmentId, invoiceId },
    })
    if (!attachment) {
        throw Object.assign(new Error('Attachment not found'), { status: 404 })
    }
    return attachment
}

export async function getOutgoingInvoiceAttachmentDownloadUrl(invoiceId: string, attachmentId: string) {
    const attachment = await getOutgoingInvoiceAttachmentRecord(invoiceId, attachmentId)
    const url = await getBlobSasUrl(attachment.filePath, 30)
    return { url, originalName: attachment.originalName }
}

export async function getOutgoingInvoiceAttachmentBuffer(invoiceId: string, attachmentId: string) {
    const attachment = await getOutgoingInvoiceAttachmentRecord(invoiceId, attachmentId)
    let buffer: Buffer
    try {
        buffer = await getBlobBuffer(attachment.filePath)
    } catch {
        throw Object.assign(new Error('Attachment file not found in storage'), { status: 404 })
    }
    if (!isValidPdfBuffer(buffer)) {
        const invoice = await prisma.outgoingInvoice.findUnique({
            where: { id: invoiceId },
            select: { gmailMessageId: true },
        })
        if (invoice?.gmailMessageId && !invoice.gmailMessageId.startsWith('manual:') && attachment.gmailAttachmentId) {
            const repaired = await downloadGmailAttachment(
                invoice.gmailMessageId,
                attachment.gmailAttachmentId,
                attachment.originalName,
            ).catch(() => null)
            if (repaired && isValidPdfBuffer(repaired)) buffer = repaired
        }
    }
    if (!isValidPdfBuffer(buffer)) {
        throw Object.assign(new Error('Attachment is missing or corrupted'), { status: 404 })
    }
    return {
        buffer,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType || 'application/pdf',
    }
}

export async function deleteOutgoingInvoice(id: string) {
    const invoice = await prisma.outgoingInvoice.findUnique({
        where: { id },
        include: { attachments: true },
    })
    if (!invoice) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 })
    }

    for (const attachment of invoice.attachments) {
        if (attachment.filePath) {
            await deleteBlob(attachment.filePath).catch(() => undefined)
        }
    }

    await prisma.outgoingInvoice.delete({ where: { id } })

    if (invoice.gmailMessageId) {
        const siblings = await prisma.outgoingInvoice.count({
            where: { gmailMessageId: invoice.gmailMessageId },
        })
        if (siblings === 0) {
            await prisma.outgoingInvoiceIngestionJob.deleteMany({
                where: { gmailMessageId: invoice.gmailMessageId },
            }).catch(() => undefined)
        }
    }

    return { deleted: true as const }
}

function optionalDecimal(value: number | null | undefined): Decimal | null {
    if (value == null || !Number.isFinite(value)) return null
    return new Decimal(value)
}

export type UpdateOutgoingInvoiceInput = {
    customerName?: string | null
    invoiceNumber?: string | null
    invoiceDate?: string | null
    dueDate?: string | null
    subtotal?: number | null
    taxAmount?: number | null
    totalAmount?: number | null
    paidAmount?: number | null
    currency?: string | null
    orderNumber?: string | null
    supplierNumber?: string | null
    projectName?: string | null
    jobId?: string | null
    paid?: boolean | null
    reviewed?: boolean | null
    reviewedById?: string | null
    paymentTerms?: string | null
    notes?: string | null
}

export async function updateOutgoingInvoice(id: string, input: UpdateOutgoingInvoiceInput) {
    const existing = await prisma.outgoingInvoice.findUnique({ where: { id } })
    if (!existing) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 })
    }

    if (input.jobId) {
        const job = await prisma.job.findUnique({ where: { id: input.jobId }, select: { id: true } })
        if (!job) {
            throw Object.assign(new Error('Job not found'), { status: 400 })
        }
    }

    const customerName = input.customerName !== undefined
        ? (input.customerName?.trim() || null)
        : existing.customerName

    let paidAt: Date | null | undefined
    let paidAmount: Decimal | null | undefined
    if (input.paid === true) {
        paidAt = new Date()
        const total = input.totalAmount != null
            ? input.totalAmount
            : existing.totalAmount != null
                ? Number(existing.totalAmount)
                : null
        paidAmount = optionalDecimal(
            input.paidAmount != null ? input.paidAmount : total,
        )
    } else if (input.paid === false) {
        paidAt = null
        paidAmount = null
    } else if (input.paidAmount !== undefined) {
        paidAmount = optionalDecimal(input.paidAmount ?? undefined)
    }

    let reviewedAt: Date | null | undefined
    let reviewedById: string | null | undefined
    if (input.reviewed === true) {
        if (!input.reviewedById) {
            throw Object.assign(new Error('Reviewer is required'), { status: 400 })
        }
        reviewedAt = new Date()
        reviewedById = input.reviewedById
    } else if (input.reviewed === false) {
        reviewedAt = null
        reviewedById = null
    }

    const totalAmount = input.totalAmount !== undefined
        ? optionalDecimal(input.totalAmount ?? undefined)
        : existing.totalAmount
    const resolvedPaidAmount = paidAmount !== undefined ? paidAmount : existing.paidAmount
    const resolvedPaidAt = paidAt !== undefined ? paidAt : existing.paidAt
    const resolvedDueDate = input.dueDate !== undefined
        ? parseOutgoingDateString(input.dueDate || undefined)
        : existing.dueDate

    const status = deriveOutgoingInvoiceStatus({
        paidAt: resolvedPaidAt,
        paidAmount: resolvedPaidAmount != null ? Number(resolvedPaidAmount) : null,
        totalAmount: totalAmount != null ? Number(totalAmount) : null,
        dueDate: resolvedDueDate,
    })

    await prisma.outgoingInvoice.update({
        where: { id },
        data: {
            customerName,
            invoiceNumber: input.invoiceNumber !== undefined ? (input.invoiceNumber?.trim() || null) : undefined,
            invoiceDate: input.invoiceDate !== undefined ? parseOutgoingDateString(input.invoiceDate || undefined) : undefined,
            dueDate: input.dueDate !== undefined ? parseOutgoingDateString(input.dueDate || undefined) : undefined,
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
            reviewedAt: reviewedAt !== undefined ? reviewedAt : undefined,
            reviewedById: reviewedById !== undefined ? reviewedById : undefined,
            paymentTerms: input.paymentTerms !== undefined ? (input.paymentTerms?.trim() || null) : undefined,
            notes: input.notes !== undefined ? (input.notes?.trim() || null) : undefined,
            status,
            searchText: buildOutgoingInvoiceSearchText([
                existing.emailSubject,
                customerName,
                input.invoiceNumber !== undefined ? input.invoiceNumber : existing.invoiceNumber,
                input.orderNumber !== undefined ? input.orderNumber : existing.orderNumber,
                input.supplierNumber !== undefined ? input.supplierNumber : existing.supplierNumber,
                input.projectName !== undefined ? input.projectName : existing.projectName,
                input.notes !== undefined ? input.notes : existing.notes,
            ]),
        },
    })

    return getOutgoingInvoiceDetail(id)
}

export async function rescanOutgoingInvoiceFromPdf(id: string) {
    const invoice = await prisma.outgoingInvoice.findUnique({
        where: { id },
        include: { attachments: { orderBy: { attachmentIndex: 'asc' } } },
    })
    if (!invoice) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 })
    }
    if (!invoice.attachments.length) {
        throw Object.assign(new Error('No PDF attachments to scan'), { status: 400 })
    }

    const ocrTexts: Array<{ filename: string; text: string }> = []
    for (const attachment of invoice.attachments) {
        const { buffer } = await getOutgoingInvoiceAttachmentBuffer(id, attachment.id)
        let text = ''
        try {
            text = await extractInvoiceAttachmentText(buffer, {
                mimeType: attachment.mimeType || undefined,
                filename: attachment.originalName,
            })
        } catch (error) {
            console.warn('[outgoing-invoice] attachment text extraction failed during rescan', attachment.originalName, error)
        }
        ocrTexts.push({ filename: attachment.originalName, text })
        await prisma.outgoingInvoiceAttachment.update({
            where: { id: attachment.id },
            data: { ocrText: text || null },
        })
    }

    const combinedText = ocrTexts.map((entry) => entry.text).join('\n')
    if (!combinedText || combinedText.length < 20) {
        throw Object.assign(
            new Error('Could not read text from the PDF. Configure Azure Document Intelligence on the server.'),
            { status: 400 },
        )
    }

    const template = parseMaximOutgoingInvoiceTemplate(combinedText)
    const extracted = mergeMaximTemplateExtraction(
        template && (template.confidence ?? 0) >= 0.8
            ? template
            : await extractOutgoingInvoiceFields({
                subject: invoice.emailSubject || '',
                bodyText: invoice.emailBodyText || '',
                to: invoice.emailTo || '',
                pdfText: combinedText,
            }),
        combinedText,
    )

    const customerName = extracted.customerName
        || invoice.customerName
        || guessCustomerFromEmailTo(invoice.emailTo || undefined)
    const invoiceDate = parseOutgoingDateString(extracted.invoiceDate) ?? invoice.invoiceDate
    const dueDate = parseOutgoingDateString(extracted.dueDate) ?? invoice.dueDate
    const totalAmount = extracted.totalAmount != null ? new Decimal(extracted.totalAmount) : invoice.totalAmount

    const status = deriveOutgoingInvoiceStatus({
        paidAt: invoice.paidAt,
        paidAmount: invoice.paidAmount != null ? Number(invoice.paidAmount) : null,
        totalAmount: totalAmount != null ? Number(totalAmount) : null,
        dueDate,
    })

    await prisma.outgoingInvoice.update({
        where: { id },
        data: {
            status,
            customerName,
            invoiceNumber: extracted.invoiceNumber || invoice.invoiceNumber,
            invoiceDate,
            dueDate,
            subtotal: extracted.subtotal != null ? new Decimal(extracted.subtotal) : invoice.subtotal,
            taxAmount: extracted.taxAmount != null ? new Decimal(extracted.taxAmount) : invoice.taxAmount,
            totalAmount,
            currency: extracted.currency || invoice.currency,
            orderNumber: extracted.orderNumber || invoice.orderNumber,
            supplierNumber: extracted.supplierNumber || invoice.supplierNumber,
            projectName: extracted.projectName || invoice.projectName,
            paymentTerms: extracted.paymentTerms || invoice.paymentTerms,
            extractedData: extracted as object,
            searchText: buildOutgoingInvoiceSearchText([
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
    })

    return getOutgoingInvoiceDetail(id)
}
