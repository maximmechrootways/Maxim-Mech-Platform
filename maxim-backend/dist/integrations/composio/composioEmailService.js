"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTransientComposioError = exports.PermanentSendError = void 0;
exports.sendNotificationEmailViaComposio = sendNotificationEmailViaComposio;
const prisma_1 = require("../../lib/prisma");
const env_1 = require("../../config/env");
const composioClient_1 = require("./composioClient");
class PermanentSendError extends Error {
    constructor() {
        super(...arguments);
        this.code = 'PERMANENT_SEND_ERROR';
    }
}
exports.PermanentSendError = PermanentSendError;
const isTransientComposioError = (error) => {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (message.includes('timeout') ||
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('network') ||
        message.includes('temporar'));
};
exports.isTransientComposioError = isTransientComposioError;
async function resolveSenderIdentity() {
    if (env_1.env.COMPOSIO_SENDER_CONNECTED_ACCOUNT_ID && env_1.env.COMPOSIO_SENDER_USER_ID) {
        return {
            connectedAccountId: env_1.env.COMPOSIO_SENDER_CONNECTED_ACCOUNT_ID,
            composioUserId: env_1.env.COMPOSIO_SENDER_USER_ID,
        };
    }
    const fallback = await prisma_1.prisma.composioConnectedAccount.findFirst({
        where: {
            toolkit: 'gmail',
        },
        orderBy: { updatedAt: 'desc' },
        include: {
            user: {
                select: { id: true, composioUserId: true },
            },
        },
    });
    if (!fallback) {
        throw new Error('No Gmail sender configured. Set COMPOSIO_SENDER_CONNECTED_ACCOUNT_ID + COMPOSIO_SENDER_USER_ID, or connect a Gmail account in-app.');
    }
    return {
        connectedAccountId: fallback.connectedAccountId,
        composioUserId: fallback.user.composioUserId || `maxim-user:${fallback.user.id}`,
    };
}
async function executeGmailSend(input) {
    const sender = await resolveSenderIdentity();
    const composio = (0, composioClient_1.getComposioClient)();
    const liveAccount = await composio.connectedAccounts.get(sender.connectedAccountId);
    if (liveAccount.status !== 'ACTIVE') {
        throw new PermanentSendError(`Sender connected account is not active (status=${liveAccount.status || 'unknown'})`);
    }
    const result = await composio.tools.execute('GMAIL_SEND_EMAIL', {
        userId: sender.composioUserId,
        connectedAccountId: sender.connectedAccountId,
        version: env_1.env.COMPOSIO_GMAIL_TOOLKIT_VERSION,
        arguments: {
            recipient_email: input.to,
            subject: input.subject,
            body: input.html || input.text || '',
            is_html: Boolean(input.html),
            ...(env_1.env.EMAIL_FROM ? { from_email: env_1.env.EMAIL_FROM } : {}),
        },
    });
    const resultData = result?.data || {};
    const providerMessageId = resultData?.id || resultData?.message_id || resultData?.messageId || null;
    return { sent: true, providerMessageId };
}
async function sendNotificationEmailViaComposio(input) {
    try {
        const { providerMessageId } = await executeGmailSend({
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html,
        });
        await prisma_1.prisma.notificationEmailDelivery.update({
            where: { id: input.deliveryId },
            data: {
                status: 'SENT',
                sentAt: new Date(),
                providerMessageId: providerMessageId ?? undefined,
                processingLockedAt: null,
                lastErrorCode: null,
                lastErrorMessage: null,
                skipReason: null,
            },
        });
        return { sent: true, providerMessageId };
    }
    catch (error) {
        if (error instanceof PermanentSendError)
            throw error;
        if ((0, exports.isTransientComposioError)(error))
            throw error;
        throw new PermanentSendError(error instanceof Error ? error.message : 'Permanent Composio send failure');
    }
}
