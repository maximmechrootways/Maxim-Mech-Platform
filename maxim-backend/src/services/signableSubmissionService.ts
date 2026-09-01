import { prisma } from '../lib/prisma'
import * as jobService from './jobService'
import * as notificationService from './notificationService'

function isOwnerOrHr(role: string) {
    return role === 'owner' || role === 'hr'
}

export async function passAlongFormAssignment(userId: string, data: { assignmentId: string; toUserId: string; note?: string; dueDate?: string }) {
    const original = await prisma.formAssignment.findUnique({
        where: { id: data.assignmentId },
        include: { signableFormTemplate: true, submission: true },
    })
    if (!original) throw { status: 404, message: 'Assignment not found' }
    if (original.status !== 'completed') throw { status: 400, message: 'Form must be signed/completed before passing along' }

    const alreadyAssigned = await prisma.formAssignment.findFirst({
        where: {
            signableFormTemplateId: original.signableFormTemplateId,
            assignedToUserId: data.toUserId,
            passedFromId: original.id,
        },
    })
    if (alreadyAssigned) throw { status: 409, message: 'This person has already been assigned this form' }

    const newAssignment = await prisma.formAssignment.create({
        data: {
            signableFormTemplateId: original.signableFormTemplateId,
            assignedById: userId,
            assignedToUserId: data.toUserId,
            passedFromId: original.id,
            formDataSnapshot: original.submission?.fieldValues ?? {},
            signedPdfUrl: original.signedPdfUrl ?? original.submission?.signatureFilePath,
            status: 'pending',
            note: data.note ?? null,
            dueDate: data.dueDate ? new Date(data.dueDate).toISOString().slice(0, 10) : original.dueDate,
        },
    })

    const sender = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } })
    const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'Someone'
    await notificationService.createNotification({
        userId: data.toUserId,
        title: 'Form passed to you',
        body: `${senderName} has sent you "${original.signableFormTemplate.name}" to review and sign.`,
        type: 'info',
        linkTo: '/daily-forms',
        emailPreferenceKey: 'signature_required',
    }).catch(() => {})

    return newAssignment
}

export async function getAssignmentChain(assignmentId: string) {
    async function getRootId(id: string): Promise<string> {
        const assignment = await prisma.formAssignment.findUnique({
            where: { id },
            select: { passedFromId: true },
        })
        if (!assignment?.passedFromId) return id
        return getRootId(assignment.passedFromId)
    }

    const rootId = await getRootId(assignmentId)

    const chainRaw = await prisma.$queryRaw<any[]>`
      WITH RECURSIVE chain AS (
        SELECT * FROM "FormAssignment" WHERE id = ${rootId}
        UNION ALL
        SELECT fa.* FROM "FormAssignment" fa
        INNER JOIN chain c ON fa."passedFromId" = c.id
      )
      SELECT
        c.id,
        c.status,
        c."assignedToUserId",
        c."formDataSnapshot",
        c."signedPdfUrl",
        c."createdAt",
        u."firstName",
        u."lastName",
        u.role AS "assignedToRole",
        fs."signatureText",
        fs."submittedAt",
        fs."submittedById" AS "signatoryId"
      FROM chain c
      LEFT JOIN "User" u ON u.id = c."assignedToUserId"
      LEFT JOIN "SignableFormSubmission" fs ON fs."assignmentId" = c.id
      ORDER BY c."createdAt" ASC
    `
    
    return chainRaw.map((row) => ({
        id: row.id,
        status: row.status,
        assignedToUserId: row.assignedToUserId,
        assignedToName: row.firstName ? `${row.firstName} ${row.lastName}`.trim() : 'Unknown',
        assignedToRole: row.assignedToRole,
        formDataSnapshot: row.formDataSnapshot,
        signedPdfUrl: row.signedPdfUrl,
        createdAt: row.createdAt?.toISOString?.(),
        signatureText: row.signatureText,
        submittedAt: row.submittedAt?.toISOString?.(),
        signatoryId: row.signatoryId,
    }))
}

export async function listDailyForms(userId: string, userRole: string) {
    const templates = await prisma.signableFormTemplate.findMany({
        where: { active: true },
    })
    const today = new Date().toISOString().slice(0, 10)
    const result: any[] = []
    for (const t of templates) {
        const roles = (t.assignedToRoles as string[]) || []
        const userIds = (t.assignedToUserIds as string[]) || []
        const assignedToMe = roles.includes(userRole) || userIds.includes(userId)
        if (!assignedToMe && !isOwnerOrHr(userRole)) continue

        let dueDate = today
        if (t.schedule === 'weekly') {
            const d = new Date()
            const day = d.getDay()
            const diff = 7 - day
            d.setDate(d.getDate() + (diff === 7 ? 0 : diff))
            dueDate = d.toISOString().slice(0, 10)
        } else if (t.schedule === 'monthly') {
            const d = new Date()
            d.setMonth(d.getMonth() + 1)
            d.setDate(1)
            d.setDate(d.getDate() - 1)
            dueDate = d.toISOString().slice(0, 10)
        }

        const dueStart = new Date(dueDate + 'T00:00:00.000Z')
        const dueEnd = new Date(dueDate + 'T23:59:59.999Z')
        const existing = await prisma.signableFormSubmission.findFirst({
            where: {
                signableFormId: t.id,
                submittedById: userId,
                submittedAt: { gte: dueStart, lte: dueEnd },
            },
        })
        result.push({
            id: `df-${t.id}-${dueDate}`,
            signableFormId: t.id,
            templateName: t.name,
            dueDate,
            status: existing ? 'signed' : 'pending',
            assignedToRole: userRole,
            assignedToUserId: userIds.includes(userId) ? userId : undefined,
            schedule: t.schedule,
        })
    }

    // Add supervisor/HR assignments for this user (specific due date)
    const assignments = await prisma.formAssignment.findMany({
        where: { assignedToUserId: userId },
        include: { signableFormTemplate: true },
    })
    for (const a of assignments) {
        const t = a.signableFormTemplate
        const dueStart = new Date(a.dueDate + 'T00:00:00.000Z')
        const dueEnd = new Date(a.dueDate + 'T23:59:59.999Z')
        const existing = await prisma.signableFormSubmission.findFirst({
            where: {
                assignmentId: a.id,
            },
        })
        const alreadyInList = result.some(
            (r) => r.signableFormId === t.id && r.dueDate === a.dueDate && r.id.startsWith('df-')
        )
        if (!alreadyInList) {
            result.push({
                id: a.id,
                signableFormId: t.id,
                templateName: t.name,
                dueDate: a.dueDate,
                status: a.status === 'completed' || existing ? 'signed' : 'pending',
                assignedToRole: undefined,
                assignedToUserId: userId,
                schedule: a.schedule,
                passedFromId: a.passedFromId,
                formDataSnapshot: a.formDataSnapshot,
            })
        }
    }

    return result
}

/** Supervisor or HR assigns a template to specific user(s) for a due date; they see it in Daily forms. */
export async function createFormAssignments(
    assignedById: string,
    userRole: string,
    data: {
        signableFormTemplateId: string
        assignedToUserIds?: string[]
        signatories?: { userId: string; order: number }[]
        dueDate: string
        schedule: 'daily' | 'monthly' | 'yearly'
    }
) {
    const isSupervisor = userRole === 'supervisor'
    if (!isOwnerOrHr(userRole) && !isSupervisor) throw { status: 403, message: 'Only Supervisor, Owner, or HR can assign forms' }

    const template = await prisma.signableFormTemplate.findUnique({
        where: { id: data.signableFormTemplateId },
    })
    if (!template) throw { status: 404, message: 'Template not found' }
    if (!template.active) throw { status: 400, message: 'Template is not active' }

    if (data.signatories && data.signatories.length > 0) {
        // Sequential signing workflow
        let allowedSignatories = data.signatories
        if (isSupervisor && !isOwnerOrHr(userRole)) {
            const supervisedIds = await jobService.getLabourerIdsSupervisedBy(assignedById)
            allowedSignatories = data.signatories.filter((s) => supervisedIds.includes(s.userId))
            if (allowedSignatories.length === 0) throw { status: 403, message: 'You can only assign to people on your team' }
        }

        const newAssignment = await prisma.formAssignment.create({
            data: {
                signableFormTemplateId: data.signableFormTemplateId,
                assignedToUserId: allowedSignatories[0].userId, // Start with first person
                assignedById,
                dueDate: data.dueDate,
                schedule: data.schedule,
                chainStatus: 'in_progress',
                currentStep: 0,
                signatories: {
                    create: allowedSignatories.map(s => ({
                        userId: s.userId,
                        order: s.order,
                        status: 'pending'
                    }))
                }
            },
            include: { signatories: true }
        })

        // Notify first signatory
        const firstSignatory = newAssignment.signatories.find(s => s.order === 1)
        if (firstSignatory) {
            await prisma.formSignatory.update({
                where: { id: firstSignatory.id },
                data: { status: 'notified' }
            })
            
            const assigner = await prisma.user.findUnique({
                where: { id: assignedById },
                select: { firstName: true, lastName: true },
            })
            const assignerName = assigner ? `${assigner.firstName} ${assigner.lastName}`.trim() : 'Your supervisor'
            await notificationService.createNotification({
                userId: firstSignatory.userId,
                title: 'Form requires your signature',
                body: `${assignerName} asked you to sign "${template.name}".`,
                type: 'info',
                linkTo: `/daily-forms/sign-sequential/${newAssignment.id}`,
                emailPreferenceKey: 'signature_required',
            }).catch(() => {})
        }

        return { assigned: 1, userIds: allowedSignatories.map(s => s.userId) }
    }

    // Legacy bulk individual assignments
    const userIds = data.assignedToUserIds || []
    let allowedUserIds = userIds
    if (isSupervisor && !isOwnerOrHr(userRole)) {
        const supervisedIds = await jobService.getLabourerIdsSupervisedBy(assignedById)
        allowedUserIds = userIds.filter((id) => supervisedIds.includes(id))
        if (allowedUserIds.length === 0) throw { status: 403, message: 'You can only assign to people on your team (labourers on your jobs)' }
    }

    const created = await prisma.formAssignment.createMany({
        data: allowedUserIds.map((assignedToUserId) => ({
            signableFormTemplateId: data.signableFormTemplateId,
            assignedToUserId,
            assignedById,
            dueDate: data.dueDate,
            schedule: data.schedule,
        })),
    })

    const assigner = await prisma.user.findUnique({
        where: { id: assignedById },
        select: { firstName: true, lastName: true },
    })
    const assignerName = assigner ? `${assigner.firstName} ${assigner.lastName}`.trim() : 'Your supervisor'
    const dueLabel = data.dueDate
    for (const assignedToUserId of allowedUserIds) {
        await notificationService.createNotification({
            userId: assignedToUserId,
            title: 'Form assigned to you',
            body: `${assignerName} assigned you "${template.name}". Due ${dueLabel}. Complete it in Daily forms.`,
            type: 'info',
            linkTo: '/daily-forms',
            emailPreferenceKey: 'signature_required',
        }).catch(() => {})
    }
    return { assigned: created.count, userIds: allowedUserIds }
}

export async function listSignableSubmissions(userId: string, userRole: string, query: { signableFormId?: string }) {
    const where: any = {}
    if (query.signableFormId) where.signableFormId = query.signableFormId
    if (!isOwnerOrHr(userRole)) {
        if (userRole === 'supervisor') {
            const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
            const visibleSubmitterIds = labourerIds.length > 0 ? [userId, ...labourerIds] : [userId]
            where.OR = [
                { submittedById: { in: visibleSubmitterIds } },
                // Also include forms where this supervisor is explicitly in the signing chain.
                { siteSignerIds: { array_contains: [userId] } },
            ]
        } else {
            where.OR = [
                { submittedById: userId },
                // Required so recipients can see forms sent to them for signing.
                { siteSignerIds: { array_contains: [userId] } },
            ]
        }
    }
    const list = await prisma.signableFormSubmission.findMany({
        where,
        include: { submittedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { submittedAt: 'desc' },
    })
    return list.map((s) => ({
        id: s.id,
        signableFormId: s.signableFormId,
        templateName: s.templateName,
        dailyFormId: s.dailyFormId,
        submittedById: s.submittedById,
        submittedBy: `${s.submittedBy.firstName} ${s.submittedBy.lastName}`,
        submittedAt: s.submittedAt.toISOString(),
        fieldValues: s.fieldValues as object,
        signatureText: s.signatureText,
        siteSignerIds: s.siteSignerIds as string[],
        siteSignatures: s.siteSignatures as any[],
        submittedToHrAt: s.submittedToHrAt?.toISOString(),
    }))
}

export async function getSignableSubmissionById(id: string, userId: string, userRole: string) {
    const s = await prisma.signableFormSubmission.findUnique({
        where: { id },
        include: { submittedBy: { select: { firstName: true, lastName: true } } },
    })
    if (!s) throw { status: 404, message: 'Submission not found' }
    if (!isOwnerOrHr(userRole)) {
        if (userRole === 'supervisor') {
            const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
            const allowed = s.submittedById === userId || (s.submittedById != null && labourerIds.includes(s.submittedById))
            if (!allowed) throw { status: 403, message: 'Forbidden' }
        } else if (s.submittedById !== userId) {
            const siteSignerIds = (s.siteSignerIds as string[]) || []
            if (!siteSignerIds.includes(userId)) throw { status: 403, message: 'Forbidden' }
        }
    }
    const siteSignerIds = (s.siteSignerIds as string[]) || []
    let siteSignerNames: Record<string, string> = {}
    if (siteSignerIds.length > 0) {
        const users = await prisma.user.findMany({
            where: { id: { in: siteSignerIds } },
            select: { id: true, firstName: true, lastName: true },
        })
        siteSignerNames = Object.fromEntries(
            users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])
        )
    }
    return {
        id: s.id,
        signableFormId: s.signableFormId,
        templateName: s.templateName,
        dailyFormId: s.dailyFormId,
        submittedById: s.submittedById,
        submittedBy: `${s.submittedBy.firstName} ${s.submittedBy.lastName}`,
        submittedAt: s.submittedAt.toISOString(),
        fieldValues: s.fieldValues as object,
        signatureText: s.signatureText,
        geoLat: s.geoLat,
        geoLng: s.geoLng,
        geoAddress: s.geoAddress,
        workflowType: s.workflowType,
        siteSignerIds: s.siteSignerIds as string[],
        siteSignatures: s.siteSignatures as any[],
        submittedToHrAt: s.submittedToHrAt?.toISOString(),
        siteSignerNames,
    }
}

export async function createSignableSubmission(userId: string, data: {
    signableFormId: string
    templateName: string
    dailyFormId?: string
    fieldValues: object
    signatureText?: string
    signatureFilePath?: string
    geoLat?: number
    geoLng?: number
    geoAddress?: string
    workflowType?: string
    siteSignerIds?: string[]
}) {
    const template = await prisma.signableFormTemplate.findUnique({ where: { id: data.signableFormId } })
    if (!template) throw { status: 404, message: 'Template not found' }
    const siteSignerIds = (data.siteSignerIds || []) as string[]
    const isSiteMeeting = data.workflowType === 'site_meeting' && siteSignerIds.length > 0
    const submission = await prisma.signableFormSubmission.create({
        data: {
            signableFormId: data.signableFormId,
            templateName: data.templateName,
            dailyFormId: data.dailyFormId,
            assignmentId: data.dailyFormId && data.dailyFormId.length > 20 ? data.dailyFormId : null,
            submittedById: userId,
            fieldValues: (data.fieldValues || {}) as any,
            signatureText: data.signatureText ?? null,
            signatureFilePath: data.signatureFilePath,
            geoLat: data.geoLat,
            geoLng: data.geoLng,
            geoAddress: data.geoAddress,
            workflowType: data.workflowType || 'standard',
            siteSignerIds: siteSignerIds as any,
            siteSignatures: [],
        },
    })

    if (data.dailyFormId && data.dailyFormId.length > 20) {
        // Assume it's an assignment ID and mark as completed
        await prisma.formAssignment.update({
            where: { id: data.dailyFormId },
            data: { status: 'completed' },
        }).catch(() => {})
    }

    if (isSiteMeeting) {
        const submitter = await prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true },
        })
        const submitterName = submitter ? `${submitter.firstName} ${submitter.lastName}`.trim() : 'Your supervisor'
        for (const signerId of siteSignerIds) {
            if (signerId !== userId) {
                await notificationService.createNotification({
                    userId: signerId,
                    title: 'Form sent for your signature',
                    body: `${submitterName} sent "${data.templateName}" for you to sign. Sign it in Daily forms → Waiting for your signature.`,
                    type: 'info',
                    linkTo: '/daily-forms/sign/' + submission.id,
                    emailPreferenceKey: 'signature_required',
                }).catch(() => {})
            }
        }
    } else {
        const submitter = await prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true },
        })
        const submitterName = submitter ? `${submitter.firstName} ${submitter.lastName}`.trim() : 'A team member'
        const assigners = await prisma.formAssignment.findMany({
            where: { signableFormTemplateId: data.signableFormId, assignedToUserId: userId },
            select: { assignedById: true },
            distinct: ['assignedById'],
        })
        for (const { assignedById } of assigners) {
            if (assignedById !== userId) {
                await notificationService.createNotification({
                    userId: assignedById,
                    title: 'Form signed',
                    body: `${submitterName} signed "${data.templateName}".`,
                    type: 'info',
                    linkTo: '/daily-forms',
                    emailPreferenceKey: 'forms_pending',
                }).catch(() => {})
            }
        }
    }
    return {
        id: submission.id,
        submittedAt: submission.submittedAt.toISOString(),
    }
}

export async function updateSignableSubmission(id: string, userId: string, userRole: string, data: { siteSignatures?: any[] }) {
    const s = await prisma.signableFormSubmission.findUnique({ where: { id } })
    if (!s) throw { status: 404, message: 'Submission not found' }
    const siteSignerIds = (s.siteSignerIds as string[]) || []
    const isSiteMeeting = s.workflowType === 'site_meeting' && siteSignerIds.length > 0
    if (data.siteSignatures !== undefined) {
        const newSignatures = data.siteSignatures as { userId: string; signedAt?: string; signatureText?: string }[]
        const signerIdSet = new Set(siteSignerIds)
        const seen = new Set<string>()
        for (const sig of newSignatures) {
            if (!sig.userId || !signerIdSet.has(sig.userId)) throw { status: 400, message: 'Invalid signer in siteSignatures' }
            if (seen.has(sig.userId)) throw { status: 400, message: 'Duplicate signer in siteSignatures' }
            seen.add(sig.userId)
        }
        const existingSigned = new Set((s.siteSignatures as { userId: string }[] || []).map((x) => x.userId))
        const added = newSignatures.filter((sig) => !existingSigned.has(sig.userId))
        const isSubmissionOwner = s.submittedById === userId
        if (added.length > 0) {
            const addedUserIds = new Set(added.map((x) => x.userId))
            if (!isSubmissionOwner && (addedUserIds.size > 1 || !addedUserIds.has(userId))) {
                throw { status: 403, message: 'Only the form owner (supervisor) can add signatures for others (in-person signing)' }
            }
        }
        await prisma.signableFormSubmission.update({
            where: { id },
            data: { siteSignatures: newSignatures as any },
        })
        if (isSiteMeeting && newSignatures.length > 0) {
            const lastSignerId = siteSignerIds[siteSignerIds.length - 1]
            const justSignedId = newSignatures[newSignatures.length - 1]?.userId
            if (justSignedId === lastSignerId) {
                await prisma.signableFormSubmission.update({
                    where: { id },
                    data: { submittedToHrAt: new Date() },
                })
                await notificationService.notifyOwnerAndHr({
                    title: 'Form submitted to HR',
                    body: `"${s.templateName}" has been signed by all parties and submitted.`,
                    type: 'info',
                    linkTo: '/daily-forms',
                    emailPreferenceKey: 'forms_pending',
                }).catch(() => {})
            } else {
                const labourerIds = siteSignerIds.slice(0, -1)
                const signedIds = new Set(newSignatures.map((sig) => sig.userId))
                const allLabourersSigned = labourerIds.length > 0 && labourerIds.every((id) => signedIds.has(id))
                if (allLabourersSigned && lastSignerId) {
                    await notificationService.createNotification({
                        userId: lastSignerId,
                        title: 'Form returned for your signature',
                        body: `"${s.templateName}" has been signed by all team members. Add your signature, then it will be sent to HR.`,
                        type: 'info',
                        linkTo: '/daily-forms/sign/' + id,
                        emailPreferenceKey: 'signature_required',
                    }).catch(() => {})
                }
            }
        }
    }
    return await getSignableSubmissionById(id, userId, userRole)
}
