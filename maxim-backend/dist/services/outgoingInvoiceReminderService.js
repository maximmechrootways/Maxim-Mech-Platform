"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshOutgoingInvoiceStatuses = refreshOutgoingInvoiceStatuses;
exports.sendOutgoingInvoiceOverdueReminders = sendOutgoingInvoiceOverdueReminders;
exports.startOutgoingInvoiceReminderWorker = startOutgoingInvoiceReminderWorker;
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
const notificationService_1 = require("./notificationService");
const outgoingInvoiceExtractionService_1 = require("./outgoingInvoiceExtractionService");
const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
async function listReminderRecipients() {
    const configured = env_1.env.OUTGOING_INVOICE_REMINDER_RECIPIENTS
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
    if (configured.length) {
        const users = await prisma_1.prisma.user.findMany({
            where: { email: { in: configured }, isActive: true },
            select: { id: true, email: true },
        });
        if (users.length)
            return users;
    }
    return prisma_1.prisma.user.findMany({
        where: { role: { in: ['owner', 'hr'] }, isActive: true },
        select: { id: true, email: true },
    });
}
async function refreshOutgoingInvoiceStatuses(now = new Date()) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const openInvoices = await prisma_1.prisma.outgoingInvoice.findMany({
        where: { status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] } },
        select: {
            id: true,
            status: true,
            paidAt: true,
            paidAmount: true,
            totalAmount: true,
            dueDate: true,
        },
    });
    let updated = 0;
    for (const invoice of openInvoices) {
        const nextStatus = (0, outgoingInvoiceExtractionService_1.deriveOutgoingInvoiceStatus)({
            paidAt: invoice.paidAt,
            paidAmount: invoice.paidAmount != null ? Number(invoice.paidAmount) : null,
            totalAmount: invoice.totalAmount != null ? Number(invoice.totalAmount) : null,
            dueDate: invoice.dueDate,
            now: todayStart,
        });
        if (nextStatus !== invoice.status) {
            await prisma_1.prisma.outgoingInvoice.update({
                where: { id: invoice.id },
                data: { status: nextStatus },
            });
            updated += 1;
        }
    }
    return { updated };
}
async function sendOutgoingInvoiceOverdueReminders(now = new Date()) {
    await refreshOutgoingInvoiceStatuses(now);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const overdueInvoices = await prisma_1.prisma.outgoingInvoice.findMany({
        where: {
            status: { in: ['OVERDUE', 'PARTIAL'] },
            dueDate: { lt: todayStart },
        },
        orderBy: { dueDate: 'asc' },
        take: 50,
    });
    if (!overdueInvoices.length)
        return { reminded: 0 };
    const recipients = await listReminderRecipients();
    if (!recipients.length)
        return { reminded: 0 };
    let reminded = 0;
    for (const invoice of overdueInvoices) {
        const cooldownStart = new Date(now.getTime() - REMINDER_COOLDOWN_MS);
        if (invoice.lastReminderAt && invoice.lastReminderAt > cooldownStart)
            continue;
        const daysOverdue = invoice.dueDate
            ? Math.max(1, Math.ceil((todayStart.getTime() - invoice.dueDate.getTime()) / (24 * 60 * 60 * 1000)))
            : null;
        const amount = invoice.totalAmount != null ? Number(invoice.totalAmount) : null;
        const paid = invoice.paidAmount != null ? Number(invoice.paidAmount) : 0;
        const due = amount != null ? Math.max(0, amount - paid) : null;
        const title = `Overdue invoice${invoice.invoiceNumber ? ` #${invoice.invoiceNumber}` : ''}`;
        const body = [
            invoice.customerName ? `Customer: ${invoice.customerName}` : null,
            due != null ? `Amount due: $${due.toFixed(2)} CAD` : null,
            daysOverdue != null ? `${daysOverdue} day(s) overdue` : null,
        ].filter(Boolean).join(' · ');
        const linkTo = `${env_1.env.FRONTEND_URL.replace(/\/$/, '')}/outgoing-invoices/${invoice.id}`;
        for (const recipient of recipients) {
            const cooldownStart = new Date(now.getTime() - REMINDER_COOLDOWN_MS);
            const alreadySent = await prisma_1.prisma.notification.findFirst({
                where: {
                    userId: recipient.id,
                    type: 'outgoing-invoice-overdue',
                    linkTo,
                    createdAt: { gte: cooldownStart },
                },
                select: { id: true },
            });
            if (alreadySent)
                continue;
            await (0, notificationService_1.createNotification)({
                userId: recipient.id,
                title,
                body,
                type: 'outgoing-invoice-overdue',
                linkTo,
                emailPreferenceKey: 'digest_hr_owner_8am',
            });
        }
        await prisma_1.prisma.outgoingInvoice.update({
            where: { id: invoice.id },
            data: { lastReminderAt: now },
        });
        reminded += 1;
    }
    return { reminded };
}
let intervalRef = null;
function startOutgoingInvoiceReminderWorker() {
    if (intervalRef)
        return;
    sendOutgoingInvoiceOverdueReminders().catch((error) => {
        console.error('[outgoing-invoice] reminder initial run failed', error);
    });
    intervalRef = setInterval(() => {
        sendOutgoingInvoiceOverdueReminders().catch((error) => {
            console.error('[outgoing-invoice] reminder worker failed', error);
        });
    }, Math.max(60 * 60 * 1000, env_1.env.OUTGOING_INVOICE_REMINDER_INTERVAL_MS));
}
