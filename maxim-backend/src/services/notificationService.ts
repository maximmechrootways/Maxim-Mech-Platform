import { prisma } from '../lib/prisma'
import { enqueueNotificationEmailJob } from './notificationEmailQueue'
import type { NotificationPreferenceKey } from './uiPreferencesService'

function map(r: any) {
    return {
        id: r.id,
        title: r.title,
        body: r.body,
        type: r.type,
        linkTo: r.linkTo ?? undefined,
        read: r.read,
        readAt: r.readAt?.toISOString?.() ?? undefined,
        createdAt: r.createdAt?.toISOString?.() ?? undefined,
    }
}

export async function listForUser(userId: string, query: { unreadOnly?: string; limit?: number }) {
    const where: any = { userId }
    if (query.unreadOnly === 'true') where.read = false
    const limit = Math.min(Number(query.limit) || 50, 100)
    const list = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
    })
    return list.map(map)
}

export async function markRead(id: string, userId: string) {
    const n = await prisma.notification.findFirst({ where: { id, userId } })
    if (!n) throw { status: 404, message: 'Notification not found' }
    const r = await prisma.notification.update({
        where: { id },
        data: { read: true, readAt: new Date() },
    })
    return map(r)
}

export async function markAllRead(userId: string) {
    await prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true, readAt: new Date() },
    })
    return { message: 'OK' }
}

export async function getEmailPreference(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { emailNotificationsEnabled: true },
    })
    if (!user) throw { status: 404, message: 'User not found' }
    return { emailEnabled: user.emailNotificationsEnabled }
}

export async function setEmailPreference(userId: string, emailEnabled: boolean) {
    const updated = await prisma.user.update({
        where: { id: userId },
        data: { emailNotificationsEnabled: emailEnabled },
        select: { emailNotificationsEnabled: true },
    })
    return { emailEnabled: updated.emailNotificationsEnabled }
}

/** Internal: create a notification (e.g. from backend when certificate expires, form submitted, etc.) */
export async function createNotification(data: {
    userId: string
    title: string
    body: string
    type?: string
    linkTo?: string
    /** If true, do not enqueue a notification email (in-app / bell only). */
    skipEmail?: boolean
    /**
     * Which per-user email toggle must be on to send the email (see User.uiPreferences.notificationPreferences).
     * Required when skipEmail is not true.
     */
    emailPreferenceKey?: NotificationPreferenceKey
}) {
    if (!data.skipEmail && !data.emailPreferenceKey) {
        throw new Error('createNotification: emailPreferenceKey is required unless skipEmail is true')
    }
    const r = await prisma.notification.create({
        data: {
            userId: data.userId,
            title: data.title,
            body: data.body,
            type: data.type || 'info',
            linkTo: data.linkTo ?? undefined,
        },
    })
    if (!data.skipEmail && data.emailPreferenceKey) {
        await enqueueNotificationEmailJob({
            notificationId: r.id,
            userId: r.userId,
            title: r.title,
            body: r.body,
            linkTo: r.linkTo ?? undefined,
            emailPreferenceKey: data.emailPreferenceKey,
        }).catch((error) => {
            console.error('notification_email_enqueue_failed', {
                notificationId: r.id,
                userId: r.userId,
                error: error instanceof Error ? error.message : String(error),
            })
        })
    }
    return map(r)
}

const FRANK_REMINDER_TITLE = 'New Reminder from Frank'

/**
 * In-app only; skips duplicate pushes when the agent retries or calls the same tool twice in a short window.
 */
export async function createFrankHRTodoNotificationIfNotDuplicate(
    data: { userId: string; body: string; linkTo?: string },
    options?: { dedupeWindowMs?: number }
) {
    const windowMs = options?.dedupeWindowMs ?? 2 * 60 * 1000
    const since = new Date(Date.now() - windowMs)
    const existing = await prisma.notification.findFirst({
        where: {
            userId: data.userId,
            title: FRANK_REMINDER_TITLE,
            body: data.body,
            createdAt: { gte: since },
        },
    })
    if (existing) return { created: false as const, notification: map(existing) }
    const notification = await createNotification({
        userId: data.userId,
        title: FRANK_REMINDER_TITLE,
        body: data.body,
        type: 'reminder',
        linkTo: data.linkTo ?? '/hr/todo',
        skipEmail: true,
    })
    return { created: true as const, notification }
}

/** Notify all owner and HR users (e.g. when injury report is created). */
export async function notifyOwnerAndHr(options: {
    title: string
    body: string
    type?: string
    linkTo?: string
    emailPreferenceKey: NotificationPreferenceKey
}) {
    const users = await prisma.user.findMany({
        where: { role: { in: ['owner', 'hr'] }, isActive: true },
        select: { id: true },
    })
    for (const u of users) {
        await createNotification({
            userId: u.id,
            title: options.title,
            body: options.body,
            type: options.type || 'info',
            linkTo: options.linkTo,
            emailPreferenceKey: options.emailPreferenceKey,
        }).catch(() => {})
    }
}
