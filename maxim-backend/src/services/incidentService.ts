import { prisma } from '../lib/prisma'
import * as auditLogService from './auditLogService'

const ROLES = ['owner', 'hr', 'supervisor']
const ENTITY = 'incident'

function canAccess(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Insufficient role for incidents' }
}

function map(r: any) {
    return {
        id: r.id,
        title: r.title,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName,
        date: r.date,
        status: r.status,
        severity: r.severity ?? undefined,
        incidentType: r.incidentType ?? undefined,
        severityLevel: r.severityLevel ?? undefined,
        equipmentInvolved: r.equipmentInvolved ?? undefined,
        description: r.description ?? undefined,
        reportedBy: r.reportedBy ?? undefined,
        reportedAt: r.reportedAt?.toISOString?.() ?? undefined,
        specificArea: r.specificArea ?? undefined,
        employeesInvolved: Array.isArray(r.employeesInvolved) ? r.employeesInvolved : [],
        actionsTaken: r.actionsTaken ?? undefined,
        correctiveActionsCompleted: r.correctiveActionsCompleted ?? false,
        photos: Array.isArray(r.photos) ? r.photos : [],
        documents: Array.isArray(r.documents) ? r.documents : [],
        employeeSignature: r.employeeSignature ?? undefined,
        reportedBySignature: r.reportedBySignature ?? undefined,
        supervisorSignature: r.supervisorSignature ?? undefined,
        signatureMeta: (r as any).signatureMeta ?? undefined,
    }
}

export async function listIncidents(role: string, query: { status?: string; siteId?: string }) {
    canAccess(role)
    const where: any = {}
    if (query.status) where.status = query.status
    if (query.siteId) where.siteId = query.siteId
    const list = await prisma.incident.findMany({ where, orderBy: { date: 'desc' } })
    return list.map(map)
}

export async function getIncidentById(id: string, role: string) {
    canAccess(role)
    const r = await prisma.incident.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Incident not found' }
    return map(r)
}

export async function createIncident(userId: string, role: string, userName: string, data: any) {
    canAccess(role)
    const r = await prisma.incident.create({
        data: {
            title: (data.title || '').trim(),
            siteId: data.siteId?.trim() || null,
            siteName: (data.siteName || '').trim(),
            date: data.date?.trim() || new Date().toISOString().slice(0, 10),
            status: data.status || 'open',
            severity: data.severity || null,
            incidentType: data.incidentType || null,
            severityLevel: data.severityLevel ?? null,
            equipmentInvolved: data.equipmentInvolved?.trim() || null,
            description: data.description?.trim() || null,
            reportedById: userId,
            reportedBy: data.reportedBy?.trim() || userName,
            specificArea: data.specificArea?.trim() || null,
            employeesInvolved: data.employeesInvolved || [],
            actionsTaken: data.actionsTaken?.trim() || null,
            correctiveActionsCompleted: data.correctiveActionsCompleted ?? false,
            photos: data.photos || [],
            documents: data.documents || [],
            employeeSignature: data.employeeSignature || null,
            reportedBySignature: data.reportedBySignature || null,
            supervisorSignature: data.supervisorSignature || null,
            signatureMeta: data.signatureMeta ?? null,
        },
    })
    await auditLogService.writeAuditLog({ userId, userName, action: 'create', entityType: ENTITY, entityId: r.id, entityLabel: r.title, linkTo: `/safety/incidents/${r.id}` }).catch(() => { })
    return map(r)
}

export async function updateIncident(id: string, role: string, data: any, audit?: { userId: string; userName: string }) {
    canAccess(role)
    const existing = await prisma.incident.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Incident not found' }
    const r = await prisma.incident.update({
        where: { id },
        data: {
            ...(data.title !== undefined && { title: data.title.trim() }),
            ...(data.siteName !== undefined && { siteName: data.siteName.trim() }),
            ...(data.siteId !== undefined && { siteId: data.siteId?.trim() || null }),
            ...(data.date !== undefined && { date: data.date }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.severity !== undefined && { severity: data.severity }),
            ...(data.incidentType !== undefined && { incidentType: data.incidentType }),
            ...(data.severityLevel !== undefined && { severityLevel: data.severityLevel }),
            ...(data.equipmentInvolved !== undefined && { equipmentInvolved: data.equipmentInvolved?.trim() || null }),
            ...(data.description !== undefined && { description: data.description?.trim() || null }),
            ...(data.specificArea !== undefined && { specificArea: data.specificArea?.trim() || null }),
            ...(data.employeesInvolved !== undefined && { employeesInvolved: data.employeesInvolved }),
            ...(data.actionsTaken !== undefined && { actionsTaken: data.actionsTaken?.trim() || null }),
            ...(data.correctiveActionsCompleted !== undefined && { correctiveActionsCompleted: data.correctiveActionsCompleted }),
            ...(data.photos !== undefined && { photos: data.photos }),
            ...(data.documents !== undefined && { documents: data.documents }),
            ...(data.employeeSignature !== undefined && { employeeSignature: data.employeeSignature }),
            ...(data.reportedBySignature !== undefined && { reportedBySignature: data.reportedBySignature }),
            ...(data.supervisorSignature !== undefined && { supervisorSignature: data.supervisorSignature }),
            ...(data.signatureMeta !== undefined && { signatureMeta: data.signatureMeta }),
        },
    })
    if (audit) await auditLogService.writeAuditLog({ userId: audit.userId, userName: audit.userName, action: 'update', entityType: ENTITY, entityId: r.id, entityLabel: r.title, linkTo: `/safety/incidents/${r.id}` }).catch(() => { })
    return map(r)
}

export async function deleteIncident(id: string, role: string, audit?: { userId: string; userName: string }) {
    canAccess(role)
    const existing = await prisma.incident.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Incident not found' }
    if (audit) await auditLogService.writeAuditLog({ userId: audit.userId, userName: audit.userName, action: 'delete', entityType: ENTITY, entityId: id, entityLabel: existing.title }).catch(() => { })
    await prisma.incident.delete({ where: { id } })
    return { message: 'Deleted' }
}
