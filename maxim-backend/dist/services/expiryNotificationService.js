"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndNotifyHrExpiryAlerts = checkAndNotifyHrExpiryAlerts;
exports.startExpiryNotificationWorker = startExpiryNotificationWorker;
const prisma_1 = require("../lib/prisma");
const notificationService_1 = require("./notificationService");
const EXPIRY_ALERT_DAYS = [60, 30, 7, 1];
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
function toYyyyMmDd(date) {
    return date.toISOString().slice(0, 10);
}
function normalizeDate(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    return trimmed.slice(0, 10);
}
function parseDateAtUtcMidday(dateText) {
    return new Date(`${dateText}T12:00:00.000Z`);
}
function daysUntilExpiry(dateText) {
    const target = parseDateAtUtcMidday(dateText).getTime();
    const today = parseDateAtUtcMidday(toYyyyMmDd(new Date())).getTime();
    return Math.round((target - today) / (24 * 60 * 60 * 1000));
}
function getAlertState(dateText) {
    const daysUntil = daysUntilExpiry(dateText);
    if (daysUntil < 0)
        return { state: 'expired' };
    if (EXPIRY_ALERT_DAYS.includes(daysUntil)) {
        return { state: 'milestone', daysBefore: daysUntil };
    }
    return null;
}
function formatState(state, daysBefore) {
    if (state === 'expired')
        return 'has expired';
    return `is about to expire in ${daysBefore} day${daysBefore === 1 ? '' : 's'}`;
}
function buildNotificationMessage(input) {
    return `${input.itemType} "${input.itemName}" ${formatState(input.state, input.daysBefore)} on ${input.expiryDate}. It belongs to ${input.ownerLabel}.`;
}
async function createNotificationWithDedupe(input) {
    const existing = await prisma_1.prisma.notification.findFirst({
        where: {
            userId: input.hrUserId,
            type: 'expiry-alert',
            linkTo: input.dedupeKey,
            ...(input.daily
                ? {
                    createdAt: (() => {
                        const dayStart = new Date();
                        dayStart.setUTCHours(0, 0, 0, 0);
                        return { gte: dayStart };
                    })(),
                }
                : {}),
        },
        select: { id: true },
    });
    if (existing)
        return;
    await (0, notificationService_1.createNotification)({
        userId: input.hrUserId,
        title: input.title,
        body: input.body,
        type: 'expiry-alert',
        linkTo: input.dedupeKey,
        emailPreferenceKey: 'signatures',
    });
}
async function checkAndNotifyHrExpiryAlerts() {
    const hrUsers = await prisma_1.prisma.user.findMany({
        where: { role: 'hr', isActive: true, emailNotificationsEnabled: true },
        select: { id: true },
    });
    if (!hrUsers.length)
        return;
    const certificates = await prisma_1.prisma.certificate.findMany({
        select: { id: true, name: true, holderName: true, expirationDate: true },
    });
    const subcontractorCerts = await prisma_1.prisma.subcontractorCertification.findMany({
        include: { subcontractor: { select: { companyName: true } } },
    });
    const personnelCerts = await prisma_1.prisma.subcontractorPersonnelCertification.findMany({
        include: { personnel: { select: { name: true } } },
    });
    const subcontractorContracts = await prisma_1.prisma.subcontractorContract.findMany({
        include: {
            subcontractor: { select: { companyName: true } },
            personnel: { select: { name: true } },
        },
    });
    const subcontractorInsurances = await prisma_1.prisma.subcontractorInsurance.findMany({
        include: { subcontractor: { select: { companyName: true } } },
    });
    const employeeDocuments = await prisma_1.prisma.employeeDocument.findMany({
        where: { expiresAt: { not: null } },
        include: { employee: { select: { firstName: true, lastName: true } } },
    });
    const work = [];
    for (const c of certificates) {
        if (!c.expirationDate)
            continue;
        const alert = getAlertState(c.expirationDate);
        if (!alert)
            continue;
        const state = alert.state;
        work.push({
            title: `Certificate ${state === 'expired' ? 'expired' : `expiring in ${alert.daysBefore} day${alert.daysBefore === 1 ? '' : 's'}`}`,
            body: buildNotificationMessage({
                itemType: 'Certificate',
                itemName: c.name,
                ownerLabel: c.holderName,
                expiryDate: c.expirationDate,
                state,
                daysBefore: alert.daysBefore,
            }),
            dedupeKey: `expiry:certificate:${c.id}:${state}:${alert.daysBefore ?? 'expired'}`,
            daily: false,
        });
    }
    for (const c of subcontractorCerts) {
        const alert = getAlertState(c.expiresAt);
        if (!alert)
            continue;
        const state = alert.state;
        work.push({
            title: `Subcontractor certification ${state === 'expired' ? 'expired' : `expiring in ${alert.daysBefore} day${alert.daysBefore === 1 ? '' : 's'}`}`,
            body: buildNotificationMessage({
                itemType: 'Subcontractor certification',
                itemName: c.name,
                ownerLabel: c.subcontractor.companyName,
                expiryDate: c.expiresAt,
                state,
                daysBefore: alert.daysBefore,
            }),
            dedupeKey: `expiry:subcontractor-cert:${c.id}:${state}:${alert.daysBefore ?? 'expired'}`,
            daily: false,
        });
    }
    for (const c of personnelCerts) {
        const alert = getAlertState(c.expiresAt);
        if (!alert)
            continue;
        const state = alert.state;
        work.push({
            title: `Personnel certification ${state === 'expired' ? 'expired' : `expiring in ${alert.daysBefore} day${alert.daysBefore === 1 ? '' : 's'}`}`,
            body: buildNotificationMessage({
                itemType: 'Personnel certification',
                itemName: c.name,
                ownerLabel: c.personnel.name,
                expiryDate: c.expiresAt,
                state,
                daysBefore: alert.daysBefore,
            }),
            dedupeKey: `expiry:personnel-cert:${c.id}:${state}:${alert.daysBefore ?? 'expired'}`,
            daily: false,
        });
    }
    for (const contract of subcontractorContracts) {
        const dateText = normalizeDate(contract.endDate);
        if (!dateText)
            continue;
        const alert = getAlertState(dateText);
        if (!alert)
            continue;
        const state = alert.state;
        work.push({
            title: `Subcontractor contract ${state === 'expired' ? 'expired' : `expiring in ${alert.daysBefore} day${alert.daysBefore === 1 ? '' : 's'}`}`,
            body: buildNotificationMessage({
                itemType: 'Subcontractor contract',
                itemName: contract.originalName || 'Contract',
                ownerLabel: contract.personnel?.name || contract.subcontractor.companyName,
                expiryDate: dateText,
                state,
                daysBefore: alert.daysBefore,
            }),
            dedupeKey: `expiry:subcontractor-contract:${contract.id}:${state}:${alert.daysBefore ?? 'expired'}`,
            daily: false,
        });
    }
    for (const ins of subcontractorInsurances) {
        const dateText = normalizeDate(ins.expiresAt);
        if (!dateText)
            continue;
        const alert = getAlertState(dateText);
        if (!alert)
            continue;
        const state = alert.state;
        work.push({
            title: `Subcontractor insurance ${state === 'expired' ? 'expired' : `expiring in ${alert.daysBefore} day${alert.daysBefore === 1 ? '' : 's'}`}`,
            body: buildNotificationMessage({
                itemType: 'Subcontractor insurance',
                itemName: ins.type,
                ownerLabel: ins.subcontractor.companyName,
                expiryDate: dateText,
                state,
                daysBefore: alert.daysBefore,
            }),
            dedupeKey: `expiry:subcontractor-insurance:${ins.id}:${state}:${alert.daysBefore ?? 'expired'}`,
            daily: false,
        });
    }
    for (const doc of employeeDocuments) {
        const dateText = normalizeDate(doc.expiresAt);
        if (!dateText)
            continue;
        const alert = getAlertState(dateText);
        if (!alert)
            continue;
        const state = alert.state;
        const owner = `${doc.employee.firstName} ${doc.employee.lastName}`.trim();
        work.push({
            title: `Employee document ${state === 'expired' ? 'expired' : `expiring in ${alert.daysBefore} day${alert.daysBefore === 1 ? '' : 's'}`}`,
            body: buildNotificationMessage({
                itemType: 'Employee document',
                itemName: doc.displayName || doc.originalName,
                ownerLabel: owner || 'employee',
                expiryDate: dateText,
                state,
                daysBefore: alert.daysBefore,
            }),
            dedupeKey: `expiry:employee-document:${doc.id}:${state}:${alert.daysBefore ?? 'expired'}`,
            daily: false,
        });
    }
    for (const hr of hrUsers) {
        for (const item of work) {
            await createNotificationWithDedupe({
                hrUserId: hr.id,
                title: item.title,
                body: item.body,
                dedupeKey: item.dedupeKey,
                daily: item.daily,
            });
        }
    }
}
let intervalRef = null;
function startExpiryNotificationWorker() {
    if (intervalRef)
        return;
    checkAndNotifyHrExpiryAlerts().catch((error) => {
        console.error('expiry_notification_initial_run_failed', error);
    });
    intervalRef = setInterval(() => {
        checkAndNotifyHrExpiryAlerts().catch((error) => {
            console.error('expiry_notification_worker_failed', error);
        });
    }, SIX_HOURS_MS);
}
