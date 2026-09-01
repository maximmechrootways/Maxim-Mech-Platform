import { prisma } from '../lib/prisma'
import { env } from '../config/env'
import { isTransientComposioError } from '../integrations/composio/composioEmailService'
import {
    downloadGmailAttachment,
    ensureProcessedLabel,
    fetchGmailMessageById,
    fetchUnreadInvoiceCandidateIds,
    markGmailMessageProcessed,
    setupInvoiceInboxTrigger,
} from '../integrations/composio-invoice/invoiceComposioGmailService'
import { isInvoiceComposioConfigured, resolveInvoiceInboxIdentity } from '../integrations/composio-invoice/invoiceComposioClient'
import { extractInvoiceAttachmentText, guessVendorFromPdfText } from '../lib/invoicePdfText'
import { classifyInvoiceImageAttachment, isImageAttachmentType } from '../lib/invoiceImageFilter'
import { uploadBufferToBlob } from './blobStorageService'
import {
    buildInvoiceSearchText,
    classifyIncomingFinanceEmail,
    parseIsoDate,
    type FinanceDocumentType,
} from './incomingInvoiceAiService'
import {
    guessDocumentTypeFromText,
    guessVendorFromEmailMetadata,
    resolveIncomingDocumentsFromAttachments,
} from './incomingInvoiceDocumentResolver'
import { applyReceiptLinking } from './incomingInvoiceReceiptLink'
import { Decimal } from '@prisma/client/runtime/library'

export function computeIncomingInvoiceBackoffMs(attempt: number) {
    const exponential = env.INCOMING_INVOICE_BACKOFF_BASE_MS * (2 ** Math.max(0, attempt - 1))
    return Math.min(exponential, 15 * 60 * 1000)
}

export async function enqueueIncomingInvoiceJob(input: {
    gmailMessageId: string
    gmailThreadId?: string
    triggerPayload?: unknown
}) {
    const messageId = input.gmailMessageId.trim()
    if (!messageId) return { enqueued: false as const, reason: 'missing_message_id' }

    const existingJob = await prisma.incomingInvoiceIngestionJob.findUnique({
        where: { gmailMessageId: messageId },
        select: { status: true },
    })
    if (existingJob?.status === 'COMPLETED') {
        return { enqueued: false as const, reason: 'already_processed_email' }
    }

    const shouldRequeue = existingJob != null && existingJob.status !== 'COMPLETED'

    await prisma.incomingInvoiceIngestionJob.upsert({
        where: { gmailMessageId: messageId },
        update: shouldRequeue
            ? {
                status: 'PENDING',
                nextAttemptAt: new Date(),
                processingLockedAt: null,
                ignoreReason: null,
                lastErrorMessage: null,
            }
            : {},
        create: {
            gmailMessageId: messageId,
            gmailThreadId: input.gmailThreadId || null,
            triggerPayload: input.triggerPayload ? (input.triggerPayload as object) : undefined,
            maxAttempts: env.INCOMING_INVOICE_MAX_ATTEMPTS,
            status: 'PENDING',
            nextAttemptAt: new Date(),
        },
    })
    return { enqueued: true as const }
}

async function getOrCreateSyncCursor() {
    return prisma.incomingInvoiceSyncCursor.upsert({
        where: { id: 'default' },
        update: {},
        create: {
            id: 'default',
            processedLabelName: env.COMPOSIO_INVOICE_PROCESSED_LABEL,
            connectedAccountId: env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID || null,
        },
    })
}

async function getProcessedLabelId(): Promise<string> {
    const cursor = await getOrCreateSyncCursor()
    if (cursor.processedLabelId) return cursor.processedLabelId
    const labelId = await ensureProcessedLabel(cursor.processedLabelName || env.COMPOSIO_INVOICE_PROCESSED_LABEL)
    await prisma.incomingInvoiceSyncCursor.update({
        where: { id: 'default' },
        data: { processedLabelId: labelId },
    })
    return labelId
}

async function lockNextIngestionJob() {
    const now = new Date()
    const lockExpiredBefore = new Date(Date.now() - env.INCOMING_INVOICE_LOCK_TTL_MS)
    const candidate = await prisma.incomingInvoiceIngestionJob.findFirst({
        where: {
            OR: [
                {
                    status: { in: ['PENDING', 'RETRYING'] },
                    nextAttemptAt: { lte: now },
                    OR: [{ processingLockedAt: null }, { processingLockedAt: { lt: lockExpiredBefore } }],
                },
                {
                    status: 'PROCESSING',
                    processingLockedAt: { lt: lockExpiredBefore },
                },
            ],
        },
        orderBy: { createdAt: 'asc' },
    })
    if (!candidate) return null

    const claim = await prisma.incomingInvoiceIngestionJob.updateMany({
        where: {
            id: candidate.id,
            OR: [{ processingLockedAt: null }, { processingLockedAt: { lt: lockExpiredBefore } }],
        },
        data: {
            processingLockedAt: now,
            status: 'PROCESSING',
            attempts: { increment: 1 },
        },
    })
    if (!claim.count) return null
    return prisma.incomingInvoiceIngestionJob.findUnique({ where: { id: candidate.id } })
}

async function finalizeJob(jobId: string, data: {
    status: 'COMPLETED' | 'FAILED' | 'IGNORED'
    ignoreReason?: string
    lastErrorMessage?: string
}) {
    await prisma.incomingInvoiceIngestionJob.update({
        where: { id: jobId },
        data: {
            status: data.status,
            ignoreReason: data.ignoreReason ?? null,
            lastErrorMessage: data.lastErrorMessage ?? null,
            processingLockedAt: null,
        },
    })
}

function classifyFinanceEmailWithoutAi(input: {
    subject: string
    bodyText: string
    attachmentNames: string[]
}) {
    const haystack = [input.subject, input.bodyText, ...input.attachmentNames].join('\n').toLowerCase()
    const shouldProcess = /\b(invoice|receipt|statement|bill|payment|remit|amount due)\b/.test(haystack)
    const documentTypes: FinanceDocumentType[] = []
    if (/\breceipt\b|\bpaid\b|\bpayment confirmation\b/.test(haystack)) documentTypes.push('RECEIPT')
    if (/\bstatement\b/.test(haystack)) documentTypes.push('STATEMENT')
    if (/\binvoice\b|\bbill\b|\bamount due\b/.test(haystack) || documentTypes.length === 0) {
        documentTypes.push('INVOICE')
    }
    return {
        shouldProcess,
        confidence: shouldProcess ? 0.65 : 0.2,
        reason: shouldProcess ? 'keyword_match' : 'not_finance_document',
        documentTypes: [...new Set(documentTypes)],
    }
}

async function classifyFinanceEmail(input: {
    subject: string
    bodyText: string
    from: string
    attachmentNames: string[]
}) {
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            return await classifyIncomingFinanceEmail(input)
        } catch (error) {
            console.warn('[incoming-invoice] finance classification failed, using keyword fallback', error)
        }
    }
    return classifyFinanceEmailWithoutAi(input)
}

async function processIngestionJob(jobId: string, gmailMessageId: string) {
    const message = await fetchGmailMessageById(gmailMessageId)
    if (message.attachments.length === 0) {
        await finalizeJob(jobId, { status: 'IGNORED', ignoreReason: 'no_processable_attachments' })
        return
    }

    const classification = await classifyFinanceEmail({
        subject: message.subject,
        bodyText: message.bodyText,
        from: message.from,
        attachmentNames: message.attachments.map((a) => a.filename),
    })

    if (!classification.shouldProcess || classification.confidence < 0.5) {
        await finalizeJob(jobId, {
            status: 'IGNORED',
            ignoreReason: classification.reason || 'not_finance_document',
        })
        return
    }

    const pdfBuffers: Array<{ meta: typeof message.attachments[number]; buffer: Buffer }> = []
    const attachmentPayloads: Array<{ attachmentIndex: number; filename: string; text: string }> = []

    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
        const attachment = message.attachments[attachmentIndex]
        const buffer = await downloadGmailAttachment(message.messageId, attachment.attachmentId, attachment.filename)
        pdfBuffers.push({ meta: attachment, buffer })

        let text = ''
        try {
            text = await extractInvoiceAttachmentText(buffer, {
                mimeType: attachment.mimeType,
                filename: attachment.filename,
            })
        } catch (error) {
            console.warn('[incoming-invoice] attachment text extraction failed', attachment.filename, error)
            text = ''
        }

        // Image attachments are often company logos or email-signature banners
        // rather than real documents. Creating an invoice for those throws off
        // the numbers, so only keep images that actually look like a document.
        if (isImageAttachmentType(attachment.mimeType, attachment.filename)) {
            const decision = classifyInvoiceImageAttachment({ buffer, ocrText: text })
            if (!decision.isLikelyInvoice) {
                console.info(JSON.stringify({
                    event: 'incoming_invoice_image_skipped',
                    gmailMessageId: message.messageId,
                    filename: attachment.filename,
                    reason: decision.reason,
                    dimensions: decision.dimensions,
                }))
                continue
            }
        }

        attachmentPayloads.push({ attachmentIndex, filename: attachment.filename, text })
    }

    const documents = await resolveIncomingDocumentsFromAttachments({
        subject: message.subject,
        bodyText: message.bodyText,
        from: message.from,
        attachments: attachmentPayloads,
    })

    if (!documents.length) {
        await finalizeJob(jobId, { status: 'IGNORED', ignoreReason: 'no_extractable_documents' })
        return
    }

    for (const document of documents) {
        // Idempotent re-runs: if a prior (possibly partial) processing of this
        // email already created the document at this sequence, skip it instead
        // of colliding on the (gmailMessageId, sourceSequence) unique key.
        const alreadyExists = await prisma.incomingInvoice.findUnique({
            where: {
                gmailMessageId_sourceSequence: {
                    gmailMessageId: message.messageId,
                    sourceSequence: document.sourceSequence,
                },
            },
            select: { id: true },
        })
        if (alreadyExists) continue

        const extracted = document.extraction
        const documentType = document.documentType
            ?? extracted.documentType
            ?? guessDocumentTypeFromText(document.pdfText, {
                subject: message.subject,
                filename: pdfBuffers[document.attachmentIndex]?.meta.filename,
            })

        const vendorName = extracted.vendor?.name?.trim()
            || guessVendorFromPdfText(document.pdfText, {
                from: message.from,
                subject: message.subject,
                bodyText: message.bodyText,
            })
            || guessVendorFromEmailMetadata(message.from, message.bodyText)

        const receiptLink = await applyReceiptLinking({
            documentType,
            vendorName,
            invoiceNumber: extracted.invoiceNumber || null,
            totalAmount: extracted.totalAmount ?? null,
        })

        const invoice = await prisma.incomingInvoice.create({
            data: {
                gmailMessageId: message.messageId,
                sourceSequence: document.sourceSequence,
                documentType,
                relatedInvoiceId: receiptLink.relatedInvoiceId,
                gmailThreadId: message.threadId || null,
                emailSubject: message.subject || null,
                emailBodyText: message.bodyText || null,
                emailBodyHtml: message.bodyHtml || null,
                emailFrom: message.from || null,
                emailTo: message.to || null,
                receivedAt: message.receivedAt || new Date(),
                status: 'READY',
                processedAt: new Date(),
                vendorName,
                invoiceNumber: extracted.invoiceNumber || null,
                invoiceDate: parseIsoDate(extracted.invoiceDate),
                dueDate: parseIsoDate(extracted.dueDate),
                subtotal: extracted.subtotal != null ? new Decimal(extracted.subtotal) : null,
                taxAmount: extracted.taxAmount != null ? new Decimal(extracted.taxAmount) : null,
                totalAmount: extracted.totalAmount != null ? new Decimal(extracted.totalAmount) : null,
                currency: extracted.currency || null,
                poNumber: extracted.poNumber || null,
                jobReference: extracted.jobReference || extracted.siteReference || null,
                paymentTerms: extracted.paymentTerms || null,
                paidAt: documentType === 'RECEIPT' ? new Date() : null,
                notes: [
                    extracted.notes?.trim(),
                    documentType === 'RECEIPT' && receiptLink.relatedInvoiceId
                        ? 'Linked to matching invoice and marked paid.'
                        : null,
                    documents.length > 1 ? `Bulk email document ${document.sourceSequence + 1} of ${documents.length}.` : null,
                ].filter(Boolean).join(' ') || null,
                extractedData: extracted as object,
                searchText: buildInvoiceSearchText([
                    documentType,
                    message.subject,
                    message.bodyText,
                    vendorName,
                    extracted.invoiceNumber,
                    extracted.poNumber,
                    extracted.jobReference,
                    extracted.siteReference,
                    extracted.paymentReference,
                    document.pdfText,
                ]),
            },
        })

        const { meta, buffer } = pdfBuffers[document.attachmentIndex]
        const blobName = `invoices/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${meta.filename.replace(/[^\w.-]+/g, '_')}`
        await uploadBufferToBlob(blobName, buffer, meta.mimeType || 'application/pdf')
        await prisma.incomingInvoiceAttachment.create({
            data: {
                invoiceId: invoice.id,
                attachmentIndex: 0,
                gmailAttachmentId: meta.attachmentId,
                filePath: blobName,
                originalName: meta.filename,
                mimeType: meta.mimeType || 'application/pdf',
                sizeBytes: buffer.length,
                ocrText: document.pdfText || null,
            },
        })
    }

    const labelId = await getProcessedLabelId()
    await markGmailMessageProcessed(message.messageId, labelId)
    await prisma.incomingInvoice.updateMany({
        where: { gmailMessageId: message.messageId },
        data: { gmailLabeledAt: new Date() },
    })

    await finalizeJob(jobId, { status: 'COMPLETED' })
}

async function processOneIngestionJob() {
    if (!isInvoiceComposioConfigured()) return
    const job = await lockNextIngestionJob()
    if (!job) return

    try {
        await processIngestionJob(job.id, job.gmailMessageId)
        console.info(JSON.stringify({
            event: 'incoming_invoice_processed',
            jobId: job.id,
            gmailMessageId: job.gmailMessageId,
        }))
    } catch (error) {
        const attempts = job.attempts
        const exhausted = attempts >= job.maxAttempts
        const shouldRetry = !exhausted && isTransientComposioError(error)
        const status = shouldRetry ? 'RETRYING' : 'FAILED'
        const nextAttemptAt = shouldRetry ? new Date(Date.now() + computeIncomingInvoiceBackoffMs(attempts)) : job.nextAttemptAt

        await prisma.incomingInvoiceIngestionJob.update({
            where: { id: job.id },
            data: {
                status,
                nextAttemptAt,
                processingLockedAt: null,
                lastErrorMessage: error instanceof Error ? error.message : String(error),
            },
        })

        console.error(JSON.stringify({
            event: 'incoming_invoice_failed',
            jobId: job.id,
            gmailMessageId: job.gmailMessageId,
            attempt: attempts,
            status,
            error: error instanceof Error ? error.message : String(error),
        }))
    }
}

let workerIntervalRef: NodeJS.Timeout | null = null
let syncIntervalRef: NodeJS.Timeout | null = null

export async function pollUnreadInvoiceEmails() {
    if (!isInvoiceComposioConfigured()) return { enqueued: 0, skipped: 0, configured: false as const }
    const ids = await fetchUnreadInvoiceCandidateIds(25)
    let enqueued = 0
    let skipped = 0
    for (const gmailMessageId of ids) {
        const result = await enqueueIncomingInvoiceJob({ gmailMessageId })
        if (result.enqueued) enqueued += 1
        else skipped += 1
    }
    await prisma.incomingInvoiceSyncCursor.update({
        where: { id: 'default' },
        data: { lastSyncedAt: new Date() },
    }).catch(async () => {
        await prisma.incomingInvoiceSyncCursor.create({
            data: { id: 'default', lastSyncedAt: new Date() },
        })
    })
    return { enqueued, skipped, scanned: ids.length, configured: true as const }
}

/** Process up to `limit` queued ingestion jobs immediately (used by admin sync). */
export async function processIncomingInvoiceQueue(limit = 5) {
    if (!isInvoiceComposioConfigured()) return { processed: 0, completed: 0, failed: 0, ignored: 0 }
    const lockExpiredBefore = new Date(Date.now() - env.INCOMING_INVOICE_LOCK_TTL_MS)
    let processed = 0
    let completed = 0
    let failed = 0
    let ignored = 0
    for (let i = 0; i < limit; i++) {
        const job = await prisma.incomingInvoiceIngestionJob.findFirst({
            where: {
                OR: [
                    { status: { in: ['PENDING', 'RETRYING'] } },
                    { status: 'PROCESSING', processingLockedAt: { lt: lockExpiredBefore } },
                ],
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
        })
        if (!job) break
        await processOneIngestionJob()
        processed += 1
        const updated = await prisma.incomingInvoiceIngestionJob.findUnique({
            where: { id: job.id },
            select: { status: true },
        })
        if (updated?.status === 'COMPLETED') completed += 1
        else if (updated?.status === 'FAILED') failed += 1
        else if (updated?.status === 'IGNORED') ignored += 1
    }
    return { processed, completed, failed, ignored }
}

export async function getIncomingInvoicePipelineStatus() {
    const configured = isInvoiceComposioConfigured()
    const [pendingJobs, failedJobs, ignoredJobs, invoiceCount, recentFailed] = await Promise.all([
        prisma.incomingInvoiceIngestionJob.count({ where: { status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] } } }),
        prisma.incomingInvoiceIngestionJob.count({ where: { status: 'FAILED' } }),
        prisma.incomingInvoiceIngestionJob.count({ where: { status: 'IGNORED' } }),
        prisma.incomingInvoice.count(),
        prisma.incomingInvoiceIngestionJob.findMany({
            where: { status: 'FAILED' },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: { gmailMessageId: true, lastErrorMessage: true, updatedAt: true },
        }),
    ])
    const cursor = await prisma.incomingInvoiceSyncCursor.findUnique({ where: { id: 'default' } })
    return {
        configured,
        enabled: env.COMPOSIO_INVOICE_ENABLED,
        hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
        hasAzureOcr: Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY),
        pendingJobs,
        failedJobs,
        ignoredJobs,
        invoiceCount,
        recentFailed,
        composioTriggerId: cursor?.composioTriggerId ?? null,
        lastSyncedAt: cursor?.lastSyncedAt?.toISOString() ?? null,
    }
}

export async function bootstrapInvoiceInboxIntegration() {
    if (!isInvoiceComposioConfigured()) {
        throw new Error('Invoice Composio integration is not configured')
    }
    const identity = resolveInvoiceInboxIdentity()
    const labelId = await ensureProcessedLabel(env.COMPOSIO_INVOICE_PROCESSED_LABEL)
    const { triggerId } = await setupInvoiceInboxTrigger()
    await prisma.incomingInvoiceSyncCursor.upsert({
        where: { id: 'default' },
        update: {
            processedLabelId: labelId,
            processedLabelName: env.COMPOSIO_INVOICE_PROCESSED_LABEL,
            composioTriggerId: triggerId,
            connectedAccountId: identity.connectedAccountId,
        },
        create: {
            id: 'default',
            processedLabelId: labelId,
            processedLabelName: env.COMPOSIO_INVOICE_PROCESSED_LABEL,
            composioTriggerId: triggerId,
            connectedAccountId: identity.connectedAccountId,
        },
    })
    return { triggerId, processedLabelId: labelId }
}

export function startIncomingInvoiceWorker() {
    if (!env.COMPOSIO_INVOICE_ENABLED) return
    if (!isInvoiceComposioConfigured()) {
        console.warn('[incoming-invoice] worker disabled: COMPOSIO_INVOICE_* env vars not fully configured')
        return
    }
    if (!workerIntervalRef) {
        workerIntervalRef = setInterval(() => {
            processOneIngestionJob().catch((error) => {
                console.error('[incoming-invoice] worker tick failed', error)
            })
        }, Math.max(2000, env.INCOMING_INVOICE_POLL_INTERVAL_MS))
    }
    if (!syncIntervalRef) {
        void pollUnreadInvoiceEmails().catch((error) => {
            console.error('[incoming-invoice] initial sync poll failed', error)
        })
        syncIntervalRef = setInterval(() => {
            pollUnreadInvoiceEmails().catch((error) => {
                console.error('[incoming-invoice] sync poll failed', error)
            })
        }, Math.max(60000, env.INCOMING_INVOICE_SYNC_POLL_MS))
    }
}

export function extractGmailMessageIdFromTriggerPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null
    const root = payload as Record<string, unknown>
    const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root
    const nested = data.payload && typeof data.payload === 'object' ? data.payload as Record<string, unknown> : data
    const messageId = String(
        nested.id
        || nested.message_id
        || nested.messageId
        || data.id
        || data.message_id
        || data.messageId
        || '',
    ).trim()
    return messageId || null
}

export function extractGmailThreadIdFromTriggerPayload(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') return undefined
    const root = payload as Record<string, unknown>
    const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root
    const nested = data.payload && typeof data.payload === 'object' ? data.payload as Record<string, unknown> : data
    const threadId = String(nested.thread_id || nested.threadId || data.thread_id || data.threadId || '').trim()
    return threadId || undefined
}
