import { prisma } from '../lib/prisma'
import { sanitizeText } from '../utils/sanitize'

const ROLES = ['owner', 'hr', 'supervisor']

function canAccess(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Insufficient role for hazards' }
}

function map(r: any) {
    const controls = r.recommendedControls
    return {
        id: r.id,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName,
        jobId: r.jobId ?? undefined,
        title: r.title,
        description: r.description,
        reportedBy: r.reportedBy,
        reportedAt: r.reportedAt?.toISOString?.() ?? undefined,
        status: r.status,
        assignedTo: r.assignedTo ?? undefined,
        dueDate: r.dueDate ?? undefined,
        closedAt: r.closedAt?.toISOString?.() ?? undefined,
        likelihood: r.likelihood ?? undefined,
        impact: r.impact ?? undefined,
        riskLevel: r.riskLevel ?? undefined,
        recommendedControls: Array.isArray(controls) ? controls : [],
    }
}

export async function listHazards(role: string, query: { status?: string; siteId?: string }) {
    canAccess(role)
    const where: any = {}
    if (query.status) where.status = query.status
    if (query.siteId) where.siteId = query.siteId
    const list = await prisma.hazardReport.findMany({ where, orderBy: { reportedAt: 'desc' } })
    return list.map(map)
}

export async function getHazardById(id: string, role: string) {
    canAccess(role)
    const r = await prisma.hazardReport.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Hazard not found' }
    return map(r)
}

export async function createHazard(userId: string, role: string, userName: string, data: any) {
    canAccess(role)
    const controls = Array.isArray(data.recommendedControls) ? data.recommendedControls : []
    const r = await prisma.hazardReport.create({
        data: {
            siteId: data.siteId?.trim() || null,
            siteName: sanitizeText(data.siteName),
            jobId: data.jobId?.trim() || null,
            title: sanitizeText(data.title),
            description: sanitizeText(data.description),
            reportedBy: sanitizeText(data.reportedBy) || userName,
            reportedById: userId,
            status: data.status || 'open',
            assignedTo: data.assignedTo?.trim() || null,
            dueDate: data.dueDate?.trim() || null,
            likelihood: data.likelihood ?? null,
            impact: data.impact ?? null,
            riskLevel: data.riskLevel || null,
            recommendedControls: controls,
        },
    })
    return map(r)
}

export async function updateHazard(id: string, role: string, data: any) {
    canAccess(role)
    const existing = await prisma.hazardReport.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Hazard not found' }
    const payload: Record<string, unknown> = {}
    if (data.siteName !== undefined) payload.siteName = data.siteName.trim()
    if (data.siteId !== undefined) payload.siteId = data.siteId?.trim() || null
    if (data.jobId !== undefined) payload.jobId = data.jobId?.trim() || null
    if (data.title !== undefined) payload.title = data.title.trim()
    if (data.description !== undefined) payload.description = data.description.trim()
    if (data.status !== undefined) payload.status = data.status
    if (data.assignedTo !== undefined) payload.assignedTo = data.assignedTo?.trim() || null
    if (data.dueDate !== undefined) payload.dueDate = data.dueDate?.trim() || null
    if (data.closedAt !== undefined) payload.closedAt = data.closedAt ? new Date(data.closedAt) : null
    if (data.likelihood !== undefined) payload.likelihood = data.likelihood
    if (data.impact !== undefined) payload.impact = data.impact
    if (data.riskLevel !== undefined) payload.riskLevel = data.riskLevel
    if (data.recommendedControls !== undefined) payload.recommendedControls = Array.isArray(data.recommendedControls) ? data.recommendedControls : existing.recommendedControls
    const r = await prisma.hazardReport.update({ where: { id }, data: payload })
    return map(r)
}

export async function deleteHazard(id: string, role: string) {
    canAccess(role)
    await prisma.hazardReport.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Hazard not found' }
    })
    return { message: 'Deleted' }
}
