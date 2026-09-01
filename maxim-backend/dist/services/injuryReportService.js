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
exports.listInjuryReports = listInjuryReports;
exports.getInjuryReportById = getInjuryReportById;
exports.createInjuryReport = createInjuryReport;
exports.updateInjuryReport = updateInjuryReport;
exports.deleteInjuryReport = deleteInjuryReport;
exports.getRootCauseByLinked = getRootCauseByLinked;
exports.upsertRootCause = upsertRootCause;
const prisma_1 = require("../lib/prisma");
const sanitize_1 = require("../utils/sanitize");
const notificationService = __importStar(require("./notificationService"));
const ALLOWED_ROLES = ['owner', 'hr', 'supervisor'];
function canAccess(userRole) {
    if (!ALLOWED_ROLES.includes(userRole))
        throw { status: 403, message: 'Insufficient role for injury reports' };
}
function mapInjuryReport(r) {
    return {
        id: r.id,
        jobId: r.jobId ?? undefined,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName,
        reportedById: r.reportedById,
        reportedBy: r.reportedBy,
        reportedAt: r.reportedAt?.toISOString?.() ?? r.reportedAt,
        status: r.status,
        severity: r.severity,
        description: r.description,
        followUpNotes: r.followUpNotes ?? undefined,
        injuredPersonName: r.injuredPersonName ?? undefined,
        injuredPersonId: r.injuredPersonId ?? undefined,
        injuryType: r.injuryType ?? undefined,
        bodyPart: r.bodyPart ?? undefined,
        mechanism: r.mechanism ?? undefined,
        dateOfInjury: r.dateOfInjury ?? undefined,
        lostTime: r.lostTime ?? false,
        daysAwayFromWork: r.daysAwayFromWork ?? undefined,
        restrictedDutyDays: r.restrictedDutyDays ?? undefined,
        wsibReported: r.wsibReported ?? false,
        wsibClaimNumber: r.wsibClaimNumber ?? undefined,
        wsibReportedAt: r.wsibReportedAt?.toISOString?.() ?? undefined,
        subcontractorId: r.subcontractorId ?? undefined,
        photoUrl: r.photoUrl ?? undefined,
    };
}
async function listInjuryReports(userId, userRole, query) {
    canAccess(userRole);
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.jobId)
        where.jobId = query.jobId;
    if (query.subcontractorId)
        where.subcontractorId = query.subcontractorId;
    const list = await prisma_1.prisma.injuryReport.findMany({
        where,
        orderBy: { reportedAt: 'desc' },
    });
    return list.map(mapInjuryReport);
}
async function getInjuryReportById(id, userRole) {
    canAccess(userRole);
    const r = await prisma_1.prisma.injuryReport.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Injury report not found' };
    return mapInjuryReport(r);
}
async function createInjuryReport(userId, userRole, userName, data) {
    canAccess(userRole);
    const report = await prisma_1.prisma.injuryReport.create({
        data: {
            jobId: data.jobId?.trim() || null,
            siteId: data.siteId?.trim() || null,
            siteName: (0, sanitize_1.sanitizeText)(data.siteName),
            reportedById: userId,
            reportedBy: (0, sanitize_1.sanitizeText)(data.reportedBy) || userName,
            status: data.status || 'draft',
            severity: data.severity || 'minor',
            description: (0, sanitize_1.sanitizeText)(data.description),
            followUpNotes: data.followUpNotes ? (0, sanitize_1.sanitizeText)(data.followUpNotes) : null,
            injuredPersonName: data.injuredPersonName ? (0, sanitize_1.sanitizeText)(data.injuredPersonName) : null,
            injuredPersonId: data.injuredPersonId || null,
            injuryType: data.injuryType || null,
            bodyPart: data.bodyPart || null,
            mechanism: data.mechanism || null,
            dateOfInjury: data.dateOfInjury || null,
            lostTime: data.lostTime ?? false,
            daysAwayFromWork: data.daysAwayFromWork ?? null,
            restrictedDutyDays: data.restrictedDutyDays ?? null,
            wsibReported: data.wsibReported ?? false,
            wsibClaimNumber: data.wsibClaimNumber?.trim() || null,
            wsibReportedAt: data.wsibReportedAt ? new Date(data.wsibReportedAt) : null,
            subcontractorId: data.subcontractorId || null,
            photoUrl: data.photoUrl?.trim() || null,
        },
    });
    await notificationService.notifyOwnerAndHr({
        title: 'New injury report',
        body: report.description ? `${report.description.slice(0, 80)}${report.description.length > 80 ? '…' : ''}` : `Report at ${report.siteName || 'site'}`,
        type: 'injury',
        linkTo: `/injury-reports/${report.id}`,
        emailPreferenceKey: 'incidents',
    }).catch(() => { });
    return mapInjuryReport(report);
}
async function updateInjuryReport(id, userRole, data) {
    canAccess(userRole);
    const existing = await prisma_1.prisma.injuryReport.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Injury report not found' };
    const report = await prisma_1.prisma.injuryReport.update({
        where: { id },
        data: {
            ...(data.siteName !== undefined && { siteName: data.siteName.trim() }),
            ...(data.reportedBy !== undefined && { reportedBy: data.reportedBy.trim() }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.severity !== undefined && { severity: data.severity }),
            ...(data.description !== undefined && { description: data.description.trim() }),
            ...(data.followUpNotes !== undefined && { followUpNotes: data.followUpNotes?.trim() || null }),
            ...(data.injuredPersonName !== undefined && { injuredPersonName: data.injuredPersonName?.trim() || null }),
            ...(data.injuredPersonId !== undefined && { injuredPersonId: data.injuredPersonId || null }),
            ...(data.injuryType !== undefined && { injuryType: data.injuryType || null }),
            ...(data.bodyPart !== undefined && { bodyPart: data.bodyPart || null }),
            ...(data.mechanism !== undefined && { mechanism: data.mechanism || null }),
            ...(data.dateOfInjury !== undefined && { dateOfInjury: data.dateOfInjury || null }),
            ...(data.lostTime !== undefined && { lostTime: data.lostTime }),
            ...(data.daysAwayFromWork !== undefined && { daysAwayFromWork: data.daysAwayFromWork ?? null }),
            ...(data.restrictedDutyDays !== undefined && { restrictedDutyDays: data.restrictedDutyDays ?? null }),
            ...(data.wsibReported !== undefined && { wsibReported: data.wsibReported }),
            ...(data.wsibClaimNumber !== undefined && { wsibClaimNumber: data.wsibClaimNumber?.trim() || null }),
            ...(data.wsibReportedAt !== undefined && { wsibReportedAt: data.wsibReportedAt ? new Date(data.wsibReportedAt) : null }),
            ...(data.jobId !== undefined && { jobId: data.jobId?.trim() || null }),
            ...(data.siteId !== undefined && { siteId: data.siteId?.trim() || null }),
            ...(data.subcontractorId !== undefined && { subcontractorId: data.subcontractorId || null }),
            ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl?.trim() || null }),
        },
    });
    return mapInjuryReport(report);
}
async function deleteInjuryReport(id, userRole) {
    canAccess(userRole);
    await prisma_1.prisma.injuryReport.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Injury report not found' };
    });
    return { message: 'Deleted' };
}
// Root cause
async function getRootCauseByLinked(linkedType, linkedId, userRole) {
    canAccess(userRole);
    const r = await prisma_1.prisma.rootCauseAnalysis.findUnique({
        where: { linkedType_linkedId: { linkedType, linkedId } },
    });
    if (!r)
        return null;
    return {
        id: r.id,
        linkedType: r.linkedType,
        linkedId: r.linkedId,
        immediateCause: r.immediateCause,
        contributingCauses: r.contributingCauses ?? [],
        underlyingCause: r.underlyingCause ?? undefined,
        analyzedBy: r.analyzedBy,
        analyzedAt: r.analyzedAt?.toISOString?.() ?? r.analyzedAt,
    };
}
async function upsertRootCause(userId, userRole, userName, data) {
    canAccess(userRole);
    const contributing = Array.isArray(data.contributingCauses) ? data.contributingCauses : [];
    const existing = await prisma_1.prisma.rootCauseAnalysis.findUnique({
        where: { linkedType_linkedId: { linkedType: data.linkedType, linkedId: data.linkedId } },
    });
    const payload = {
        immediateCause: data.immediateCause.trim(),
        contributingCauses: contributing,
        underlyingCause: data.underlyingCause?.trim() || null,
        analyzedById: userId,
        analyzedBy: userName,
    };
    if (existing) {
        const r = await prisma_1.prisma.rootCauseAnalysis.update({
            where: { id: existing.id },
            data: payload,
        });
        return { id: r.id, linkedType: r.linkedType, linkedId: r.linkedId, ...payload, analyzedAt: r.analyzedAt?.toISOString?.() };
    }
    const r = await prisma_1.prisma.rootCauseAnalysis.create({
        data: {
            linkedType: data.linkedType,
            linkedId: data.linkedId,
            ...payload,
        },
    });
    return { id: r.id, linkedType: r.linkedType, linkedId: r.linkedId, ...payload, analyzedAt: r.analyzedAt?.toISOString?.() };
}
