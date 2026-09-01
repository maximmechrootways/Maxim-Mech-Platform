import { prisma } from '../lib/prisma'

const ROLES = ['owner', 'hr', 'supervisor']

function canAccess(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Insufficient role for safety observations' }
}

function map(r: any) {
    return {
        id: r.id,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName,
        type: r.type,
        description: r.description,
        observedBy: r.observedBy,
        observedAt: r.observedAt?.toISOString?.() ?? undefined,
        photoUrl: r.photoUrl ?? undefined,
    }
}

export async function listObservations(role: string, query: { type?: string; siteId?: string }) {
    canAccess(role)
    const where: any = {}
    if (query.type) where.type = query.type
    if (query.siteId) where.siteId = query.siteId
    const list = await prisma.safetyObservation.findMany({ where, orderBy: { observedAt: 'desc' } })
    return list.map(map)
}

export async function getObservationById(id: string, role: string) {
    canAccess(role)
    const r = await prisma.safetyObservation.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Observation not found' }
    return map(r)
}

export async function createObservation(userId: string, role: string, userName: string, data: any) {
    canAccess(role)
    const r = await prisma.safetyObservation.create({
        data: {
            siteId: data.siteId?.trim() || null,
            siteName: (data.siteName || '').trim(),
            type: data.type === 'positive' || data.type === 'corrective' ? data.type : 'positive',
            description: (data.description || '').trim(),
            observedBy: data.observedBy?.trim() || userName,
            observedById: userId,
            photoUrl: data.photoUrl?.trim() || null,
        },
    })
    return map(r)
}

export async function updateObservation(id: string, role: string, data: any) {
    canAccess(role)
    const existing = await prisma.safetyObservation.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Observation not found' }
    const r = await prisma.safetyObservation.update({
        where: { id },
        data: {
            ...(data.siteName !== undefined && { siteName: data.siteName.trim() }),
            ...(data.siteId !== undefined && { siteId: data.siteId?.trim() || null }),
            ...(data.type !== undefined && { type: data.type }),
            ...(data.description !== undefined && { description: data.description.trim() }),
            ...(data.observedBy !== undefined && { observedBy: data.observedBy.trim() }),
            ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl?.trim() || null }),
        },
    })
    return map(r)
}

export async function deleteObservation(id: string, role: string) {
    canAccess(role)
    await prisma.safetyObservation.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Observation not found' }
    })
    return { message: 'Deleted' }
}
