import { prisma } from '../lib/prisma'

const ROLES = ['owner', 'hr', 'supervisor']

function canAccess(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Insufficient role for inspections' }
}

export async function listSchedules(role: string) {
    canAccess(role)
    const list = await prisma.inspectionSchedule.findMany({ orderBy: { nextDue: 'asc' } })
    return list.map((r: any) => ({
        id: r.id,
        title: r.title,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName ?? undefined,
        checklistId: r.checklistId,
        frequency: r.frequency,
        nextDue: r.nextDue,
        assignedToRole: r.assignedToRole ?? undefined,
    }))
}

export async function listDue(role: string, asOf?: string) {
    canAccess(role)
    const date = asOf ?? new Date().toISOString().slice(0, 10)
    const list = await prisma.inspectionSchedule.findMany({
        where: { nextDue: { lte: date } },
        orderBy: { nextDue: 'asc' },
    })
    return list.map((r: any) => ({
        id: r.id,
        title: r.title,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName ?? undefined,
        checklistId: r.checklistId,
        frequency: r.frequency,
        nextDue: r.nextDue,
        assignedToRole: r.assignedToRole ?? undefined,
    }))
}

export async function listResults(role: string, query: { scheduleId?: string }) {
    canAccess(role)
    const where: any = {}
    if (query.scheduleId) where.scheduleId = query.scheduleId
    const list = await prisma.inspectionResult.findMany({
        where,
        orderBy: { completedAt: 'desc' },
    })
    return list.map((r: any) => ({
        id: r.id,
        scheduleId: r.scheduleId,
        title: r.title,
        siteName: r.siteName ?? undefined,
        completedAt: r.completedAt?.toISOString?.() ?? undefined,
        completedBy: r.completedBy ?? undefined,
        items: (r.items as any[]) ?? [],
    }))
}
