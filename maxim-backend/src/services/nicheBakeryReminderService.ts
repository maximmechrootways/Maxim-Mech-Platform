import { prisma } from '../lib/prisma'
import { createNotification } from './notificationService'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const QUARTERLY_TRIGGER_MONTHS = new Set([0, 5, 8, 11]) // Jan, Jun, Sep, Dec
const NICHE_FORM_NAMES = [
    'Niche Water Softener',
    'Niche Air Separators',
    'Niche Buffer Tanks',
    'Niche Expansion Tanks',
    'Niche Pumps',
] as const

function isQuarterlyTriggerDate(now: Date) {
    return now.getUTCDate() === 1 && QUARTERLY_TRIGGER_MONTHS.has(now.getUTCMonth())
}

function getQuarterKey(now: Date) {
    const month = now.getUTCMonth()
    const quarter = month < 3 ? 'Q1' : month < 6 ? 'Q2' : month < 9 ? 'Q3' : 'Q4'
    return `${now.getUTCFullYear()}-${quarter}`
}

function getMonthLabel(monthIndex: number) {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex] ?? 'Quarterly'
}

export async function checkAndNotifyNicheBakeryQuarterlyForms(now = new Date()) {
    if (!isQuarterlyTriggerDate(now)) return

    const quarterKey = getQuarterKey(now)
    const monthLabel = getMonthLabel(now.getUTCMonth())

    const nicheJobs = await prisma.job.findMany({
        where: {
            status: 'active',
            OR: [
                { title: { contains: 'niche bak', mode: 'insensitive' } },
                { site: { name: { contains: 'niche bak', mode: 'insensitive' } } },
            ],
        },
        select: {
            id: true,
            title: true,
            site: { select: { id: true, name: true } },
            supervisors: {
                select: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            isActive: true,
                            role: true,
                        },
                    },
                },
            },
        },
    })

    for (const job of nicheJobs) {
        const siteName = job.site?.name ?? 'Unknown Site'
        const supervisors = job.supervisors
            .map((s) => s.user)
            .filter((u) => u.isActive && String(u.role).toLowerCase() === 'supervisor')

        for (const supervisor of supervisors) {
            const dedupeKey = `niche-bakery-quarterly:${quarterKey}:job:${job.id}:supervisor:${supervisor.id}`
            const alreadySent = await prisma.notification.findFirst({
                where: {
                    userId: supervisor.id,
                    type: 'forms-reminder',
                    linkTo: dedupeKey,
                },
                select: { id: true },
            })
            if (alreadySent) continue

            const title = `Quarterly Niche Bakery forms are due (${monthLabel})`
            const body =
                `Please complete all Niche Bakery quarterly forms for ${job.title} (${siteName}). ` +
                `Required forms: ${NICHE_FORM_NAMES.join(', ')}.`

            await createNotification({
                userId: supervisor.id,
                title,
                body,
                type: 'forms-reminder',
                linkTo: dedupeKey,
                emailPreferenceKey: 'forms_pending',
            })
        }
    }
}

let intervalRef: NodeJS.Timeout | null = null

export function startNicheBakeryReminderWorker() {
    if (intervalRef) return

    checkAndNotifyNicheBakeryQuarterlyForms().catch((error) => {
        console.error('niche_bakery_reminder_initial_run_failed', error)
    })

    intervalRef = setInterval(() => {
        checkAndNotifyNicheBakeryQuarterlyForms().catch((error) => {
            console.error('niche_bakery_reminder_worker_failed', error)
        })
    }, SIX_HOURS_MS)
}
