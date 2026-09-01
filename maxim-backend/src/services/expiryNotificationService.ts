import { prisma } from '../lib/prisma'
import { createNotification } from './notificationService'

const EXPIRY_ALERT_DAYS = [60, 30, 7, 1] as const
const SIX_HOURS_MS = 6 * 60 * 60 * 1000

type ExpiryState = 'milestone' | 'expired'

function toYyyyMmDd(date: Date) {
    return date.toISOString().slice(0, 10)
}

function normalizeDate(value?: string | null): string | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, 10)
}

function parseDateAtUtcMidday(dateText: string) {
    return new Date(`${dateText}T12:00:00.000Z`)
}

function daysUntilExpiry(dateText: string) {
    const target = parseDateAtUtcMidday(dateText).getTime()
    const today = parseDateAtUtcMidday(toYyyyMmDd(new Date())).getTime()
    return Math.round((target - today) / (24 * 60 * 60 * 1000))
}

function getAlertState(dateText: string): { state: ExpiryState; daysBefore?: number } | null {
    const daysUntil = daysUntilExpiry(dateText)
    if (daysUntil < 0) return { state: 'expired' }
    if (EXPIRY_ALERT_DAYS.includes(daysUntil as any)) {
        return { state: 'milestone', daysBefore: daysUntil }
    }
    return null
}

function formatState(state: ExpiryState, daysBefore?: number) {
    if (state === 'expired') return 'has expired'
    return `is about to expire in ${daysBefore} day${daysBefore === 1 ? '' : 's'}`
}

function buildNotificationMessage(input: {
    itemType: string
    itemName: string
    ownerLabel: string
    expiryDate: string
    state: ExpiryState
    daysBefore?: number
}) {
    return `${input.itemType} "${input.itemName}" ${formatState(input.state, input.daysBefore)} on ${input.expiryDate}. It belongs to ${input.ownerLabel}.`
}

async function createNotificationWithDedupe(input: {
    hrUserId: string
    title: string
    body: string
    dedupeKey: string
    daily: boolean
}) {
    const existing = await prisma.notification.findFirst({
        where: {
            userId: input.hrUserId,
            type: 'expiry-alert',
            linkTo: input.dedupeKey,
            ...(input.daily
                ? {
                    createdAt: (() => {
                        const dayStart = new Date()
                        dayStart.setUTCHours(0, 0, 0, 0)
                        return { gte: dayStart }
                    })(),
                }
                : {}),
        },
        select: { id: true },
    })
    if (existing) return

    await createNotification({
        userId: input.hrUserId,
        title: input.title,
        body: input.body,
        type: 'expiry-alert',
        linkTo: input.dedupeKey,
        emailPreferenceKey: 'signatures',
    })
}

export async function checkAndNotifyHrExpiryAlerts() {
    const hrUsers = await prisma.user.findMany({
        where: { role: 'hr', isActive: true, emailNotificationsEnabled: true },
        select: { id: true },
    })
    if (!hrUsers.length) return

    const certificates = await prisma.certificate.findMany({
        select: { id: true, name: true, holderName: true, expirationDate: true },
    })
    const subcontractorCerts = await prisma.subcontractorCertification.findMany({
        include: { subcontractor: { select: { companyName: true } } },
    })
    const personnelCerts = await prisma.subcontractorPersonnelCertification.findMany({
        include: { personnel: { select: { name: true } } },
    })
    const subcontractorContracts = await prisma.subcontractorContract.findMany({
        include: {
            subcontractor: { select: { companyName: true } },
            personnel: { select: { name: true } },
        },
    })
    const subcontractorInsurances = await prisma.subcontractorInsurance.findMany({
        include: { subcontractor: { select: { companyName: true } } },
    })
    const employeeDocuments = await prisma.employeeDocument.findMany({
        where: { expiresAt: { not: null } },
        include: { employee: { select: { firstName: true, lastName: true } } },
    })

    const work: Array<{ title: string; body: string; dedupeKey: string; daily: boolean }> = []

    for (const c of certificates) {
        if (!c.expirationDate) continue
        const alert = getAlertState(c.expirationDate)
        if (!alert) continue
        const state = alert.state
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
        })
    }

    for (const c of subcontractorCerts) {
        const alert = getAlertState(c.expiresAt)
        if (!alert) continue
        const state = alert.state
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
        })
    }

    for (const c of personnelCerts) {
        const alert = getAlertState(c.expiresAt)
        if (!alert) continue
        const state = alert.state
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
        })
    }

    for (const contract of subcontractorContracts) {
        const dateText = normalizeDate(contract.endDate)
        if (!dateText) continue
        const alert = getAlertState(dateText)
        if (!alert) continue
        const state = alert.state
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
        })
    }

    for (const ins of subcontractorInsurances) {
        const dateText = normalizeDate(ins.expiresAt)
        if (!dateText) continue
        const alert = getAlertState(dateText)
        if (!alert) continue
        const state = alert.state
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
        })
    }

    for (const doc of employeeDocuments) {
        const dateText = normalizeDate(doc.expiresAt)
        if (!dateText) continue
        const alert = getAlertState(dateText)
        if (!alert) continue
        const state = alert.state
        const owner = `${doc.employee.firstName} ${doc.employee.lastName}`.trim()
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
        })
    }

    for (const hr of hrUsers) {
        for (const item of work) {
            await createNotificationWithDedupe({
                hrUserId: hr.id,
                title: item.title,
                body: item.body,
                dedupeKey: item.dedupeKey,
                daily: item.daily,
            })
        }
    }
}

let intervalRef: NodeJS.Timeout | null = null

export function startExpiryNotificationWorker() {
    if (intervalRef) return
    checkAndNotifyHrExpiryAlerts().catch((error) => {
        console.error('expiry_notification_initial_run_failed', error)
    })
    intervalRef = setInterval(() => {
        checkAndNotifyHrExpiryAlerts().catch((error) => {
            console.error('expiry_notification_worker_failed', error)
        })
    }, SIX_HOURS_MS)
}
