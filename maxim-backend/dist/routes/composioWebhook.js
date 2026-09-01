"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const composioClient_1 = require("../integrations/composio/composioClient");
const env_1 = require("../config/env");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
router.post('/', async (req, res) => {
    try {
        if (!env_1.env.COMPOSIO_WEBHOOK_SECRET) {
            return res.status(500).json({ error: 'COMPOSIO_WEBHOOK_SECRET is not configured' });
        }
        const composio = (0, composioClient_1.getComposioClient)();
        const verification = await composio.triggers.verifyWebhook({
            id: req.header('webhook-id') || '',
            payload: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
            signature: req.header('webhook-signature') || '',
            timestamp: req.header('webhook-timestamp') || '',
            secret: env_1.env.COMPOSIO_WEBHOOK_SECRET,
            tolerance: env_1.env.COMPOSIO_WEBHOOK_TOLERANCE_SECONDS,
        });
        const payload = verification.payload || {};
        const eventType = String(payload.type || '');
        const connectedAccountId = String(payload?.data?.id || payload?.metadata?.connected_account_id || '');
        const status = String(payload?.data?.status || '');
        if (connectedAccountId) {
            await prisma_1.prisma.composioConnectedAccount.updateMany({
                where: { connectedAccountId },
                data: { status: status || 'FAILED', lastSyncedAt: new Date() },
            });
        }
        console.info(JSON.stringify({
            event: 'composio_webhook_received',
            type: eventType,
            connectedAccountId,
            status,
        }));
        res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error('composio webhook verification failed', error);
        res.status(401).json({ error: 'Invalid webhook signature' });
    }
});
exports.default = router;
