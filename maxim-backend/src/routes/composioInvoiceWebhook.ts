import { Router } from 'express'
import { env } from '../config/env'
import { getInvoiceComposioClient } from '../integrations/composio-invoice/invoiceComposioClient'
import { prisma } from '../lib/prisma'
import {
    enqueueIncomingInvoiceJob,
    extractGmailMessageIdFromTriggerPayload,
    extractGmailThreadIdFromTriggerPayload,
} from '../services/incomingInvoiceIngestionService'
import {
    enqueueOutgoingInvoiceJob,
    resolveOutgoingTriggerId,
} from '../services/outgoingInvoiceIngestionService'

const router = Router()

function extractTriggerIdFromPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null
    const root = payload as Record<string, unknown>
    const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root
    const triggerId = String(
        data.trigger_id
        || data.triggerId
        || root.trigger_id
        || root.triggerId
        || '',
    ).trim()
    return triggerId || null
}

router.post('/', async (req, res) => {
    try {
        if (!env.COMPOSIO_INVOICE_WEBHOOK_SECRET) {
            return res.status(500).json({ error: 'COMPOSIO_INVOICE_WEBHOOK_SECRET is not configured' })
        }
        const composio = getInvoiceComposioClient()
        const verification = await composio.triggers.verifyWebhook({
            id: req.header('webhook-id') || '',
            payload: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
            signature: req.header('webhook-signature') || '',
            timestamp: req.header('webhook-timestamp') || '',
            secret: env.COMPOSIO_INVOICE_WEBHOOK_SECRET,
            tolerance: env.COMPOSIO_WEBHOOK_TOLERANCE_SECONDS,
        })

        const payload = (verification as { payload?: unknown }).payload || req.body || {}
        const gmailMessageId = extractGmailMessageIdFromTriggerPayload(payload)
        const triggerId = extractTriggerIdFromPayload(payload)

        const [outgoingTriggerId, incomingCursor] = await Promise.all([
            resolveOutgoingTriggerId(),
            prisma.incomingInvoiceSyncCursor.findUnique({
                where: { id: 'default' },
                select: { composioTriggerId: true },
            }),
        ])

        const isOutgoing = Boolean(triggerId && outgoingTriggerId && triggerId === outgoingTriggerId)
        const isIncoming = Boolean(
            gmailMessageId
            && (!triggerId || !outgoingTriggerId || triggerId !== outgoingTriggerId)
            && (!incomingCursor?.composioTriggerId || !triggerId || triggerId === incomingCursor.composioTriggerId),
        )

        if (gmailMessageId && isOutgoing) {
            await enqueueOutgoingInvoiceJob({
                gmailMessageId,
                gmailThreadId: extractGmailThreadIdFromTriggerPayload(payload),
                triggerPayload: payload,
            })
        } else if (gmailMessageId && (isIncoming || !outgoingTriggerId)) {
            await enqueueIncomingInvoiceJob({
                gmailMessageId,
                gmailThreadId: extractGmailThreadIdFromTriggerPayload(payload),
                triggerPayload: payload,
            })
        }

        console.info(JSON.stringify({
            event: 'composio_invoice_webhook_received',
            gmailMessageId,
            triggerId,
            route: isOutgoing ? 'outgoing' : isIncoming ? 'incoming' : 'none',
            enqueued: Boolean(gmailMessageId && (isOutgoing || isIncoming || !outgoingTriggerId)),
        }))

        res.status(200).json({ ok: true })
    } catch (error) {
        console.error('composio invoice webhook verification failed', error)
        res.status(401).json({ error: 'Invalid webhook signature' })
    }
})

export default router
