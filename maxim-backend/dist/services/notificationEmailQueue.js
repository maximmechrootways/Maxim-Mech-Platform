"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasAllEmailNotificationTogglesDisabled = hasAllEmailNotificationTogglesDisabled;
exports.isNotificationEmailAllowedByPreferences = isNotificationEmailAllowedByPreferences;
exports.computeBackoffMs = computeBackoffMs;
exports.enqueueNotificationEmailJob = enqueueNotificationEmailJob;
exports.enqueueSystemEmailJob = enqueueSystemEmailJob;
exports.buildNotificationEmailIdempotencyKey = buildNotificationEmailIdempotencyKey;
exports.startNotificationEmailWorker = startNotificationEmailWorker;
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
const composioEmailService_1 = require("../integrations/composio/composioEmailService");
const notificationEmailMetrics_1 = require("./notificationEmailMetrics");
const notificationEmailTemplate_1 = require("./notificationEmailTemplate");
const uiPreferencesService_1 = require("./uiPreferencesService");
/** @deprecated Use isNotificationEmailAllowedByPreferences — kept for tests/migrations clarity */
function hasAllEmailNotificationTogglesDisabled(uiPreferences) {
    const prefs = (0, uiPreferencesService_1.normalizeUiPreferences)(uiPreferences).notificationPreferences;
    return Object.values(prefs).every((enabled) => !enabled);
}
/**
 * Whether an email for this notification category should be sent, given stored uiPreferences.
 * `category` null = legacy deliveries (before per-toggle gating): allow if any toggle is still on.
 */
function isNotificationEmailAllowedByPreferences(uiPreferences, category) {
    const prefs = (0, uiPreferencesService_1.normalizeUiPreferences)(uiPreferences).notificationPreferences;
    if (category === null) {
        return Object.values(prefs).some(Boolean);
    }
    if (!uiPreferencesService_1.NOTIFICATION_PREFERENCE_KEY_SET.has(category)) {
        return false;
    }
    return Boolean(prefs[category]);
}
function computeBackoffMs(attempt) {
    const exponential = env_1.env.NOTIFICATION_EMAIL_BACKOFF_BASE_MS * (2 ** Math.max(0, attempt - 1));
    return Math.min(exponential, 5 * 60 * 1000);
}
async function enqueueNotificationEmailJob(input) {
    const idempotencyKey = buildNotificationEmailIdempotencyKey(input.notificationId);
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, emailNotificationsEnabled: true, uiPreferences: true },
    });
    const categoryAllowed = isNotificationEmailAllowedByPreferences(user?.uiPreferences, input.emailPreferenceKey);
    if (!user?.email || !user.emailNotificationsEnabled || !categoryAllowed) {
        notificationEmailMetrics_1.notificationEmailMetrics.increment('skipped');
        return { enqueued: false, reason: 'opted_out_or_missing_email_or_preferences_disabled' };
    }
    const content = (0, notificationEmailTemplate_1.buildNotificationEmail)({
        title: input.title,
        message: input.body,
        ctaUrl: input.linkTo,
    });
    await prisma_1.prisma.notificationEmailDelivery.upsert({
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
            maxAttempts: env_1.env.NOTIFICATION_EMAIL_MAX_ATTEMPTS,
            status: 'PENDING',
            nextAttemptAt: new Date(),
        },
    });
    return { enqueued: true };
}
/**
 * Enqueue a system email using the same delivery worker/retry pipeline as notifications,
 * but with an explicit recipient (no user opt-out gating on destination email).
 */
async function enqueueSystemEmailJob(input) {
    await prisma_1.prisma.notificationEmailDelivery.upsert({
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
            maxAttempts: env_1.env.NOTIFICATION_EMAIL_MAX_ATTEMPTS,
            status: 'PENDING',
            nextAttemptAt: new Date(),
        },
    });
    return { enqueued: true };
}
function buildNotificationEmailIdempotencyKey(notificationId) {
    return `notif:${notificationId}:email`;
}
async function lockNextDelivery() {
    const now = new Date();
    const lockExpiredBefore = new Date(Date.now() - env_1.env.NOTIFICATION_EMAIL_LOCK_TTL_MS);
    const candidate = await prisma_1.prisma.notificationEmailDelivery.findFirst({
        where: {
            status: { in: ['PENDING', 'RETRYING'] },
            nextAttemptAt: { lte: now },
            OR: [{ processingLockedAt: null }, { processingLockedAt: { lt: lockExpiredBefore } }],
        },
        orderBy: { createdAt: 'asc' },
    });
    if (!candidate)
        return null;
    const claim = await prisma_1.prisma.notificationEmailDelivery.updateMany({
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
    });
    if (!claim.count)
        return null;
    return prisma_1.prisma.notificationEmailDelivery.findUnique({ where: { id: candidate.id } });
}
async function processOne() {
    const delivery = await lockNextDelivery();
    if (!delivery)
        return;
    try {
        const isFeedbackSystemEmail = String(delivery.notificationId || '').startsWith('feedback:');
        const isTestDigestEmail = String(delivery.notificationId || '').startsWith('digest:test:');
        const isInviteLoginCodeEmail = String(delivery.notificationId || '').startsWith('invite:');
        const bypassCategoryGate = isFeedbackSystemEmail || isTestDigestEmail || isInviteLoginCodeEmail;
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: delivery.userId },
            select: { email: true, emailNotificationsEnabled: true, isActive: true, uiPreferences: true },
        });
        const rawKey = delivery.emailPreferenceKey;
        let category = null;
        let invalidStoredKey = false;
        if (rawKey && typeof rawKey === 'string') {
            if (uiPreferencesService_1.NOTIFICATION_PREFERENCE_KEY_SET.has(rawKey)) {
                category = rawKey;
            }
            else {
                invalidStoredKey = true;
            }
        }
        const categoryAllowed = invalidStoredKey
            ? false
            : isNotificationEmailAllowedByPreferences(user?.uiPreferences, category);
        const missingBasics = isInviteLoginCodeEmail
            ? (!delivery.toEmail?.trim() || !user?.isActive)
            : (!user?.email || !user.emailNotificationsEnabled || !user.isActive);
        const shouldSkipForUserPrefs = bypassCategoryGate
            ? missingBasics
            : missingBasics || !categoryAllowed;
        if (shouldSkipForUserPrefs) {
            await prisma_1.prisma.notificationEmailDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: 'SKIPPED',
                    skipReason: 'opted_out_or_missing_email_or_preferences_disabled',
                    processingLockedAt: null,
                },
            });
            notificationEmailMetrics_1.notificationEmailMetrics.increment('skipped');
            console.info(JSON.stringify({
                event: 'notification_email_skipped',
                deliveryId: delivery.id,
                notificationId: delivery.notificationId,
                userId: delivery.userId,
                attempt: delivery.attempts,
            }));
            return;
        }
        await (0, composioEmailService_1.sendNotificationEmailViaComposio)({
            deliveryId: delivery.id,
            notificationId: delivery.notificationId,
            userId: delivery.userId,
            to: delivery.toEmail,
            subject: delivery.subject,
            text: delivery.bodyText || undefined,
            html: delivery.bodyHtml || undefined,
        });
        notificationEmailMetrics_1.notificationEmailMetrics.increment('sent');
        console.info(JSON.stringify({
            event: 'notification_email_sent',
            deliveryId: delivery.id,
            notificationId: delivery.notificationId,
            userId: delivery.userId,
            attempt: delivery.attempts,
        }));
    }
    catch (error) {
        const attempts = delivery.attempts;
        const exhausted = attempts >= delivery.maxAttempts;
        const isPermanent = error instanceof composioEmailService_1.PermanentSendError;
        const shouldRetry = !exhausted && !isPermanent;
        const status = shouldRetry ? 'RETRYING' : 'FAILED';
        const nextAttemptAt = shouldRetry ? new Date(Date.now() + computeBackoffMs(attempts)) : null;
        await prisma_1.prisma.notificationEmailDelivery.update({
            where: { id: delivery.id },
            data: {
                status,
                nextAttemptAt: nextAttemptAt ?? undefined,
                processingLockedAt: null,
                lastErrorCode: isPermanent ? 'PERMANENT' : 'TRANSIENT',
                lastErrorMessage: error instanceof Error ? error.message : 'Unknown send error',
            },
        });
        if (shouldRetry)
            notificationEmailMetrics_1.notificationEmailMetrics.increment('retried');
        else
            notificationEmailMetrics_1.notificationEmailMetrics.increment('failed');
        console.error(JSON.stringify({
            event: 'notification_email_failed',
            deliveryId: delivery.id,
            notificationId: delivery.notificationId,
            userId: delivery.userId,
            attempt: attempts,
            status,
            errorCode: isPermanent ? 'PERMANENT' : 'TRANSIENT',
            error: error instanceof Error ? error.message : String(error),
        }));
    }
}
let intervalRef = null;
function startNotificationEmailWorker() {
    if (!env_1.env.NOTIFICATION_EMAIL_ENABLED)
        return;
    if (intervalRef)
        return;
    intervalRef = setInterval(() => {
        processOne().catch((error) => {
            console.error('notification_email_worker_tick_failed', error);
        });
    }, Math.max(1000, env_1.env.NOTIFICATION_EMAIL_POLL_INTERVAL_MS));
}
