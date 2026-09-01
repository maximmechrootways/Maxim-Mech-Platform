import { prisma } from '../../lib/prisma'
import { env } from '../../config/env'
import { getComposioClient } from './composioClient'

export type SendNotificationEmailInput = {
    deliveryId: string
    notificationId: string
    userId: string
    to: string
    subject: string
    text?: string
    html?: string
}

export class PermanentSendError extends Error {
    code = 'PERMANENT_SEND_ERROR'
}

export const isTransientComposioError = (error: unknown) => {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    return (
        message.includes('timeout') ||
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('network') ||
        message.includes('temporar')
    )
}

async function resolveSenderIdentity() {
    if (env.COMPOSIO_SENDER_CONNECTED_ACCOUNT_ID && env.COMPOSIO_SENDER_USER_ID) {
        return {
            connectedAccountId: env.COMPOSIO_SENDER_CONNECTED_ACCOUNT_ID,
            composioUserId: env.COMPOSIO_SENDER_USER_ID,
        }
    }

    const fallback = await prisma.composioConnectedAccount.findFirst({
        where: {
            toolkit: 'gmail',
        },
        orderBy: { updatedAt: 'desc' },
        include: {
            user: {
                select: { id: true, composioUserId: true },
            },
        },
    })

    if (!fallback) {
        throw new Error('No Gmail sender configured. Set COMPOSIO_SENDER_CONNECTED_ACCOUNT_ID + COMPOSIO_SENDER_USER_ID, or connect a Gmail account in-app.')
    }

    return {
        connectedAccountId: fallback.connectedAccountId,
        composioUserId: fallback.user.composioUserId || `maxim-user:${fallback.user.id}`,
    }
}

type GmailSendInput = {
    to: string
    subject: string
    text?: string
    html?: string
}

async function executeGmailSend(input: GmailSendInput) {
    const sender = await resolveSenderIdentity()

    const composio = getComposioClient()
    const liveAccount = await composio.connectedAccounts.get(sender.connectedAccountId)
    if (liveAccount.status !== 'ACTIVE') {
        throw new PermanentSendError(`Sender connected account is not active (status=${liveAccount.status || 'unknown'})`)
    }

    const result = await composio.tools.execute('GMAIL_SEND_EMAIL', {
        userId: sender.composioUserId,
        connectedAccountId: sender.connectedAccountId,
        version: env.COMPOSIO_GMAIL_TOOLKIT_VERSION,
        arguments: {
            recipient_email: input.to,
            subject: input.subject,
            body: input.html || input.text || '',
            is_html: Boolean(input.html),
            ...(env.EMAIL_FROM ? { from_email: env.EMAIL_FROM } : {}),
        },
    })

    const resultData = (result as any)?.data || {}
    const providerMessageId = resultData?.id || resultData?.message_id || resultData?.messageId || null
    return { sent: true as const, providerMessageId }
}

export async function sendNotificationEmailViaComposio(input: SendNotificationEmailInput) {
    try {
        const { providerMessageId } = await executeGmailSend({
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html,
        })

        await prisma.notificationEmailDelivery.update({
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
        })

        return { sent: true as const, providerMessageId }
    } catch (error) {
        if (error instanceof PermanentSendError) throw error
        if (isTransientComposioError(error)) throw error
        throw new PermanentSendError(error instanceof Error ? error.message : 'Permanent Composio send failure')
    }
}
