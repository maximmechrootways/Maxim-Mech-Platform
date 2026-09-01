import { prisma } from '../lib/prisma'

const ROLES = ['owner', 'hr', 'supervisor']

function canAccess(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Insufficient role for CAPA' }
}

function map(r: any) {
    return {
        id: r.id,
        actionType: r.actionType,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        title: r.title,
        description: r.description,
        assignedTo: r.assignedTo,
        dueDate: r.dueDate,
        status: r.status,
        completedAt: r.completedAt?.toISOString?.() ?? undefined,
        createdAt: r.createdAt?.toISOString?.() ?? undefined,
    }
}

export async function listCAPA(role: string, query: { status?: string; sourceType?: string }) {
    canAccess(role)
    const where: any = {}
    if (query.status) where.status = query.status
    if (query.sourceType) where.sourceType = query.sourceType
    const list = await prisma.correctiveAction.findMany({ where, orderBy: { dueDate: 'asc' } })
    return list.map(map)
}

export async function getCAPAById(id: string, role: string) {
    canAccess(role)
    const r = await prisma.correctiveAction.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'CAPA not found' }
    return map(r)
}

export async function createCAPA(role: string, data: any) {
    canAccess(role)
    const r = await prisma.correctiveAction.create({
        data: {
            actionType: data.actionType === 'preventive' ? 'preventive' : 'corrective',
            sourceType: (data.sourceType || 'incident').trim(),
            sourceId: (data.sourceId || '').trim(),
            title: (data.title || '').trim(),
            description: (data.description || '').trim(),
            assignedTo: (data.assignedTo || '').trim(),
            dueDate: (data.dueDate || '').trim(),
            status: data.status || 'open',
        },
    })
    return map(r)
}

export async function updateCAPA(id: string, role: string, data: any) {
    canAccess(role)
    const existing = await prisma.correctiveAction.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'CAPA not found' }
    const r = await prisma.correctiveAction.update({
        where: { id },
        data: {
            ...(data.actionType !== undefined && { actionType: data.actionType }),
            ...(data.sourceType !== undefined && { sourceType: data.sourceType }),
            ...(data.sourceId !== undefined && { sourceId: data.sourceId }),
            ...(data.title !== undefined && { title: data.title.trim() }),
            ...(data.description !== undefined && { description: data.description.trim() }),
            ...(data.assignedTo !== undefined && { assignedTo: data.assignedTo.trim() }),
            ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.completedAt !== undefined && { completedAt: data.completedAt ? new Date(data.completedAt) : null }),
        },
    })
    return map(r)
}

export async function deleteCAPA(id: string, role: string) {
    canAccess(role)
    await prisma.correctiveAction.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'CAPA not found' }
    })
    return { message: 'Deleted' }
}
