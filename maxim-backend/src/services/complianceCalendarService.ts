import { prisma } from '../lib/prisma'

const ROLES = ['owner', 'hr', 'supervisor']

function canAccess(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Insufficient role for compliance calendar' }
}

export async function listEvents(role: string, query: { from?: string; to?: string; type?: string }) {
    canAccess(role)
    const where: any = {}
    if (query.type) where.type = query.type
    if (query.from || query.to) {
        where.dueDate = {}
        if (query.from) where.dueDate.gte = query.from
        if (query.to) where.dueDate.lte = query.to
    }
    const list = await prisma.complianceCalendarEvent.findMany({
        where,
        orderBy: { dueDate: 'asc' },
    })
    return list.map((r: any) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        dueDate: r.dueDate,
        siteName: r.siteName ?? undefined,
        recordId: r.recordId ?? undefined,
        metadata: (r.metadata as Record<string, string>) ?? {},
    }))
}

export async function listDue(role: string, asOf?: string) {
    canAccess(role)
    const date = asOf || new Date().toISOString().slice(0, 10)
    const list = await prisma.complianceCalendarEvent.findMany({
        where: { dueDate: { gte: date } },
        orderBy: { dueDate: 'asc' },
        take: 50,
    })
    return list.map((r: any) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        dueDate: r.dueDate,
        siteName: r.siteName ?? undefined,
        recordId: r.recordId ?? undefined,
        metadata: (r.metadata as Record<string, string>) ?? {},
    }))
}
