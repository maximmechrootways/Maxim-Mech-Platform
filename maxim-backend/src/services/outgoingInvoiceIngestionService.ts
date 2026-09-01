import { prisma } from '../lib/prisma'
import { env } from '../config/env'
import { isTransientComposioError } from '../integrations/composio/composioEmailService'
import {
    downloadGmailAttachment,
    ensureProcessedLabel,
    fetchGmailMessageById,
    fetchSentOutgoingInvoiceCandidateIds,
    markGmailMessageOutgoingProcessed,
    setupOutgoingInvoiceSentTrigger,
} from '../integrations/composio-invoice/invoiceComposioGmailService'
import { isInvoiceComposioConfigured, resolveInvoiceInboxIdentity } from '../integrations/composio-invoice/invoiceComposioClient'
import { extractInvoiceAttachmentText } from '../lib/invoicePdfText'
import { uploadBufferToBlob } from './blobStorageService'
import {
    deriveOutgoingInvoiceStatus,
    guessCustomerFromEmailTo,
    isMaximOutgoingInvoiceText,
    mergeMaximTemplateExtraction,
    parseMaximOutgoingInvoiceTemplate,
    parseOutgoingDateString,
} from './outgoingInvoiceExtractionService'
import { buildOutgoingInvoiceSearchText, extractOutgoingInvoiceFields } from './outgoingInvoiceAiService'
import { Decimal } from '@prisma/client/runtime/library'

export function computeOutgoingInvoiceBackoffMs(attempt: number) {
    const exponential = env.OUTGOING_INVOICE_BACKOFF_BASE_MS * (2 ** Math.max(0, attempt - 1))
    return Math.min(exponential, 15 * 60 * 1000)
}

export async function enqueueOutgoingInvoiceJob(input: {
    gmailMessageId: string
    gmailThreadId?: string
    triggerPayload?: unknown
}) {
    const messageId = input.gmailMessageId.trim()
    if (!messageId) return { enqueued: false as const, reason: 'missing_message_id' }

    const existingJob = await prisma.outgoingInvoiceIngestionJob.findUnique({
        where: { gmailMessageId: messageId },
        select: { status: true },
    })
    if (existingJob?.status === 'COMPLETED') {
        return { enqueued: false as const, reason: 'already_processed_email' }
    }

    const shouldRequeue = existingJob != null && existingJob.status !== 'COMPLETED'

    await prisma.outgoingInvoiceIngestionJob.upsert({
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
            maxAttempts: env.OUTGOING_INVOICE_MAX_ATTEMPTS,
            status: 'PENDING',
            nextAttemptAt: new Date(),
        },
    })
    return { enqueued: true as const }
}

async function getOrCreateSyncCursor() {
    return prisma.outgoingInvoiceSyncCursor.upsert({
        where: { id: 'default' },
        update: {},
        create: {
            id: 'default',
            processedLabelName: env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL,
            connectedAccountId: env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID || null,
        },
    })
}

async function getOutgoingProcessedLabelId(): Promise<string> {
    const cursor = await getOrCreateSyncCursor()
    if (cursor.processedLabelId) return cursor.processedLabelId
    const labelId = await ensureProcessedLabel(cursor.processedLabelName || env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL)
    await prisma.outgoingInvoiceSyncCursor.update({
        where: { id: 'default' },
        data: { processedLabelId: labelId },
    })
    return labelId
}

async function lockNextIngestionJob() {
    const now = new Date()
    const lockExpiredBefore = new Date(Date.now() - env.OUTGOING_INVOICE_LOCK_TTL_MS)
    const candidate = await prisma.outgoingInvoiceIngestionJob.findFirst({
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

    const claim = await prisma.outgoingInvoiceIngestionJob.updateMany({
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
    return prisma.outgoingInvoiceIngestionJob.findUnique({ where: { id: candidate.id } })
}

async function finalizeJob(jobId: string, data: {
    status: 'COMPLETED' | 'FAILED' | 'IGNORED'
    ignoreReason?: string
    lastErrorMessage?: string
}) {
    await prisma.outgoingInvoiceIngestionJob.update({
        where: { id: jobId },
        data: {
            status: data.status,
            ignoreReason: data.ignoreReason ?? null,
            lastErrorMessage: data.lastErrorMessage ?? null,
            processingLockedAt: null,
        },
    })
}

async function processIngestionJob(jobId: string, gmailMessageId: string) {
    const message = await fetchGmailMessageById(gmailMessageId)
    if (message.attachments.length === 0) {
        await finalizeJob(jobId, { status: 'IGNORED', ignoreReason: 'no_processable_attachments' })
        return
    }

    const pdfBuffers: Array<{ meta: typeof message.attachments[number]; buffer: Buffer }> = []
    const attachmentPayloads: Array<{ attachmentIndex: number; filename: string; text: string }> = []

    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
        const attachment = message.attachments[attachmentIndex]
        const buffer = await downloadGmailAttachment(message.messageId, attachment.attachmentId, attachment.filename)
        pdfBuffers.push({ meta: attachment, buffer })
        try {
            const text = await extractInvoiceAttachmentText(buffer, {
                mimeType: attachment.mimeType,
                filename: attachment.filename,
            })
            attachmentPayloads.push({ attachmentIndex, filename: attachment.filename, text })
        } catch (error) {
            console.warn('[outgoing-invoice] attachment text extraction failed', attachment.filename, error)
            attachmentPayloads.push({ attachmentIndex, filename: attachment.filename, text: '' })
        }
    }

    const maximAttachments = attachmentPayloads.filter((entry) => isMaximOutgoingInvoiceText(entry.text))
    if (!maximAttachments.length) {
        await finalizeJob(jobId, { status: 'IGNORED', ignoreReason: 'not_maxim_outgoing_invoice' })
        return
    }

    for (let sequence = 0; sequence < maximAttachments.length; sequence++) {
        const document = maximAttachments[sequence]
        const pdfText = document.text
        const template = parseMaximOutgoingInvoiceTemplate(pdfText)
        const extracted = mergeMaximTemplateExtraction(
            template && (template.confidence ?? 0) >= 0.8
                ? template
                : await extractOutgoingInvoiceFields({
                    subject: message.subject,
                    bodyText: message.bodyText,
                    to: message.to,
                    pdfText,
                }),
            pdfText,
        )

        const customerName = extracted.customerName
            || guessCustomerFromEmailTo(message.to)
            || null
        const invoiceDate = parseOutgoingDateString(extracted.invoiceDate)
        const dueDate = parseOutgoingDateString(extracted.dueDate)
        const totalAmount = extracted.totalAmount != null ? new Decimal(extracted.totalAmount) : null

        const arStatus = deriveOutgoingInvoiceStatus({
            dueDate,
            totalAmount: totalAmount != null ? Number(totalAmount) : null,
        })

        const invoice = await prisma.outgoingInvoice.create({
            data: {
                gmailMessageId: message.messageId,
                sourceSequence: sequence,
                gmailThreadId: message.threadId || null,
                emailSubject: message.subject || null,
                emailBodyText: message.bodyText || null,
                emailBodyHtml: message.bodyHtml || null,
                emailFrom: message.from || null,
                emailTo: message.to || null,
                sentAt: message.receivedAt || new Date(),
                status: arStatus,
                processedAt: new Date(),
                customerName,
                invoiceNumber: extracted.invoiceNumber || null,
                invoiceDate,
                dueDate,
                subtotal: extracted.subtotal != null ? new Decimal(extracted.subtotal) : null,
                taxAmount: extracted.taxAmount != null ? new Decimal(extracted.taxAmount) : null,
                totalAmount,
                currency: extracted.currency || 'CAD',
                orderNumber: extracted.orderNumber || null,
                supplierNumber: extracted.supplierNumber || null,
                projectName: extracted.projectName || null,
                paymentTerms: extracted.paymentTerms || null,
                extractedData: extracted as object,
                searchText: buildOutgoingInvoiceSearchText([
                    message.subject,
                    message.to,
                    customerName,
                    extracted.invoiceNumber,
                    extracted.orderNumber,
                    extracted.supplierNumber,
                    extracted.projectName,
                    pdfText,
                ]),
            },
        })

        const { meta, buffer } = pdfBuffers[document.attachmentIndex]
        const blobName = `outgoing-invoices/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${meta.filename.replace(/[^\w.-]+/g, '_')}`
        await uploadBufferToBlob(blobName, buffer, meta.mimeType || 'application/pdf')
        await prisma.outgoingInvoiceAttachment.create({
            data: {
                invoiceId: invoice.id,
                attachmentIndex: 0,
                gmailAttachmentId: meta.attachmentId,
                filePath: blobName,
                originalName: meta.filename,
                mimeType: meta.mimeType || 'application/pdf',
                sizeBytes: buffer.length,
                ocrText: pdfText || null,
            },
        })
    }

    const labelId = await getOutgoingProcessedLabelId()
    await markGmailMessageOutgoingProcessed(message.messageId, labelId)
    await prisma.outgoingInvoice.updateMany({
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
            event: 'outgoing_invoice_processed',
            jobId: job.id,
            gmailMessageId: job.gmailMessageId,
        }))
    } catch (error) {
        const attempts = job.attempts
        const exhausted = attempts >= job.maxAttempts
        const shouldRetry = !exhausted && isTransientComposioError(error)
        const status = shouldRetry ? 'RETRYING' : 'FAILED'
        const nextAttemptAt = shouldRetry ? new Date(Date.now() + computeOutgoingInvoiceBackoffMs(attempts)) : job.nextAttemptAt

        await prisma.outgoingInvoiceIngestionJob.update({
            where: { id: job.id },
            data: {
                status,
                nextAttemptAt,
                processingLockedAt: null,
                lastErrorMessage: error instanceof Error ? error.message : String(error),
            },
        })

        console.error(JSON.stringify({
            event: 'outgoing_invoice_failed',
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

export async function pollSentOutgoingInvoiceEmails() {
    if (!isInvoiceComposioConfigured()) return { enqueued: 0, skipped: 0, configured: false as const }
    const ids = await fetchSentOutgoingInvoiceCandidateIds(25)
    let enqueued = 0
    let skipped = 0
    for (const gmailMessageId of ids) {
        const result = await enqueueOutgoingInvoiceJob({ gmailMessageId })
        if (result.enqueued) enqueued += 1
        else skipped += 1
    }
    await prisma.outgoingInvoiceSyncCursor.update({
        where: { id: 'default' },
        data: { lastSyncedAt: new Date() },
    }).catch(async () => {
        await prisma.outgoingInvoiceSyncCursor.create({
            data: { id: 'default', lastSyncedAt: new Date() },
        })
    })
    return { enqueued, skipped, scanned: ids.length, configured: true as const }
}

export async function processOutgoingInvoiceQueue(limit = 5) {
    if (!isInvoiceComposioConfigured()) return { processed: 0, completed: 0, failed: 0, ignored: 0 }
    const lockExpiredBefore = new Date(Date.now() - env.OUTGOING_INVOICE_LOCK_TTL_MS)
    let processed = 0
    let completed = 0
    let failed = 0
    let ignored = 0
    for (let i = 0; i < limit; i++) {
        const job = await prisma.outgoingInvoiceIngestionJob.findFirst({
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
        const updated = await prisma.outgoingInvoiceIngestionJob.findUnique({
            where: { id: job.id },
            select: { status: true },
        })
        if (updated?.status === 'COMPLETED') completed += 1
        else if (updated?.status === 'FAILED') failed += 1
        else if (updated?.status === 'IGNORED') ignored += 1
    }
    return { processed, completed, failed, ignored }
}

export async function getOutgoingInvoicePipelineStatus() {
    const configured = isInvoiceComposioConfigured()
    const [pendingJobs, failedJobs, ignoredJobs, invoiceCount, recentFailed] = await Promise.all([
        prisma.outgoingInvoiceIngestionJob.count({ where: { status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] } } }),
        prisma.outgoingInvoiceIngestionJob.count({ where: { status: 'FAILED' } }),
        prisma.outgoingInvoiceIngestionJob.count({ where: { status: 'IGNORED' } }),
        prisma.outgoingInvoice.count(),
        prisma.outgoingInvoiceIngestionJob.findMany({
            where: { status: 'FAILED' },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: { gmailMessageId: true, lastErrorMessage: true, updatedAt: true },
        }),
    ])
    const cursor = await prisma.outgoingInvoiceSyncCursor.findUnique({ where: { id: 'default' } })
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

export async function bootstrapOutgoingInvoiceIntegration() {
    if (!isInvoiceComposioConfigured()) {
        throw new Error('Invoice Composio integration is not configured')
    }
    const identity = resolveInvoiceInboxIdentity()
    const labelId = await ensureProcessedLabel(env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL)
    const { triggerId } = await setupOutgoingInvoiceSentTrigger()
    await prisma.outgoingInvoiceSyncCursor.upsert({
        where: { id: 'default' },
        update: {
            processedLabelId: labelId,
            processedLabelName: env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL,
            composioTriggerId: triggerId,
            connectedAccountId: identity.connectedAccountId,
        },
        create: {
            id: 'default',
            processedLabelId: labelId,
            processedLabelName: env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL,
            composioTriggerId: triggerId,
            connectedAccountId: identity.connectedAccountId,
        },
    })
    return { triggerId, processedLabelId: labelId }
}

export async function resolveOutgoingTriggerId(): Promise<string | null> {
    const cursor = await prisma.outgoingInvoiceSyncCursor.findUnique({
        where: { id: 'default' },
        select: { composioTriggerId: true },
    })
    return cursor?.composioTriggerId ?? null
}

export function startOutgoingInvoiceWorker() {
    if (!env.COMPOSIO_INVOICE_ENABLED) return
    if (!isInvoiceComposioConfigured()) {
        console.warn('[outgoing-invoice] worker disabled: COMPOSIO_INVOICE_* env vars not fully configured')
        return
    }
    if (!workerIntervalRef) {
        workerIntervalRef = setInterval(() => {
            processOneIngestionJob().catch((error) => {
                console.error('[outgoing-invoice] worker tick failed', error)
            })
        }, Math.max(2000, env.OUTGOING_INVOICE_POLL_INTERVAL_MS))
    }
    if (!syncIntervalRef) {
        void pollSentOutgoingInvoiceEmails().catch((error) => {
            console.error('[outgoing-invoice] initial sync poll failed', error)
        })
        syncIntervalRef = setInterval(() => {
            pollSentOutgoingInvoiceEmails().catch((error) => {
                console.error('[outgoing-invoice] sync poll failed', error)
            })
        }, Math.max(60000, env.OUTGOING_INVOICE_SYNC_POLL_MS))
    }
}

export {
    extractGmailMessageIdFromTriggerPayload,
    extractGmailThreadIdFromTriggerPayload,
} from './incomingInvoiceIngestionService'
