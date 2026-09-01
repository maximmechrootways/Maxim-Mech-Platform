import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { getComposioClient } from '../integrations/composio/composioClient'
import { prisma } from '../lib/prisma'
import { env } from '../config/env'

const router = Router()

router.use(authenticate)

router.post('/gmail/connect-link', async (req, res, next) => {
    try {
        if (!env.COMPOSIO_GMAIL_AUTH_CONFIG_ID) {
            return res.status(500).json({ error: 'COMPOSIO_GMAIL_AUTH_CONFIG_ID is not configured' })
        }
        const userId = req.user!.id
        const composioUserId = `maxim-user:${userId}`

        await prisma.user.update({
            where: { id: userId },
            data: { composioUserId },
        })

        const composio = getComposioClient()
        const link = await composio.connectedAccounts.link(composioUserId, env.COMPOSIO_GMAIL_AUTH_CONFIG_ID, {
            callbackUrl: env.COMPOSIO_CALLBACK_URL || undefined,
        })

        res.json({ redirectUrl: (link as any).redirectUrl })
    } catch (error) {
        next(error)
    }
})

router.post('/gmail/sync', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const connectedAccountId = String(req.body?.connectedAccountId || '')
        const composioUserId = String(req.body?.composioUserId || `maxim-user:${userId}`)
        if (!connectedAccountId) return res.status(400).json({ error: 'connectedAccountId is required' })

        const composio = getComposioClient()
        const account = await composio.connectedAccounts.get(connectedAccountId)
        const toolkit = String((account as any)?.toolkit?.slug || '').toLowerCase()
        if (toolkit !== 'gmail') return res.status(400).json({ error: 'Connected account is not Gmail' })

        await prisma.user.update({
            where: { id: userId },
            data: { composioUserId },
        })

        await prisma.composioConnectedAccount.upsert({
            where: { userId_toolkit: { userId, toolkit: 'gmail' } },
            update: {
                connectedAccountId,
                status: String((account as any).status || 'PENDING'),
                authConfigId: String((account as any).authConfig?.id || env.COMPOSIO_GMAIL_AUTH_CONFIG_ID),
                lastSyncedAt: new Date(),
            },
            create: {
                userId,
                toolkit: 'gmail',
                connectedAccountId,
                status: String((account as any).status || 'PENDING'),
                authConfigId: String((account as any).authConfig?.id || env.COMPOSIO_GMAIL_AUTH_CONFIG_ID),
                lastSyncedAt: new Date(),
            },
        })

        res.json({
            connectedAccountId,
            composioUserId,
            status: (account as any).status || 'UNKNOWN',
        })
    } catch (error) {
        next(error)
    }
})

export default router
