"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const composioClient_1 = require("../integrations/composio/composioClient");
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.post('/gmail/connect-link', async (req, res, next) => {
    try {
        if (!env_1.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID) {
            return res.status(500).json({ error: 'COMPOSIO_GMAIL_AUTH_CONFIG_ID is not configured' });
        }
        const userId = req.user.id;
        const composioUserId = `maxim-user:${userId}`;
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { composioUserId },
        });
        const composio = (0, composioClient_1.getComposioClient)();
        const link = await composio.connectedAccounts.link(composioUserId, env_1.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID, {
            callbackUrl: env_1.env.COMPOSIO_CALLBACK_URL || undefined,
        });
        res.json({ redirectUrl: link.redirectUrl });
    }
    catch (error) {
        next(error);
    }
});
router.post('/gmail/sync', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const connectedAccountId = String(req.body?.connectedAccountId || '');
        const composioUserId = String(req.body?.composioUserId || `maxim-user:${userId}`);
        if (!connectedAccountId)
            return res.status(400).json({ error: 'connectedAccountId is required' });
        const composio = (0, composioClient_1.getComposioClient)();
        const account = await composio.connectedAccounts.get(connectedAccountId);
        const toolkit = String(account?.toolkit?.slug || '').toLowerCase();
        if (toolkit !== 'gmail')
            return res.status(400).json({ error: 'Connected account is not Gmail' });
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { composioUserId },
        });
        await prisma_1.prisma.composioConnectedAccount.upsert({
            where: { userId_toolkit: { userId, toolkit: 'gmail' } },
            update: {
                connectedAccountId,
                status: String(account.status || 'PENDING'),
                authConfigId: String(account.authConfig?.id || env_1.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID),
                lastSyncedAt: new Date(),
            },
            create: {
                userId,
                toolkit: 'gmail',
                connectedAccountId,
                status: String(account.status || 'PENDING'),
                authConfigId: String(account.authConfig?.id || env_1.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID),
                lastSyncedAt: new Date(),
            },
        });
        res.json({
            connectedAccountId,
            composioUserId,
            status: account.status || 'UNKNOWN',
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
