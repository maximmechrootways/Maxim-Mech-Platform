import { prisma } from '../lib/prisma'

const ROLES = ['owner', 'hr']

type UserAction = { userId: string; at: string }

function canManage(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Only Owner or HR can manage alerts' }
}

function normalizeUserActions(raw: unknown): UserAction[] {
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const out: UserAction[] = []
    for (const item of raw) {
        let action: UserAction | null = null
        if (typeof item === 'string') action = { userId: item, at: '' }
        else if (item && typeof item === 'object' && 'userId' in item) {
            const o = item as { userId: string; at?: string }
            action = { userId: String(o.userId), at: o.at ?? '' }
        }
        if (!action?.userId || seen.has(action.userId)) continue
        seen.add(action.userId)
        out.push(action)
    }
    return out
}

/** Ensure every acknowledged user also appears in readBy (fixes legacy ack-without-read rows). */
function ensureReadCoversAcknowledgements(readBy: UserAction[], acknowledgedBy: UserAction[]): UserAction[] {
    const read = [...readBy]
    const readIds = new Set(read.map((r) => r.userId))
    for (const a of acknowledgedBy) {
        if (readIds.has(a.userId)) continue
        read.push({ userId: a.userId, at: a.at || new Date().toISOString() })
        readIds.add(a.userId)
    }
    return read
}

function map(r: any) {
    const acknowledgedBy = normalizeUserActions(r.acknowledgedBy)
    const readBy = ensureReadCoversAcknowledgements(normalizeUserActions(r.readBy), acknowledgedBy)
    return {
        id: r.id,
        title: r.title,
        body: r.body,
        siteNames: Array.isArray(r.siteNames) ? r.siteNames : [],
        roles: Array.isArray(r.roles) ? r.roles : [],
        publishedAt: r.publishedAt?.toISOString?.() ?? undefined,
        expiresAt: r.expiresAt ?? undefined,
        acknowledgedBy,
        readBy,
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
    const ack = normalizeUserActions(r.acknowledgedBy)
    const read = normalizeUserActions(r.readBy)
    if (read.some((x) => x.userId === userId)) {
        const healedRead = ensureReadCoversAcknowledgements(read, ack)
        if (healedRead.length !== read.length) {
            const updated = await prisma.safetyAlert.update({
                where: { id },
                data: { readBy: healedRead, acknowledgedBy: ack },
            })
            return map(updated)
        }
        return map(r)
    }
    const readUpdated = ensureReadCoversAcknowledgements(
        [...read, { userId, at: new Date().toISOString() }],
        ack,
    )
    const updated = await prisma.safetyAlert.update({
        where: { id },
        data: { readBy: readUpdated, acknowledgedBy: ack },
    })
    return map(updated)
}

export async function acknowledgeAlert(id: string, userId: string) {
    const r = await prisma.safetyAlert.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Alert not found' }
    const ack = normalizeUserActions(r.acknowledgedBy)
    const read = normalizeUserActions(r.readBy)
    if (ack.some((x) => x.userId === userId)) {
        const healedRead = ensureReadCoversAcknowledgements(read, ack)
        if (healedRead.length !== read.length) {
            const updated = await prisma.safetyAlert.update({
                where: { id },
                data: { readBy: healedRead, acknowledgedBy: ack },
            })
            return map(updated)
        }
        return map(r)
    }
    const at = new Date().toISOString()
    const ackUpdated = [...ack, { userId, at }]
    const readUpdated = ensureReadCoversAcknowledgements(
        read.some((x) => x.userId === userId) ? read : [...read, { userId, at }],
        ackUpdated,
    )
    const updated = await prisma.safetyAlert.update({
        where: { id },
        data: {
            acknowledgedBy: ackUpdated,
            readBy: readUpdated,
        },
    })
    return map(updated)
}
