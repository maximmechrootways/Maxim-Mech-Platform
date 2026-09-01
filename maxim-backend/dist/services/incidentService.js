"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listIncidents = listIncidents;
exports.getIncidentById = getIncidentById;
exports.createIncident = createIncident;
exports.updateIncident = updateIncident;
exports.deleteIncident = deleteIncident;
const prisma_1 = require("../lib/prisma");
const auditLogService = __importStar(require("./auditLogService"));
const ROLES = ['owner', 'hr', 'supervisor'];
const ENTITY = 'incident';
function canAccess(role) {
    if (!ROLES.includes(role))
        throw { status: 403, message: 'Insufficient role for incidents' };
}
function map(r) {
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
        signatureMeta: r.signatureMeta ?? undefined,
    };
}
async function listIncidents(role, query) {
    canAccess(role);
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.siteId)
        where.siteId = query.siteId;
    const list = await prisma_1.prisma.incident.findMany({ where, orderBy: { date: 'desc' } });
    return list.map(map);
}
async function getIncidentById(id, role) {
    canAccess(role);
    const r = await prisma_1.prisma.incident.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Incident not found' };
    return map(r);
}
async function createIncident(userId, role, userName, data) {
    canAccess(role);
    const r = await prisma_1.prisma.incident.create({
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
    });
    await auditLogService.writeAuditLog({ userId, userName, action: 'create', entityType: ENTITY, entityId: r.id, entityLabel: r.title, linkTo: `/safety/incidents/${r.id}` }).catch(() => { });
    return map(r);
}
async function updateIncident(id, role, data, audit) {
    canAccess(role);
    const existing = await prisma_1.prisma.incident.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Incident not found' };
    const r = await prisma_1.prisma.incident.update({
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
    });
    if (audit)
        await auditLogService.writeAuditLog({ userId: audit.userId, userName: audit.userName, action: 'update', entityType: ENTITY, entityId: r.id, entityLabel: r.title, linkTo: `/safety/incidents/${r.id}` }).catch(() => { });
    return map(r);
}
async function deleteIncident(id, role, audit) {
    canAccess(role);
    const existing = await prisma_1.prisma.incident.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Incident not found' };
    if (audit)
        await auditLogService.writeAuditLog({ userId: audit.userId, userName: audit.userName, action: 'delete', entityType: ENTITY, entityId: id, entityLabel: existing.title }).catch(() => { });
    await prisma_1.prisma.incident.delete({ where: { id } });
    return { message: 'Deleted' };
}
