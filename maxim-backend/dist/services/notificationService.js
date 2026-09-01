"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listForUser = listForUser;
exports.markRead = markRead;
exports.markAllRead = markAllRead;
exports.getEmailPreference = getEmailPreference;
exports.setEmailPreference = setEmailPreference;
exports.createNotification = createNotification;
exports.createFrankHRTodoNotificationIfNotDuplicate = createFrankHRTodoNotificationIfNotDuplicate;
exports.notifyOwnerAndHr = notifyOwnerAndHr;
const prisma_1 = require("../lib/prisma");
const notificationEmailQueue_1 = require("./notificationEmailQueue");
function map(r) {
    return {
        id: r.id,
        title: r.title,
        body: r.body,
        type: r.type,
        linkTo: r.linkTo ?? undefined,
        read: r.read,
        readAt: r.readAt?.toISOString?.() ?? undefined,
        createdAt: r.createdAt?.toISOString?.() ?? undefined,
    };
}
async function listForUser(userId, query) {
    const where = { userId };
    if (query.unreadOnly === 'true')
        where.read = false;
    const limit = Math.min(Number(query.limit) || 50, 100);
    const list = await prisma_1.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
    });
    return list.map(map);
}
async function markRead(id, userId) {
    const n = await prisma_1.prisma.notification.findFirst({ where: { id, userId } });
    if (!n)
        throw { status: 404, message: 'Notification not found' };
    const r = await prisma_1.prisma.notification.update({
        where: { id },
        data: { read: true, readAt: new Date() },
    });
    return map(r);
}
async function markAllRead(userId) {
    await prisma_1.prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true, readAt: new Date() },
    });
    return { message: 'OK' };
}
async function getEmailPreference(userId) {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { emailNotificationsEnabled: true },
    });
    if (!user)
        throw { status: 404, message: 'User not found' };
    return { emailEnabled: user.emailNotificationsEnabled };
}
async function setEmailPreference(userId, emailEnabled) {
    const updated = await prisma_1.prisma.user.update({
        where: { id: userId },
        data: { emailNotificationsEnabled: emailEnabled },
        select: { emailNotificationsEnabled: true },
    });
    return { emailEnabled: updated.emailNotificationsEnabled };
}
/** Internal: create a notification (e.g. from backend when certificate expires, form submitted, etc.) */
async function createNotification(data) {
    if (!data.skipEmail && !data.emailPreferenceKey) {
        throw new Error('createNotification: emailPreferenceKey is required unless skipEmail is true');
    }
    const r = await prisma_1.prisma.notification.create({
        data: {
            userId: data.userId,
            title: data.title,
            body: data.body,
            type: data.type || 'info',
            linkTo: data.linkTo ?? undefined,
        },
    });
    if (!data.skipEmail && data.emailPreferenceKey) {
        await (0, notificationEmailQueue_1.enqueueNotificationEmailJob)({
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
            });
        });
    }
    return map(r);
}
const FRANK_REMINDER_TITLE = 'New Reminder from Frank';
/**
 * In-app only; skips duplicate pushes when the agent retries or calls the same tool twice in a short window.
 */
async function createFrankHRTodoNotificationIfNotDuplicate(data, options) {
    const windowMs = options?.dedupeWindowMs ?? 2 * 60 * 1000;
    const since = new Date(Date.now() - windowMs);
    const existing = await prisma_1.prisma.notification.findFirst({
        where: {
            userId: data.userId,
            title: FRANK_REMINDER_TITLE,
            body: data.body,
            createdAt: { gte: since },
        },
    });
    if (existing)
        return { created: false, notification: map(existing) };
    const notification = await createNotification({
        userId: data.userId,
        title: FRANK_REMINDER_TITLE,
        body: data.body,
        type: 'reminder',
        linkTo: data.linkTo ?? '/hr/todo',
        skipEmail: true,
    });
    return { created: true, notification };
}
/** Notify all owner and HR users (e.g. when injury report is created). */
async function notifyOwnerAndHr(options) {
    const users = await prisma_1.prisma.user.findMany({
        where: { role: { in: ['owner', 'hr'] }, isActive: true },
        select: { id: true },
    });
    for (const u of users) {
        await createNotification({
            userId: u.id,
            title: options.title,
            body: options.body,
            type: options.type || 'info',
            linkTo: options.linkTo,
            emailPreferenceKey: options.emailPreferenceKey,
        }).catch(() => { });
    }
}
