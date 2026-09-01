import { prisma } from '../lib/prisma'
import * as jobService from './jobService'
import * as notificationService from './notificationService'

function isOwnerOrHr(role: string) {
    return role === 'owner' || role === 'hr'
}

export async function listFormSubmissions(userId: string, userRole: string, query: { status?: string; templateId?: string }) {
    const where: any = {}
    if (query.status) where.status = query.status
    if (query.templateId) where.templateId = query.templateId
    if (userRole === 'labourer') {
        where.submittedById = userId
    } else if (userRole === 'supervisor') {
        const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
        if (labourerIds.length === 0) return []
        where.submittedById = { in: labourerIds }
    }

    const list = await prisma.formSubmission.findMany({
        where,
        include: { submittedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { submittedAt: 'desc' },
    })
    return list.map((s) => ({
        id: s.id,
        templateId: s.templateId,
        templateName: s.templateName,
        status: s.status,
        submittedAt: s.submittedAt?.toISOString(),
        submittedBy: s.submittedBy ? `${s.submittedBy.firstName} ${s.submittedBy.lastName}` : undefined,
        siteName: s.siteName,
        fieldValues: s.fieldValues as object,
        workflowType: s.workflowType,
        siteSignerIds: s.siteSignerIds as string[],
        siteSignatures: s.siteSignatures as any[],
        auditEvents: s.auditEvents as any[],
    }))
}

export async function getFormSubmissionById(id: string, userId: string, userRole: string) {
    const s = await prisma.formSubmission.findUnique({
        where: { id },
        include: {
            submittedBy: { select: { id: true, firstName: true, lastName: true } },
            reviewedBy: { select: { firstName: true, lastName: true } },
        },
    })
    if (!s) throw { status: 404, message: 'Submission not found' }
    const siteSignerIds = (s.siteSignerIds as string[]) || []
    let canAccess =
        isOwnerOrHr(userRole) ||
        s.submittedById === userId ||
        siteSignerIds.includes(userId)
    if (!canAccess && userRole === 'supervisor') {
        const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
        canAccess = s.submittedById != null && labourerIds.includes(s.submittedById)
    }
    if (!canAccess) throw { status: 403, message: 'Forbidden' }

    return {
        id: s.id,
        templateId: s.templateId,
        templateName: s.templateName,
        status: s.status,
        submittedAt: s.submittedAt?.toISOString(),
        submittedBy: s.submittedBy ? `${s.submittedBy.firstName} ${s.submittedBy.lastName}` : undefined,
        submittedById: s.submittedById,
        reviewedAt: s.reviewedAt?.toISOString(),
        reviewedBy: s.reviewedBy ? `${s.reviewedBy.firstName} ${s.reviewedBy.lastName}` : undefined,
        reviewComment: s.reviewComment,
        siteName: s.siteName,
        fieldValues: s.fieldValues as object,
        workflowType: s.workflowType,
        siteSignerIds: s.siteSignerIds as string[],
        siteSignatures: s.siteSignatures as any[],
        auditEvents: s.auditEvents as any[],
        archivedAt: s.archivedAt?.toISOString(),
        archivedBy: s.archivedBy,
        submittedToHrAt: s.submittedToHrAt?.toISOString(),
        lastOpenedAt: s.lastOpenedAt?.toISOString(),
        lastOpenedBy: s.lastOpenedBy,
        lastEditedAt: s.lastEditedAt?.toISOString(),
        lastEditedBy: s.lastEditedBy,
    }
}

export async function createFormSubmission(userId: string, userRole: string, data: {
    templateId: string
    templateName: string
    status?: string
    siteName?: string
    fieldValues?: object
    workflowType?: string
    siteSignerIds?: string[]
}) {
    const userName = await getUserName(userId)
    const status = data.status || 'draft'
    const auditEvents = [
        { id: `ev-${Date.now()}`, type: 'draft_created', at: new Date().toISOString(), by: userName },
    ]
    if (status !== 'draft') {
        auditEvents.push({ id: `ev-${Date.now()}-2`, type: 'submitted', at: new Date().toISOString(), by: userName })
    }
    const submission = await prisma.formSubmission.create({
        data: {
            templateId: data.templateId,
            templateName: data.templateName,
            status,
            submittedById: status !== 'draft' ? userId : null,
            submittedAt: status !== 'draft' ? new Date() : null,
            siteName: data.siteName,
            fieldValues: (data.fieldValues || {}) as any,
            workflowType: data.workflowType || 'standard',
            siteSignerIds: (data.siteSignerIds || []) as any,
            siteSignatures: [],
            auditEvents: auditEvents as any,
        },
    })
    return { id: submission.id, status: submission.status, submittedAt: submission.submittedAt?.toISOString() }
}

export async function updateFormSubmission(id: string, userId: string, userRole: string, data: {
    status?: string
    reviewComment?: string
    siteSignatures?: { userId: string; signedAt: string }[]
    submittedToHrAt?: string
    lastOpenedAt?: string
    lastOpenedBy?: string
    lastEditedAt?: string
    lastEditedBy?: string
    auditEvent?: { type: string; comment?: string }
}) {
    const submission = await prisma.formSubmission.findUnique({ where: { id } })
    if (!submission) throw { status: 404, message: 'Submission not found' }
    const userName = await getUserName(userId)
    const updateData: any = {}
    if (data.status !== undefined) updateData.status = data.status
    if (data.reviewComment !== undefined) updateData.reviewComment = data.reviewComment
    if (data.status === 'approved' || data.status === 'rejected') {
        updateData.reviewedById = userId
        updateData.reviewedAt = new Date()
    }
    if (data.siteSignatures !== undefined) updateData.siteSignatures = data.siteSignatures as any
    if (data.submittedToHrAt !== undefined) updateData.submittedToHrAt = new Date(data.submittedToHrAt)
    if (data.lastOpenedAt !== undefined) updateData.lastOpenedAt = new Date(data.lastOpenedAt)
    if (data.lastOpenedBy !== undefined) updateData.lastOpenedBy = data.lastOpenedBy
    if (data.lastEditedAt !== undefined) updateData.lastEditedAt = new Date(data.lastEditedAt)
    if (data.lastEditedBy !== undefined) updateData.lastEditedBy = data.lastEditedBy
    if (data.auditEvent) {
        const events = (submission.auditEvents as any[]) || []
        events.push({
            id: `ev-${Date.now()}`,
            type: data.auditEvent.type,
            at: new Date().toISOString(),
            by: userName,
            comment: data.auditEvent.comment,
        })
        updateData.auditEvents = events
    }
    await prisma.formSubmission.update({ where: { id }, data: updateData })
    if (data.status === 'approved' && submission.submittedById) {
        await notificationService.createNotification({
            userId: submission.submittedById,
            title: 'Submission approved',
            body: `Your submission "${submission.templateName}" has been approved.`,
            type: 'info',
            linkTo: '/forms',
            emailPreferenceKey: 'forms_pending',
        }).catch(() => {})
    }
    return await getFormSubmissionById(id, userId, userRole)
}

async function getUserName(userId: string): Promise<string> {
    const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
    })
    return u ? `${u.firstName} ${u.lastName}` : 'Unknown'
}
