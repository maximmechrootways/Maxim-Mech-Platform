import { prisma } from '../lib/prisma'
import { env } from '../config/env'
import { sendNotificationEmailViaComposio, PermanentSendError } from '../integrations/composio/composioEmailService'
import { notificationEmailMetrics } from './notificationEmailMetrics'
import { buildNotificationEmail } from './notificationEmailTemplate'
import {
    NOTIFICATION_PREFERENCE_KEY_SET,
    normalizeUiPreferences,
    type NotificationPreferenceKey,
} from './uiPreferencesService'

/** @deprecated Use isNotificationEmailAllowedByPreferences — kept for tests/migrations clarity */
export function hasAllEmailNotificationTogglesDisabled(uiPreferences: unknown) {
    const prefs = normalizeUiPreferences(uiPreferences).notificationPreferences
    return Object.values(prefs).every((enabled) => !enabled)
}

/**
 * Whether an email for this notification category should be sent, given stored uiPreferences.
 * `category` null = legacy deliveries (before per-toggle gating): allow if any toggle is still on.
 */
export function isNotificationEmailAllowedByPreferences(
    uiPreferences: unknown,
    category: NotificationPreferenceKey | null,
): boolean {
    const prefs = normalizeUiPreferences(uiPreferences).notificationPreferences
    if (category === null) {
        return Object.values(prefs).some(Boolean)
    }
    if (!NOTIFICATION_PREFERENCE_KEY_SET.has(category)) {
        return false
    }
    return Boolean(prefs[category])
}

export function computeBackoffMs(attempt: number) {
    const exponential = env.NOTIFICATION_EMAIL_BACKOFF_BASE_MS * (2 ** Math.max(0, attempt - 1))
    return Math.min(exponential, 5 * 60 * 1000)
}

export async function enqueueNotificationEmailJob(input: {
    notificationId: string
    userId: string
    title: string
    body: string
    linkTo?: string
    emailPreferenceKey: NotificationPreferenceKey
}) {
    const idempotencyKey = buildNotificationEmailIdempotencyKey(input.notificationId)
    const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, emailNotificationsEnabled: true, uiPreferences: true },
    })
    const categoryAllowed = isNotificationEmailAllowedByPreferences(user?.uiPreferences, input.emailPreferenceKey)
    if (!user?.email || !user.emailNotificationsEnabled || !categoryAllowed) {
        notificationEmailMetrics.increment('skipped')
        return { enqueued: false as const, reason: 'opted_out_or_missing_email_or_preferences_disabled' }
    }

    const content = buildNotificationEmail({
        title: input.title,
        message: input.body,
        ctaUrl: input.linkTo,
    })

    await prisma.notificationEmailDelivery.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
            notificationId: input.notificationId,
            userId: input.userId,
            emailPreferenceKey: input.emailPreferenceKey,
            toEmail: user.email,
            subject: content.subject,
            bodyText: content.text,
            bodyHtml: content.html,
            idempotencyKey,
            maxAttempts: env.NOTIFICATION_EMAIL_MAX_ATTEMPTS,
            status: 'PENDING',
            nextAttemptAt: new Date(),
        },
    })

    return { enqueued: true as const }
}

/**
 * Enqueue a system email using the same delivery worker/retry pipeline as notifications,
 * but with an explicit recipient (no user opt-out gating on destination email).
 */
export async function enqueueSystemEmailJob(input: {
    notificationId: string
    userId: string
    toEmail: string
    subject: string
    bodyText?: string
    bodyHtml?: string
    idempotencyKey: string
    emailPreferenceKey?: NotificationPreferenceKey
}) {
    await prisma.notificationEmailDelivery.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        update: {},
        create: {
            notificationId: input.notificationId,
            userId: input.userId,
            emailPreferenceKey: input.emailPreferenceKey ?? null,
            toEmail: input.toEmail,
            subject: input.subject,
            bodyText: input.bodyText ?? null,
            bodyHtml: input.bodyHtml ?? null,
            idempotencyKey: input.idempotencyKey,
            maxAttempts: env.NOTIFICATION_EMAIL_MAX_ATTEMPTS,
            status: 'PENDING',
            nextAttemptAt: new Date(),
        },
    })

    return { enqueued: true as const }
}

export function buildNotificationEmailIdempotencyKey(notificationId: string) {
    return `notif:${notificationId}:email`
}

async function lockNextDelivery() {
    const now = new Date()
    const lockExpiredBefore = new Date(Date.now() - env.NOTIFICATION_EMAIL_LOCK_TTL_MS)
    const candidate = await prisma.notificationEmailDelivery.findFirst({
        where: {
            status: { in: ['PENDING', 'RETRYING'] },
            nextAttemptAt: { lte: now },
            OR: [{ processingLockedAt: null }, { processingLockedAt: { lt: lockExpiredBefore } }],
        },
        orderBy: { createdAt: 'asc' },
    })
    if (!candidate) return null

    const claim = await prisma.notificationEmailDelivery.updateMany({
        where: {
            id: candidate.id,
            OR: [{ processingLockedAt: null }, { processingLockedAt: { lt: lockExpiredBefore } }],
        },
        data: {
            processingLockedAt: now,
            status: 'PROCESSING',
            attempts: { increment: 1 },
            lastAttemptAt: now,
        },
    })
    if (!claim.count) return null
    return prisma.notificationEmailDelivery.findUnique({ where: { id: candidate.id } })
}

async function processOne() {
    const delivery = await lockNextDelivery()
    if (!delivery) return

    try {
        const isFeedbackSystemEmail = String(delivery.notificationId || '').startsWith('feedback:')
        const isTestDigestEmail = String(delivery.notificationId || '').startsWith('digest:test:')
        const isInviteLoginCodeEmail = String(delivery.notificationId || '').startsWith('invite:')
        const bypassCategoryGate = isFeedbackSystemEmail || isTestDigestEmail || isInviteLoginCodeEmail
        const user = await prisma.user.findUnique({
            where: { id: delivery.userId },
            select: { email: true, emailNotificationsEnabled: true, isActive: true, uiPreferences: true },
        })
        const rawKey = delivery.emailPreferenceKey
        let category: NotificationPreferenceKey | null = null
        let invalidStoredKey = false
        if (rawKey && typeof rawKey === 'string') {
            if (NOTIFICATION_PREFERENCE_KEY_SET.has(rawKey)) {
                category = rawKey as NotificationPreferenceKey
            } else {
                invalidStoredKey = true
            }
        }
        const categoryAllowed = invalidStoredKey
            ? false
            : isNotificationEmailAllowedByPreferences(user?.uiPreferences, category)
        const missingBasics = isInviteLoginCodeEmail
            ? (!delivery.toEmail?.trim() || !user?.isActive)
            : (!user?.email || !user.emailNotificationsEnabled || !user.isActive)
        const shouldSkipForUserPrefs = bypassCategoryGate
            ? missingBasics
            : missingBasics || !categoryAllowed
        if (shouldSkipForUserPrefs) {
            await prisma.notificationEmailDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: 'SKIPPED',
                    skipReason: 'opted_out_or_missing_email_or_preferences_disabled',
                    processingLockedAt: null,
                },
            })
            notificationEmailMetrics.increment('skipped')
            console.info(JSON.stringify({
                event: 'notification_email_skipped',
                deliveryId: delivery.id,
                notificationId: delivery.notificationId,
                userId: delivery.userId,
                attempt: delivery.attempts,
            }))
            return
        }

        await sendNotificationEmailViaComposio({
            deliveryId: delivery.id,
            notificationId: delivery.notificationId,
            userId: delivery.userId,
            to: delivery.toEmail,
            subject: delivery.subject,
            text: delivery.bodyText || undefined,
            html: delivery.bodyHtml || undefined,
        })
        notificationEmailMetrics.increment('sent')
        console.info(JSON.stringify({
            event: 'notification_email_sent',
            deliveryId: delivery.id,
            notificationId: delivery.notificationId,
            userId: delivery.userId,
            attempt: delivery.attempts,
        }))
    } catch (error) {
        const attempts = delivery.attempts
        const exhausted = attempts >= delivery.maxAttempts
        const isPermanent = error instanceof PermanentSendError
        const shouldRetry = !exhausted && !isPermanent
        const status = shouldRetry ? 'RETRYING' : 'FAILED'
        const nextAttemptAt = shouldRetry ? new Date(Date.now() + computeBackoffMs(attempts)) : null

        await prisma.notificationEmailDelivery.update({
            where: { id: delivery.id },
            data: {
                status,
                nextAttemptAt: nextAttemptAt ?? undefined,
                processingLockedAt: null,
                lastErrorCode: isPermanent ? 'PERMANENT' : 'TRANSIENT',
                lastErrorMessage: error instanceof Error ? error.message : 'Unknown send error',
            },
        })

        if (shouldRetry) notificationEmailMetrics.increment('retried')
        else notificationEmailMetrics.increment('failed')

        console.error(JSON.stringify({
            event: 'notification_email_failed',
            deliveryId: delivery.id,
            notificationId: delivery.notificationId,
            userId: delivery.userId,
            attempt: attempts,
            status,
            errorCode: isPermanent ? 'PERMANENT' : 'TRANSIENT',
            error: error instanceof Error ? error.message : String(error),
        }))
    }
}

let intervalRef: NodeJS.Timeout | null = null

export function startNotificationEmailWorker() {
    if (!env.NOTIFICATION_EMAIL_ENABLED) return
    if (intervalRef) return
    intervalRef = setInterval(() => {
        processOne().catch((error) => {
            console.error('notification_email_worker_tick_failed', error)
        })
    }, Math.max(1000, env.NOTIFICATION_EMAIL_POLL_INTERVAL_MS))
}
