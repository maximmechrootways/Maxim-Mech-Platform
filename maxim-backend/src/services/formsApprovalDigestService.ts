import { prisma } from '../lib/prisma'
import { enqueueSystemEmailJob } from './notificationEmailQueue'
import { normalizeUiPreferences } from './uiPreferencesService'

const CHECK_INTERVAL_MS = 60 * 1000
const DIGEST_TIMEZONE = 'America/Toronto'
const DIGEST_HOUR = 8

type PendingItem = {
    formType: 'Standard form' | 'PDF form' | 'Signable daily form'
    title: string
    submittedBy: string
    submittedAt: Date
    status: string
}

function toDateKeyInTimezone(value: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
    return formatter.format(value)
}

function getNowPartsInTimezone(now: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
    const parts = formatter.formatToParts(now)
    const map = new Map(parts.map((p) => [p.type, p.value]))
    return {
        weekday: map.get('weekday') ?? '',
        year: Number(map.get('year') ?? 0),
        month: Number(map.get('month') ?? 0),
        day: Number(map.get('day') ?? 0),
        hour: Number(map.get('hour') ?? 0),
        minute: Number(map.get('minute') ?? 0),
    }
}

export function buildDigestEmail(
    items: PendingItem[],
    digestDateLabel: string,
    options?: { isTest?: boolean },
) {
    const testPrefix = options?.isTest ? '[TEST] ' : ''
    const subject = `${testPrefix}8AM forms digest: pending from ${digestDateLabel}`
    const testFooter =
        options?.isTest
            ? '\n\n(This is a manual test send. The scheduled digest runs Mon–Fri at 8:00 AM America/Toronto.)\n'
            : ''

    let lines: string[]
    if (items.length === 0) {
        lines = [
            `No pending forms matched yesterday (${digestDateLabel}) for standard submissions, PDF submissions still in progress, or daily forms submitted to HR.`,
            '',
            'If you expected rows here, verify form statuses and submission dates.',
        ]
    } else {
        lines = [
            `Forms pending action from ${digestDateLabel}:`,
            '',
            ...items.map((item, idx) => {
                return `${idx + 1}. [${item.formType}] ${item.title} — ${item.status} — submitted by ${item.submittedBy}`
            }),
            '',
            'Open Submissions in Maxim to review and approve.',
        ]
    }

    const htmlList = items.length
        ? items
            .map((item) => {
                return `<li><strong>${escapeHtml(item.formType)}</strong> ${escapeHtml(item.title)} - ${escapeHtml(item.status)} - submitted by ${escapeHtml(item.submittedBy)}</li>`
            })
            .join('')
        : '<li><em>No matching pending items for this date.</em></li>'
    const testHtmlNote = options?.isTest
        ? '<p><em>This is a manual test send — not the scheduled digest.</em></p>'
        : ''
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>${escapeHtml(subject.replace(/^\[TEST\] /, ''))}</h2>
        <ul>${htmlList}</ul>
        <p>Open Submissions in Maxim to review and approve.</p>
        ${testHtmlNote}
      </div>
    `

    return {
        subject,
        text: lines.join('\n') + testFooter,
        html,
    }
}

function escapeHtml(input: string) {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

export async function collectPreviousDayPendingItems(now: Date): Promise<PendingItem[]> {
    const yesterdayKey = toDateKeyInTimezone(new Date(now.getTime() - 24 * 60 * 60 * 1000), DIGEST_TIMEZONE)
    const recentCutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000)

    const [formRows, pdfRows, signableRows] = await Promise.all([
        prisma.formSubmission.findMany({
            where: {
                status: { in: ['submitted', 'pending_site_signatures'] },
                submittedAt: { gte: recentCutoff },
            },
            select: {
                templateName: true,
                status: true,
                submittedAt: true,
                submittedBy: { select: { firstName: true, lastName: true, email: true } },
            },
            orderBy: { submittedAt: 'desc' },
        }),
        prisma.pdfSubmission.findMany({
            where: {
                status: { in: ['SUBMITTED', 'AWAITING_SIGNATURES', 'RESUBMIT_REQUIRED'] },
                OR: [{ submittedAt: { gte: recentCutoff } }, { createdAt: { gte: recentCutoff } }],
            },
            select: {
                title: true,
                status: true,
                submittedAt: true,
                createdAt: true,
                submittedBy: { select: { firstName: true, lastName: true, email: true } },
                template: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.signableFormSubmission.findMany({
            where: {
                submittedToHrAt: { gte: recentCutoff },
            },
            select: {
                templateName: true,
                submittedToHrAt: true,
                submittedBy: { select: { firstName: true, lastName: true, email: true } },
            },
            orderBy: { submittedToHrAt: 'desc' },
        }),
    ])

    const pending: PendingItem[] = []

    for (const row of formRows) {
        if (!row.submittedAt) continue
        if (toDateKeyInTimezone(row.submittedAt, DIGEST_TIMEZONE) !== yesterdayKey) continue
        const submitter = row.submittedBy
            ? `${row.submittedBy.firstName || ''} ${row.submittedBy.lastName || ''}`.trim() || row.submittedBy.email
            : 'Unknown'
        pending.push({
            formType: 'Standard form',
            title: row.templateName,
            submittedBy: submitter,
            submittedAt: row.submittedAt,
            status: row.status,
        })
    }

    for (const row of pdfRows) {
        const effectiveTime = row.submittedAt ?? row.createdAt
        if (toDateKeyInTimezone(effectiveTime, DIGEST_TIMEZONE) !== yesterdayKey) continue
        const submitter = row.submittedBy
            ? `${row.submittedBy.firstName || ''} ${row.submittedBy.lastName || ''}`.trim() || row.submittedBy.email
            : 'Unknown'
        pending.push({
            formType: 'PDF form',
            title: row.title?.trim() || row.template.name,
            submittedBy: submitter,
            submittedAt: effectiveTime,
            status: row.status,
        })
    }

    for (const row of signableRows) {
        if (!row.submittedToHrAt) continue
        if (toDateKeyInTimezone(row.submittedToHrAt, DIGEST_TIMEZONE) !== yesterdayKey) continue
        const submitter = `${row.submittedBy.firstName || ''} ${row.submittedBy.lastName || ''}`.trim() || row.submittedBy.email
        pending.push({
            formType: 'Signable daily form',
            title: row.templateName,
            submittedBy: submitter,
            submittedAt: row.submittedToHrAt,
            status: 'submitted_to_hr',
        })
    }

    return pending.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
}

async function sendWeekdayMorningDigest(now: Date) {
    const nowParts = getNowPartsInTimezone(now, DIGEST_TIMEZONE)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const digestDateKey = toDateKeyInTimezone(yesterday, DIGEST_TIMEZONE)
    const digestDateLabel = digestDateKey

    const recipients = await prisma.user.findMany({
        where: {
            isActive: true,
            role: { in: ['owner', 'hr'] },
            emailNotificationsEnabled: true,
        },
        select: {
            id: true,
            email: true,
            uiPreferences: true,
        },
    })

    if (!recipients.length) return

    const items = await collectPreviousDayPendingItems(now)
    if (!items.length) return

    const email = buildDigestEmail(items, digestDateLabel)
    for (const recipient of recipients) {
        if (!recipient.email) continue
        const prefs = normalizeUiPreferences(recipient.uiPreferences).notificationPreferences
        if (!prefs.digest_hr_owner_8am) continue

        const idempotencyKey = `digest:forms-pending:${digestDateKey}:${recipient.id}`
        const notificationId = `digest:forms-pending:${digestDateKey}:${recipient.id}`
        await enqueueSystemEmailJob({
            notificationId,
            userId: recipient.id,
            toEmail: recipient.email,
            subject: email.subject,
            bodyText: email.text,
            bodyHtml: email.html,
            idempotencyKey,
            emailPreferenceKey: 'digest_hr_owner_8am',
        }).catch((error) => {
            console.error('forms_digest_enqueue_failed', {
                userId: recipient.id,
                email: recipient.email,
                error: error instanceof Error ? error.message : String(error),
            })
        })
    }

    console.info(JSON.stringify({
        event: 'forms_digest_enqueued',
        recipientCount: recipients.length,
        pendingCount: items.length,
        digestDateKey,
        hour: nowParts.hour,
        minute: nowParts.minute,
    }))
}

let intervalRef: NodeJS.Timeout | null = null
let lastRunDateKey: string | null = null

function getTodayDateKeyInTimezone(now: Date) {
    const p = getNowPartsInTimezone(now, DIGEST_TIMEZONE)
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

function shouldRunNow(now: Date) {
    const p = getNowPartsInTimezone(now, DIGEST_TIMEZONE)
    const isWeekday = p.weekday !== 'Sat' && p.weekday !== 'Sun'
    if (!isWeekday) return false
    if (p.hour !== DIGEST_HOUR) return false
    // Let startup/restart within first 5 minutes still trigger.
    if (p.minute > 5) return false
    const todayKey = getTodayDateKeyInTimezone(now)
    return lastRunDateKey !== todayKey
}

async function tick() {
    const now = new Date()
    if (!shouldRunNow(now)) return
    await sendWeekdayMorningDigest(now)
    lastRunDateKey = getTodayDateKeyInTimezone(now)
}

export function startFormsApprovalDigestWorker() {
    if (intervalRef) return
    tick().catch((error) => {
        console.error('forms_digest_initial_tick_failed', error)
    })
    intervalRef = setInterval(() => {
        tick().catch((error) => {
            console.error('forms_digest_worker_tick_failed', error)
        })
    }, CHECK_INTERVAL_MS)
}

/**
 * Enqueue a one-off [TEST] digest to the user's email (same query as the scheduled job).
 * Uses notification id prefix digest:test: so delivery skips per-category prefs but still requires
 * active user + email + emailNotificationsEnabled (see notificationEmailQueue processOne).
 */
export async function enqueueTestFormsApprovalDigestForUser(userId: string): Promise<{
    enqueued: boolean
    itemCount: number
    digestDateLabel: string
}> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            emailNotificationsEnabled: true,
        },
    })
    if (!user) throw { status: 404, message: 'User not found' }
    if (user.role !== 'owner' && user.role !== 'hr') {
        throw { status: 403, message: 'Only HR and Owner can receive this digest' }
    }
    if (!user.isActive) throw { status: 400, message: 'User is not active' }
    if (!user.email?.trim()) throw { status: 400, message: 'User has no email on file' }
    if (!user.emailNotificationsEnabled) {
        throw { status: 400, message: 'Email notifications are disabled for this user' }
    }

    const now = new Date()
    const items = await collectPreviousDayPendingItems(now)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const digestDateLabel = toDateKeyInTimezone(yesterday, DIGEST_TIMEZONE)

    const email = buildDigestEmail(items, digestDateLabel, { isTest: true })
    const ts = Date.now()
    const notificationId = `digest:test:${userId}:${ts}`
    const idempotencyKey = `digest:test:${userId}:${ts}`

    await enqueueSystemEmailJob({
        notificationId,
        userId: user.id,
        toEmail: user.email,
        subject: email.subject,
        bodyText: email.text,
        bodyHtml: email.html,
        idempotencyKey,
    })

    return { enqueued: true, itemCount: items.length, digestDateLabel }
}

