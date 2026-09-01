"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const env_1 = require("../config/env");
const invoiceComposioClient_1 = require("../integrations/composio-invoice/invoiceComposioClient");
const prisma_1 = require("../lib/prisma");
const incomingInvoiceIngestionService_1 = require("../services/incomingInvoiceIngestionService");
const outgoingInvoiceIngestionService_1 = require("../services/outgoingInvoiceIngestionService");
const router = (0, express_1.Router)();
function extractTriggerIdFromPayload(payload) {
    if (!payload || typeof payload !== 'object')
        return null;
    const root = payload;
    const data = root.data && typeof root.data === 'object' ? root.data : root;
    const triggerId = String(data.trigger_id
        || data.triggerId
        || root.trigger_id
        || root.triggerId
        || '').trim();
    return triggerId || null;
}
router.post('/', async (req, res) => {
    try {
        if (!env_1.env.COMPOSIO_INVOICE_WEBHOOK_SECRET) {
            return res.status(500).json({ error: 'COMPOSIO_INVOICE_WEBHOOK_SECRET is not configured' });
        }
        const composio = (0, invoiceComposioClient_1.getInvoiceComposioClient)();
        const verification = await composio.triggers.verifyWebhook({
            id: req.header('webhook-id') || '',
            payload: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
            signature: req.header('webhook-signature') || '',
            timestamp: req.header('webhook-timestamp') || '',
            secret: env_1.env.COMPOSIO_INVOICE_WEBHOOK_SECRET,
            tolerance: env_1.env.COMPOSIO_WEBHOOK_TOLERANCE_SECONDS,
        });
        const payload = verification.payload || req.body || {};
        const gmailMessageId = (0, incomingInvoiceIngestionService_1.extractGmailMessageIdFromTriggerPayload)(payload);
        const triggerId = extractTriggerIdFromPayload(payload);
        const [outgoingTriggerId, incomingCursor] = await Promise.all([
            (0, outgoingInvoiceIngestionService_1.resolveOutgoingTriggerId)(),
            prisma_1.prisma.incomingInvoiceSyncCursor.findUnique({
                where: { id: 'default' },
                select: { composioTriggerId: true },
            }),
        ]);
        const isOutgoing = Boolean(triggerId && outgoingTriggerId && triggerId === outgoingTriggerId);
        const isIncoming = Boolean(gmailMessageId
            && (!triggerId || !outgoingTriggerId || triggerId !== outgoingTriggerId)
            && (!incomingCursor?.composioTriggerId || !triggerId || triggerId === incomingCursor.composioTriggerId));
        if (gmailMessageId && isOutgoing) {
            await (0, outgoingInvoiceIngestionService_1.enqueueOutgoingInvoiceJob)({
                gmailMessageId,
                gmailThreadId: (0, incomingInvoiceIngestionService_1.extractGmailThreadIdFromTriggerPayload)(payload),
                triggerPayload: payload,
            });
        }
        else if (gmailMessageId && (isIncoming || !outgoingTriggerId)) {
            await (0, incomingInvoiceIngestionService_1.enqueueIncomingInvoiceJob)({
                gmailMessageId,
                gmailThreadId: (0, incomingInvoiceIngestionService_1.extractGmailThreadIdFromTriggerPayload)(payload),
                triggerPayload: payload,
            });
        }
        console.info(JSON.stringify({
            event: 'composio_invoice_webhook_received',
            gmailMessageId,
            triggerId,
            route: isOutgoing ? 'outgoing' : isIncoming ? 'incoming' : 'none',
            enqueued: Boolean(gmailMessageId && (isOutgoing || isIncoming || !outgoingTriggerId)),
        }));
        res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error('composio invoice webhook verification failed', error);
        res.status(401).json({ error: 'Invalid webhook signature' });
    }
});
exports.default = router;
