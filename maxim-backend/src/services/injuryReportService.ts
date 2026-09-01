import { prisma } from '../lib/prisma'
import { sanitizeText } from '../utils/sanitize'
import * as notificationService from './notificationService'

const ALLOWED_ROLES = ['owner', 'hr', 'supervisor']

function canAccess(userRole: string) {
    if (!ALLOWED_ROLES.includes(userRole)) throw { status: 403, message: 'Insufficient role for injury reports' }
}

function mapInjuryReport(r: any) {
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
    }
}

export async function listInjuryReports(userId: string, userRole: string, query: { status?: string; jobId?: string; subcontractorId?: string }) {
    canAccess(userRole)
    const where: any = {}
    if (query.status) where.status = query.status
    if (query.jobId) where.jobId = query.jobId
    if (query.subcontractorId) where.subcontractorId = query.subcontractorId
    const list = await prisma.injuryReport.findMany({
        where,
        orderBy: { reportedAt: 'desc' },
    })
    return list.map(mapInjuryReport)
}

export async function getInjuryReportById(id: string, userRole: string) {
    canAccess(userRole)
    const r = await prisma.injuryReport.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Injury report not found' }
    return mapInjuryReport(r)
}

export async function createInjuryReport(userId: string, userRole: string, userName: string, data: any) {
    canAccess(userRole)
    const report = await prisma.injuryReport.create({
        data: {
            jobId: data.jobId?.trim() || null,
            siteId: data.siteId?.trim() || null,
            siteName: sanitizeText(data.siteName),
            reportedById: userId,
            reportedBy: sanitizeText(data.reportedBy) || userName,
            status: data.status || 'draft',
            severity: data.severity || 'minor',
            description: sanitizeText(data.description),
            followUpNotes: data.followUpNotes ? sanitizeText(data.followUpNotes) : null,
            injuredPersonName: data.injuredPersonName ? sanitizeText(data.injuredPersonName) : null,
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
    })
    await notificationService.notifyOwnerAndHr({
        title: 'New injury report',
        body: report.description ? `${report.description.slice(0, 80)}${report.description.length > 80 ? '…' : ''}` : `Report at ${report.siteName || 'site'}`,
        type: 'injury',
        linkTo: `/injury-reports/${report.id}`,
        emailPreferenceKey: 'incidents',
    }).catch(() => {})
    return mapInjuryReport(report)
}

export async function updateInjuryReport(id: string, userRole: string, data: any) {
    canAccess(userRole)
    const existing = await prisma.injuryReport.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Injury report not found' }
    const report = await prisma.injuryReport.update({
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
    })
    return mapInjuryReport(report)
}

export async function deleteInjuryReport(id: string, userRole: string) {
    canAccess(userRole)
    await prisma.injuryReport.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Injury report not found' }
    })
    return { message: 'Deleted' }
}

// Root cause
export async function getRootCauseByLinked(linkedType: string, linkedId: string, userRole: string) {
    canAccess(userRole)
    const r = await prisma.rootCauseAnalysis.findUnique({
        where: { linkedType_linkedId: { linkedType, linkedId } },
    })
    if (!r) return null
    return {
        id: r.id,
        linkedType: r.linkedType,
        linkedId: r.linkedId,
        immediateCause: r.immediateCause,
        contributingCauses: (r.contributingCauses as string[]) ?? [],
        underlyingCause: r.underlyingCause ?? undefined,
        analyzedBy: r.analyzedBy,
        analyzedAt: r.analyzedAt?.toISOString?.() ?? r.analyzedAt,
    }
}

export async function upsertRootCause(userId: string, userRole: string, userName: string, data: {
    linkedType: string
    linkedId: string
    immediateCause: string
    contributingCauses?: string[]
    underlyingCause?: string
}) {
    canAccess(userRole)
    const contributing = Array.isArray(data.contributingCauses) ? data.contributingCauses : []
    const existing = await prisma.rootCauseAnalysis.findUnique({
        where: { linkedType_linkedId: { linkedType: data.linkedType, linkedId: data.linkedId } },
    })
    const payload = {
        immediateCause: data.immediateCause.trim(),
        contributingCauses: contributing,
        underlyingCause: data.underlyingCause?.trim() || null,
        analyzedById: userId,
        analyzedBy: userName,
    }
    if (existing) {
        const r = await prisma.rootCauseAnalysis.update({
            where: { id: existing.id },
            data: payload,
        })
        return { id: r.id, linkedType: r.linkedType, linkedId: r.linkedId, ...payload, analyzedAt: r.analyzedAt?.toISOString?.() }
    }
    const r = await prisma.rootCauseAnalysis.create({
        data: {
            linkedType: data.linkedType,
            linkedId: data.linkedId,
            ...payload,
        },
    })
    return { id: r.id, linkedType: r.linkedType, linkedId: r.linkedId, ...payload, analyzedAt: r.analyzedAt?.toISOString?.() }
}
