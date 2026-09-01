"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGmailThreadIdFromTriggerPayload = exports.extractGmailMessageIdFromTriggerPayload = void 0;
exports.computeOutgoingInvoiceBackoffMs = computeOutgoingInvoiceBackoffMs;
exports.enqueueOutgoingInvoiceJob = enqueueOutgoingInvoiceJob;
exports.pollSentOutgoingInvoiceEmails = pollSentOutgoingInvoiceEmails;
exports.processOutgoingInvoiceQueue = processOutgoingInvoiceQueue;
exports.getOutgoingInvoicePipelineStatus = getOutgoingInvoicePipelineStatus;
exports.bootstrapOutgoingInvoiceIntegration = bootstrapOutgoingInvoiceIntegration;
exports.resolveOutgoingTriggerId = resolveOutgoingTriggerId;
exports.startOutgoingInvoiceWorker = startOutgoingInvoiceWorker;
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
const composioEmailService_1 = require("../integrations/composio/composioEmailService");
const invoiceComposioGmailService_1 = require("../integrations/composio-invoice/invoiceComposioGmailService");
const invoiceComposioClient_1 = require("../integrations/composio-invoice/invoiceComposioClient");
const invoicePdfText_1 = require("../lib/invoicePdfText");
const blobStorageService_1 = require("./blobStorageService");
const outgoingInvoiceExtractionService_1 = require("./outgoingInvoiceExtractionService");
const outgoingInvoiceAiService_1 = require("./outgoingInvoiceAiService");
const library_1 = require("@prisma/client/runtime/library");
function computeOutgoingInvoiceBackoffMs(attempt) {
    const exponential = env_1.env.OUTGOING_INVOICE_BACKOFF_BASE_MS * (2 ** Math.max(0, attempt - 1));
    return Math.min(exponential, 15 * 60 * 1000);
}
async function enqueueOutgoingInvoiceJob(input) {
    const messageId = input.gmailMessageId.trim();
    if (!messageId)
        return { enqueued: false, reason: 'missing_message_id' };
    const existingJob = await prisma_1.prisma.outgoingInvoiceIngestionJob.findUnique({
        where: { gmailMessageId: messageId },
        select: { status: true },
    });
    if (existingJob?.status === 'COMPLETED') {
        return { enqueued: false, reason: 'already_processed_email' };
    }
    const shouldRequeue = existingJob != null && existingJob.status !== 'COMPLETED';
    await prisma_1.prisma.outgoingInvoiceIngestionJob.upsert({
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
            triggerPayload: input.triggerPayload ? input.triggerPayload : undefined,
            maxAttempts: env_1.env.OUTGOING_INVOICE_MAX_ATTEMPTS,
            status: 'PENDING',
            nextAttemptAt: new Date(),
        },
    });
    return { enqueued: true };
}
async function getOrCreateSyncCursor() {
    return prisma_1.prisma.outgoingInvoiceSyncCursor.upsert({
        where: { id: 'default' },
        update: {},
        create: {
            id: 'default',
            processedLabelName: env_1.env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL,
            connectedAccountId: env_1.env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID || null,
        },
    });
}
async function getOutgoingProcessedLabelId() {
    const cursor = await getOrCreateSyncCursor();
    if (cursor.processedLabelId)
        return cursor.processedLabelId;
    const labelId = await (0, invoiceComposioGmailService_1.ensureProcessedLabel)(cursor.processedLabelName || env_1.env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL);
    await prisma_1.prisma.outgoingInvoiceSyncCursor.update({
        where: { id: 'default' },
        data: { processedLabelId: labelId },
    });
    return labelId;
}
async function lockNextIngestionJob() {
    const now = new Date();
    const lockExpiredBefore = new Date(Date.now() - env_1.env.OUTGOING_INVOICE_LOCK_TTL_MS);
    const candidate = await prisma_1.prisma.outgoingInvoiceIngestionJob.findFirst({
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
    });
    if (!candidate)
        return null;
    const claim = await prisma_1.prisma.outgoingInvoiceIngestionJob.updateMany({
        where: {
            id: candidate.id,
            OR: [{ processingLockedAt: null }, { processingLockedAt: { lt: lockExpiredBefore } }],
        },
        data: {
            processingLockedAt: now,
            status: 'PROCESSING',
            attempts: { increment: 1 },
        },
    });
    if (!claim.count)
        return null;
    return prisma_1.prisma.outgoingInvoiceIngestionJob.findUnique({ where: { id: candidate.id } });
}
async function finalizeJob(jobId, data) {
    await prisma_1.prisma.outgoingInvoiceIngestionJob.update({
        where: { id: jobId },
        data: {
            status: data.status,
            ignoreReason: data.ignoreReason ?? null,
            lastErrorMessage: data.lastErrorMessage ?? null,
            processingLockedAt: null,
        },
    });
}
async function processIngestionJob(jobId, gmailMessageId) {
    const message = await (0, invoiceComposioGmailService_1.fetchGmailMessageById)(gmailMessageId);
    if (message.attachments.length === 0) {
        await finalizeJob(jobId, { status: 'IGNORED', ignoreReason: 'no_processable_attachments' });
        return;
    }
    const pdfBuffers = [];
    const attachmentPayloads = [];
    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
        const attachment = message.attachments[attachmentIndex];
        const buffer = await (0, invoiceComposioGmailService_1.downloadGmailAttachment)(message.messageId, attachment.attachmentId, attachment.filename);
        pdfBuffers.push({ meta: attachment, buffer });
        try {
            const text = await (0, invoicePdfText_1.extractInvoiceAttachmentText)(buffer, {
                mimeType: attachment.mimeType,
                filename: attachment.filename,
            });
            attachmentPayloads.push({ attachmentIndex, filename: attachment.filename, text });
        }
        catch (error) {
            console.warn('[outgoing-invoice] attachment text extraction failed', attachment.filename, error);
            attachmentPayloads.push({ attachmentIndex, filename: attachment.filename, text: '' });
        }
    }
    const maximAttachments = attachmentPayloads.filter((entry) => (0, outgoingInvoiceExtractionService_1.isMaximOutgoingInvoiceText)(entry.text));
    if (!maximAttachments.length) {
        await finalizeJob(jobId, { status: 'IGNORED', ignoreReason: 'not_maxim_outgoing_invoice' });
        return;
    }
    for (let sequence = 0; sequence < maximAttachments.length; sequence++) {
        const document = maximAttachments[sequence];
        const pdfText = document.text;
        const template = (0, outgoingInvoiceExtractionService_1.parseMaximOutgoingInvoiceTemplate)(pdfText);
        const extracted = (0, outgoingInvoiceExtractionService_1.mergeMaximTemplateExtraction)(template && (template.confidence ?? 0) >= 0.8
            ? template
            : await (0, outgoingInvoiceAiService_1.extractOutgoingInvoiceFields)({
                subject: message.subject,
                bodyText: message.bodyText,
                to: message.to,
                pdfText,
            }), pdfText);
        const customerName = extracted.customerName
            || (0, outgoingInvoiceExtractionService_1.guessCustomerFromEmailTo)(message.to)
            || null;
        const invoiceDate = (0, outgoingInvoiceExtractionService_1.parseOutgoingDateString)(extracted.invoiceDate);
        const dueDate = (0, outgoingInvoiceExtractionService_1.parseOutgoingDateString)(extracted.dueDate);
        const totalAmount = extracted.totalAmount != null ? new library_1.Decimal(extracted.totalAmount) : null;
        const arStatus = (0, outgoingInvoiceExtractionService_1.deriveOutgoingInvoiceStatus)({
            dueDate,
            totalAmount: totalAmount != null ? Number(totalAmount) : null,
        });
        const invoice = await prisma_1.prisma.outgoingInvoice.create({
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
                subtotal: extracted.subtotal != null ? new library_1.Decimal(extracted.subtotal) : null,
                taxAmount: extracted.taxAmount != null ? new library_1.Decimal(extracted.taxAmount) : null,
                totalAmount,
                currency: extracted.currency || 'CAD',
                orderNumber: extracted.orderNumber || null,
                supplierNumber: extracted.supplierNumber || null,
                projectName: extracted.projectName || null,
                paymentTerms: extracted.paymentTerms || null,
                extractedData: extracted,
                searchText: (0, outgoingInvoiceAiService_1.buildOutgoingInvoiceSearchText)([
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
        });
        const { meta, buffer } = pdfBuffers[document.attachmentIndex];
        const blobName = `outgoing-invoices/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${meta.filename.replace(/[^\w.-]+/g, '_')}`;
        await (0, blobStorageService_1.uploadBufferToBlob)(blobName, buffer, meta.mimeType || 'application/pdf');
        await prisma_1.prisma.outgoingInvoiceAttachment.create({
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
        });
    }
    const labelId = await getOutgoingProcessedLabelId();
    await (0, invoiceComposioGmailService_1.markGmailMessageOutgoingProcessed)(message.messageId, labelId);
    await prisma_1.prisma.outgoingInvoice.updateMany({
        where: { gmailMessageId: message.messageId },
        data: { gmailLabeledAt: new Date() },
    });
    await finalizeJob(jobId, { status: 'COMPLETED' });
}
async function processOneIngestionJob() {
    if (!(0, invoiceComposioClient_1.isInvoiceComposioConfigured)())
        return;
    const job = await lockNextIngestionJob();
    if (!job)
        return;
    try {
        await processIngestionJob(job.id, job.gmailMessageId);
        console.info(JSON.stringify({
            event: 'outgoing_invoice_processed',
            jobId: job.id,
            gmailMessageId: job.gmailMessageId,
        }));
    }
    catch (error) {
        const attempts = job.attempts;
        const exhausted = attempts >= job.maxAttempts;
        const shouldRetry = !exhausted && (0, composioEmailService_1.isTransientComposioError)(error);
        const status = shouldRetry ? 'RETRYING' : 'FAILED';
        const nextAttemptAt = shouldRetry ? new Date(Date.now() + computeOutgoingInvoiceBackoffMs(attempts)) : job.nextAttemptAt;
        await prisma_1.prisma.outgoingInvoiceIngestionJob.update({
            where: { id: job.id },
            data: {
                status,
                nextAttemptAt,
                processingLockedAt: null,
                lastErrorMessage: error instanceof Error ? error.message : String(error),
            },
        });
        console.error(JSON.stringify({
            event: 'outgoing_invoice_failed',
            jobId: job.id,
            gmailMessageId: job.gmailMessageId,
            attempt: attempts,
            status,
            error: error instanceof Error ? error.message : String(error),
        }));
    }
}
let workerIntervalRef = null;
let syncIntervalRef = null;
async function pollSentOutgoingInvoiceEmails() {
    if (!(0, invoiceComposioClient_1.isInvoiceComposioConfigured)())
        return { enqueued: 0, skipped: 0, configured: false };
    const ids = await (0, invoiceComposioGmailService_1.fetchSentOutgoingInvoiceCandidateIds)(25);
    let enqueued = 0;
    let skipped = 0;
    for (const gmailMessageId of ids) {
        const result = await enqueueOutgoingInvoiceJob({ gmailMessageId });
        if (result.enqueued)
            enqueued += 1;
        else
            skipped += 1;
    }
    await prisma_1.prisma.outgoingInvoiceSyncCursor.update({
        where: { id: 'default' },
        data: { lastSyncedAt: new Date() },
    }).catch(async () => {
        await prisma_1.prisma.outgoingInvoiceSyncCursor.create({
            data: { id: 'default', lastSyncedAt: new Date() },
        });
    });
    return { enqueued, skipped, scanned: ids.length, configured: true };
}
async function processOutgoingInvoiceQueue(limit = 5) {
    if (!(0, invoiceComposioClient_1.isInvoiceComposioConfigured)())
        return { processed: 0, completed: 0, failed: 0, ignored: 0 };
    const lockExpiredBefore = new Date(Date.now() - env_1.env.OUTGOING_INVOICE_LOCK_TTL_MS);
    let processed = 0;
    let completed = 0;
    let failed = 0;
    let ignored = 0;
    for (let i = 0; i < limit; i++) {
        const job = await prisma_1.prisma.outgoingInvoiceIngestionJob.findFirst({
            where: {
                OR: [
                    { status: { in: ['PENDING', 'RETRYING'] } },
                    { status: 'PROCESSING', processingLockedAt: { lt: lockExpiredBefore } },
                ],
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
        });
        if (!job)
            break;
        await processOneIngestionJob();
        processed += 1;
        const updated = await prisma_1.prisma.outgoingInvoiceIngestionJob.findUnique({
            where: { id: job.id },
            select: { status: true },
        });
        if (updated?.status === 'COMPLETED')
            completed += 1;
        else if (updated?.status === 'FAILED')
            failed += 1;
        else if (updated?.status === 'IGNORED')
            ignored += 1;
    }
    return { processed, completed, failed, ignored };
}
async function getOutgoingInvoicePipelineStatus() {
    const configured = (0, invoiceComposioClient_1.isInvoiceComposioConfigured)();
    const [pendingJobs, failedJobs, ignoredJobs, invoiceCount, recentFailed] = await Promise.all([
        prisma_1.prisma.outgoingInvoiceIngestionJob.count({ where: { status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] } } }),
        prisma_1.prisma.outgoingInvoiceIngestionJob.count({ where: { status: 'FAILED' } }),
        prisma_1.prisma.outgoingInvoiceIngestionJob.count({ where: { status: 'IGNORED' } }),
        prisma_1.prisma.outgoingInvoice.count(),
        prisma_1.prisma.outgoingInvoiceIngestionJob.findMany({
            where: { status: 'FAILED' },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: { gmailMessageId: true, lastErrorMessage: true, updatedAt: true },
        }),
    ]);
    const cursor = await prisma_1.prisma.outgoingInvoiceSyncCursor.findUnique({ where: { id: 'default' } });
    return {
        configured,
        enabled: env_1.env.COMPOSIO_INVOICE_ENABLED,
        hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
        hasAzureOcr: Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY),
        pendingJobs,
        failedJobs,
        ignoredJobs,
        invoiceCount,
        recentFailed,
        composioTriggerId: cursor?.composioTriggerId ?? null,
        lastSyncedAt: cursor?.lastSyncedAt?.toISOString() ?? null,
    };
}
async function bootstrapOutgoingInvoiceIntegration() {
    if (!(0, invoiceComposioClient_1.isInvoiceComposioConfigured)()) {
        throw new Error('Invoice Composio integration is not configured');
    }
    const identity = (0, invoiceComposioClient_1.resolveInvoiceInboxIdentity)();
    const labelId = await (0, invoiceComposioGmailService_1.ensureProcessedLabel)(env_1.env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL);
    const { triggerId } = await (0, invoiceComposioGmailService_1.setupOutgoingInvoiceSentTrigger)();
    await prisma_1.prisma.outgoingInvoiceSyncCursor.upsert({
        where: { id: 'default' },
        update: {
            processedLabelId: labelId,
            processedLabelName: env_1.env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL,
            composioTriggerId: triggerId,
            connectedAccountId: identity.connectedAccountId,
        },
        create: {
            id: 'default',
            processedLabelId: labelId,
            processedLabelName: env_1.env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL,
            composioTriggerId: triggerId,
            connectedAccountId: identity.connectedAccountId,
        },
    });
    return { triggerId, processedLabelId: labelId };
}
async function resolveOutgoingTriggerId() {
    const cursor = await prisma_1.prisma.outgoingInvoiceSyncCursor.findUnique({
        where: { id: 'default' },
        select: { composioTriggerId: true },
    });
    return cursor?.composioTriggerId ?? null;
}
function startOutgoingInvoiceWorker() {
    if (!env_1.env.COMPOSIO_INVOICE_ENABLED)
        return;
    if (!(0, invoiceComposioClient_1.isInvoiceComposioConfigured)()) {
        console.warn('[outgoing-invoice] worker disabled: COMPOSIO_INVOICE_* env vars not fully configured');
        return;
    }
    if (!workerIntervalRef) {
        workerIntervalRef = setInterval(() => {
            processOneIngestionJob().catch((error) => {
                console.error('[outgoing-invoice] worker tick failed', error);
            });
        }, Math.max(2000, env_1.env.OUTGOING_INVOICE_POLL_INTERVAL_MS));
    }
    if (!syncIntervalRef) {
        void pollSentOutgoingInvoiceEmails().catch((error) => {
            console.error('[outgoing-invoice] initial sync poll failed', error);
        });
        syncIntervalRef = setInterval(() => {
            pollSentOutgoingInvoiceEmails().catch((error) => {
                console.error('[outgoing-invoice] sync poll failed', error);
            });
        }, Math.max(60000, env_1.env.OUTGOING_INVOICE_SYNC_POLL_MS));
    }
}
var incomingInvoiceIngestionService_1 = require("./incomingInvoiceIngestionService");
Object.defineProperty(exports, "extractGmailMessageIdFromTriggerPayload", { enumerable: true, get: function () { return incomingInvoiceIngestionService_1.extractGmailMessageIdFromTriggerPayload; } });
Object.defineProperty(exports, "extractGmailThreadIdFromTriggerPayload", { enumerable: true, get: function () { return incomingInvoiceIngestionService_1.extractGmailThreadIdFromTriggerPayload; } });
