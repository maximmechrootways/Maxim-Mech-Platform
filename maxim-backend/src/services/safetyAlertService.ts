import { prisma } from '../lib/prisma'

const ROLES = ['owner', 'hr']

type UserAction = { userId: string; at: string }

function canManage(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Only Owner or HR can manage alerts' }
}

function normalizeUserActions(raw: unknown): UserAction[] {
    if (!Array.isArray(raw)) return []
    return raw
        .map((item) => {
            if (typeof item === 'string') return { userId: item, at: '' }
            if (item && typeof item === 'object' && 'userId' in item) {
                const o = item as { userId: string; at?: string }
                return { userId: String(o.userId), at: o.at ?? '' }
            }
            return null
        })
        .filter((x): x is UserAction => x != null)
}

function map(r: any) {
    return {
        id: r.id,
        title: r.title,
        body: r.body,
        siteNames: Array.isArray(r.siteNames) ? r.siteNames : [],
        roles: Array.isArray(r.roles) ? r.roles : [],
        publishedAt: r.publishedAt?.toISOString?.() ?? undefined,
        expiresAt: r.expiresAt ?? undefined,
        acknowledgedBy: normalizeUserActions(r.acknowledgedBy),
        readBy: normalizeUserActions(r.readBy),
    }
}

export async function listAlerts(role: string, query: { activeOnly?: string }) {
    const where: any = {}
    if (query.activeOnly === 'true') {
        where.OR = [{ expiresAt: null }, { expiresAt: { gte: new Date().toISOString().slice(0, 10) } }]
    }
    const list = await prisma.safetyAlert.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
    })
    return list.map(map)
}

export async function getAlertById(id: string) {
    const r = await prisma.safetyAlert.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Alert not found' }
    return map(r)
}

export async function createAlert(userId: string, role: string, data: any) {
    canManage(role)
    const r = await prisma.safetyAlert.create({
        data: {
            title: (data.title || '').trim(),
            body: (data.body || '').trim(),
            siteNames: Array.isArray(data.siteNames) ? data.siteNames : [],
            roles: Array.isArray(data.roles) ? data.roles : [],
            publishedById: userId,
            expiresAt: data.expiresAt?.trim() || null,
        },
    })
    return map(r)
}

export async function updateAlert(id: string, role: string, data: any) {
    canManage(role)
    const existing = await prisma.safetyAlert.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Alert not found' }
    const r = await prisma.safetyAlert.update({
        where: { id },
        data: {
            ...(data.title !== undefined && { title: data.title.trim() }),
            ...(data.body !== undefined && { body: data.body.trim() }),
            ...(data.siteNames !== undefined && { siteNames: Array.isArray(data.siteNames) ? data.siteNames : existing.siteNames }),
            ...(data.roles !== undefined && { roles: Array.isArray(data.roles) ? data.roles : existing.roles }),
            ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt?.trim() || null }),
        },
    })
    return map(r)
}

export async function deleteAlert(id: string, role: string) {
    canManage(role)
    await prisma.safetyAlert.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Alert not found' }
    })
    return { message: 'Deleted' }
}

export async function markAlertRead(id: string, userId: string) {
    const r = await prisma.safetyAlert.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Alert not found' }
    const read = normalizeUserActions(r.readBy)
    if (read.some((x) => x.userId === userId)) return map(r)
    const updated = await prisma.safetyAlert.update({
        where: { id },
        data: { readBy: [...read, { userId, at: new Date().toISOString() }] },
    })
    return map(updated)
}

export async function acknowledgeAlert(id: string, userId: string) {
    const r = await prisma.safetyAlert.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Alert not found' }
    const ack = normalizeUserActions(r.acknowledgedBy)
    if (ack.some((x) => x.userId === userId)) return map(r)
    const read = normalizeUserActions(r.readBy)
    const readUpdated = read.some((x) => x.userId === userId)
        ? read
        : [...read, { userId, at: new Date().toISOString() }]
    const updated = await prisma.safetyAlert.update({
        where: { id },
        data: {
            acknowledgedBy: [...ack, { userId, at: new Date().toISOString() }],
            readBy: readUpdated,
        },
    })
    return map(updated)
}
