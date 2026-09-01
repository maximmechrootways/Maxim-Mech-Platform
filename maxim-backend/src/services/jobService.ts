import { prisma } from '../lib/prisma'

const ROLES_OWNER_HR = ['owner', 'hr']
const ROLES_SUPERVISOR = ['supervisor']

function isOwnerOrHr(role: string) {
    return ROLES_OWNER_HR.includes(role)
}

function isSupervisor(role: string) {
    return ROLES_SUPERVISOR.includes(role)
}

export async function listJobs(userId: string, userRole: string, query: { status?: string; siteId?: string }) {
    const where: any = {}
    if (query.status) where.status = query.status
    if (query.siteId) where.siteId = query.siteId

    // Labourers see jobs they're assigned to (job-level or site-level); supervisors see jobs they supervise; owner/hr see all
    if (userRole === 'labourer') {
        where.OR = [
            { labourers: { some: { userId } } },
            { site: { siteLabourers: { some: { userId } } } },
        ]
    } else if (userRole === 'supervisor') {
        where.OR = [
            { supervisors: { some: { userId } } },
            { site: { siteSupervisors: { some: { userId } } } },
        ]
    }

    const jobs = await prisma.job.findMany({
        where,
        include: {
            site: {
                select: {
                    id: true,
                    name: true,
                    _count: { select: { siteLabourers: true } },
                },
            },
            supervisors: { select: { userId: true } },
            labourers: { select: { id: true, userId: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
            _count: { select: { subcontractors: true, subcontractorPersonnel: true } },
        },
        orderBy: { createdAt: 'desc' },
    })

    return jobs.map((j) => ({
        id: j.id,
        title: j.title,
        siteId: j.site.id,
        siteName: j.site.name,
        status: j.status,
        createdBy: j.createdBy ? `${j.createdBy.firstName} ${j.createdBy.lastName}` : '',
        createdAt: j.createdAt.toISOString(),
        assignedSupervisorIds: j.supervisors.map((s) => s.userId),
        labourerCount: Math.max(j.labourers.length, j.site?._count?.siteLabourers ?? 0),
        subcontractorCount: j._count.subcontractors,
        subcontractorPersonnelCount: j._count.subcontractorPersonnel,
    }))
}

export async function getMyJobs(userId: string) {
    const jobs = await prisma.job.findMany({
        where: {
            OR: [
                { supervisors: { some: { userId } } },
                { site: { siteSupervisors: { some: { userId } } } },
            ],
        },
        include: {
            site: {
                select: {
                    id: true,
                    name: true,
                    _count: { select: { siteLabourers: true } },
                },
            },
            labourers: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
    })
    return jobs.map((j) => ({
        id: j.id,
        title: j.title,
        siteName: j.site.name,
        status: j.status,
        labourerCount: Math.max(j.labourers.length, j.site?._count?.siteLabourers ?? 0),
    }))
}

/** Returns user IDs of labourers assigned to any job this supervisor is supervising. Used to scope submission visibility. */
export async function getLabourerIdsSupervisedBy(supervisorUserId: string): Promise<string[]> {
    const assignments = await prisma.jobAssignment.findMany({
        where: {
            OR: [
                { job: { supervisors: { some: { userId: supervisorUserId } } } },
                { job: { site: { siteSupervisors: { some: { userId: supervisorUserId } } } } },
            ],
        },
        select: { userId: true },
    })
    const siteAssignments = await prisma.siteAssignment.findMany({
        where: { site: { siteSupervisors: { some: { userId: supervisorUserId } } } },
        select: { userId: true },
    })
    return [...new Set([...assignments.map((a) => a.userId), ...siteAssignments.map((a) => a.userId)])]
}

/** Returns team members (id, name) for form assignment. Supervisor = labourers on their jobs; Owner/HR = all active users. */
export async function getMyTeamMembers(userId: string, userRole: string) {
    if (userRole === 'supervisor') {
        const ids = await getLabourerIdsSupervisedBy(userId)
        if (ids.length === 0) return []
        const users = await prisma.user.findMany({
            where: { id: { in: ids }, isActive: true },
            select: { id: true, firstName: true, lastName: true },
        })
        return users.map((u) => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName}`.trim() || u.id,
        }))
    }
    if (userRole === 'owner' || userRole === 'hr') {
        const users = await prisma.user.findMany({
            where: { isActive: true },
            select: { id: true, firstName: true, lastName: true },
        })
        return users.map((u) => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName}`.trim() || u.id,
        }))
    }
    return []
}

export async function createJob(userId: string, userRole: string, data: { title: string; siteId: string }) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can create jobs' }

    const site = await prisma.site.findUnique({ where: { id: data.siteId } })
    if (!site) throw { status: 404, message: 'Site not found' }

    const job = await prisma.job.create({
        data: {
            title: data.title.trim(),
            siteId: data.siteId,
            createdById: userId,
        },
        include: {
            site: { select: { id: true, name: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
    })
    return {
        id: job.id,
        title: job.title,
        siteId: job.site.id,
        siteName: job.site.name,
        status: job.status,
        createdBy: `${job.createdBy.firstName} ${job.createdBy.lastName}`,
        createdAt: job.createdAt.toISOString(),
        assignedSupervisorIds: [],
    }
}

export async function getJobById(id: string, userId: string, userRole: string) {
    const job = await prisma.job.findUnique({
        where: { id },
        include: {
            site: { include: { siteSupervisors: { select: { userId: true } } } },
            supervisors: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
            labourers: { include: { user: { select: { id: true, firstName: true, lastName: true } }, assignedBy: { select: { firstName: true, lastName: true } } } },
            checkIns: true,
            subcontractors: { include: { subcontractor: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
    })
    if (!job) throw { status: 404, message: 'Job not found' }

    // Access: owner/hr see all; supervisor sees if assigned to job or site; labourer sees if assigned
    if (userRole === 'supervisor') {
        const onJob = job.supervisors.some((s) => s.userId === userId)
        const onSite = job.site.siteSupervisors.some((s) => s.userId === userId)
        if (!onJob && !onSite) throw { status: 403, message: 'Forbidden' }
    }
    if (userRole === 'labourer' && !job.labourers.some((l) => l.userId === userId)) {
        throw { status: 403, message: 'Forbidden' }
    }

    const today = new Date().toISOString().slice(0, 10)
    const checkInsToday = job.checkIns.filter((c) => c.date === today)

    return {
        id: job.id,
        title: job.title,
        siteId: job.site.id,
        siteName: job.site.name,
        status: job.status,
        gate: (job as any).gate ?? null,
        createdBy: `${job.createdBy.firstName} ${job.createdBy.lastName}`,
        createdAt: job.createdAt.toISOString(),
        assignedSupervisorIds: job.supervisors.map((s) => s.userId),
        labourers: job.labourers.map((l) => ({
            id: l.id,
            userId: l.userId,
            userName: `${l.user.firstName} ${l.user.lastName}`,
            assignedBy: l.assignedBy ? `${l.assignedBy.firstName} ${l.assignedBy.lastName}` : '',
            assignedAt: l.assignedAt.toISOString(),
        })),
        checkInsToday: checkInsToday.map((c) => ({
            id: c.id,
            userId: c.userId,
            date: c.date,
            checkedInAt: c.checkedInAt?.toISOString() ?? null,
            checkedOutAt: c.checkedOutAt?.toISOString() ?? null,
        })),
        subcontractors: job.subcontractors.map((s) => ({
            id: s.subcontractor.id,
            companyName: s.subcontractor.companyName,
        })),
    }
}

export async function updateJob(
    id: string,
    userId: string,
    userRole: string,
    data: { title?: string; status?: string; siteId?: string; gate?: string }
) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can update jobs' }

    const job = await prisma.job.findUnique({ where: { id } })
    if (!job) throw { status: 404, message: 'Job not found' }

    const updateData: any = {}
    if (data.title !== undefined) updateData.title = data.title.trim()
    if (data.status !== undefined) updateData.status = data.status
    if (data.gate !== undefined) updateData.gate = data.gate.trim() || null
    if (data.siteId !== undefined) {
        const site = await prisma.site.findUnique({ where: { id: data.siteId } })
        if (!site) throw { status: 404, message: 'Site not found' }
        updateData.siteId = data.siteId
    }

    const updated = await prisma.job.update({
        where: { id },
        data: updateData,
        include: { site: { select: { id: true, name: true } } },
    })
    return {
        id: updated.id,
        title: updated.title,
        siteId: updated.site.id,
        siteName: updated.site.name,
        status: updated.status,
        gate: (updated as any).gate ?? null,
    }
}

export async function deleteJob(id: string, userId: string, userRole: string) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can delete jobs' }
    const job = await prisma.job.findUnique({ where: { id } })
    if (!job) throw { status: 404, message: 'Job not found' }
    await prisma.job.delete({ where: { id } })
    return { message: 'Job deleted' }
}

export async function addSupervisor(jobId: string, userId: string, userRole: string, body: { userId: string }) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can assign supervisors' }
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, siteId: true } })
    if (!job) throw { status: 404, message: 'Job not found' }
    await prisma.jobSupervisor.upsert({
        where: { jobId_userId: { jobId, userId: body.userId } },
        create: { jobId, userId: body.userId },
        update: {},
    })
    await prisma.siteSupervisor.upsert({
        where: { siteId_userId: { siteId: job.siteId, userId: body.userId } },
        create: { siteId: job.siteId, userId: body.userId },
        update: {},
    })
    return { message: 'Supervisor assigned' }
}

export async function removeSupervisor(jobId: string, targetUserId: string, userId: string, userRole: string) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can remove supervisors' }
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { siteId: true } })
    if (!job) throw { status: 404, message: 'Job not found' }
    await prisma.jobSupervisor.deleteMany({ where: { jobId, userId: targetUserId } })
    await prisma.siteSupervisor.deleteMany({ where: { siteId: job.siteId, userId: targetUserId } })
    return { message: 'Supervisor removed' }
}

export async function addLabourer(jobId: string, userId: string, userRole: string, body: { userId: string }) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, include: { supervisors: true } })
    if (!job) throw { status: 404, message: 'Job not found' }
    const isSupervisorOnJob = job.supervisors.some((s) => s.userId === userId)
    if (!isOwnerOrHr(userRole) && !isSupervisorOnJob) throw { status: 403, message: 'Only Owner, HR, or assigned Supervisor can assign labourers' }
    await prisma.jobAssignment.upsert({
        where: { jobId_userId: { jobId, userId: body.userId } },
        create: { jobId, userId: body.userId, assignedById: userId },
        update: {},
    })
    return { message: 'Labourer assigned' }
}

export async function removeLabourer(jobId: string, targetUserId: string, userId: string, userRole: string) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, include: { supervisors: true } })
    if (!job) throw { status: 404, message: 'Job not found' }
    const isSupervisorOnJob = job.supervisors.some((s) => s.userId === userId)
    if (!isOwnerOrHr(userRole) && !isSupervisorOnJob) throw { status: 403, message: 'Forbidden' }
    await prisma.jobAssignment.deleteMany({ where: { jobId, userId: targetUserId } })
    return { message: 'Labourer removed' }
}

export async function addSubcontractor(jobId: string, userId: string, userRole: string, body: { subcontractorId: string }) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can assign subcontractors' }
    const job = await prisma.job.findUnique({ where: { id: jobId } })
    if (!job) throw { status: 404, message: 'Job not found' }
    const sub = await prisma.subcontractor.findUnique({ where: { id: body.subcontractorId } })
    if (!sub) throw { status: 404, message: 'Subcontractor not found' }
    await prisma.subcontractorJobAssignment.upsert({
        where: { jobId_subcontractorId: { jobId, subcontractorId: body.subcontractorId } },
        create: { jobId, subcontractorId: body.subcontractorId, assignedById: userId },
        update: {},
    })
    return { message: 'Subcontractor assigned' }
}

export async function removeSubcontractor(jobId: string, subcontractorId: string, userId: string, userRole: string) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can remove subcontractors' }
    await prisma.subcontractorJobAssignment.deleteMany({ where: { jobId, subcontractorId } })
    return { message: 'Subcontractor removed' }
}

export async function checkIn(jobId: string, userId: string, userRole: string, body: { targetUserId: string; date?: string }) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, include: { supervisors: true, labourers: true } })
    if (!job) throw { status: 404, message: 'Job not found' }
    const isSupervisorOnJob = job.supervisors.some((s) => s.userId === userId)
    const isLabourerOnJob = job.labourers.some((l) => l.userId === body.targetUserId)
    if (!isLabourerOnJob) throw { status: 400, message: 'User is not assigned to this job' }
    if (!isOwnerOrHr(userRole) && !isSupervisorOnJob) throw { status: 403, message: 'Only Supervisor or HR can record check-in' }

    const date = body.date || new Date().toISOString().slice(0, 10)
    let record = await prisma.jobCheckIn.findUnique({
        where: { jobId_userId_date: { jobId, userId: body.targetUserId, date } },
    })
    if (!record) {
        record = await prisma.jobCheckIn.create({
            data: { jobId, userId: body.targetUserId, date, checkedInAt: new Date() },
        })
        return { message: 'Checked in', checkedInAt: record.checkedInAt?.toISOString(), checkedOutAt: null }
    }
    if (!record.checkedInAt) {
        await prisma.jobCheckIn.update({
            where: { id: record.id },
            data: { checkedInAt: new Date() },
        })
        return { message: 'Checked in', checkedInAt: new Date().toISOString(), checkedOutAt: record.checkedOutAt?.toISOString() ?? null }
    }
    if (!record.checkedOutAt) {
        await prisma.jobCheckIn.update({
            where: { id: record.id },
            data: { checkedOutAt: new Date() },
        })
        return { message: 'Checked out', checkedInAt: record.checkedInAt.toISOString(), checkedOutAt: new Date().toISOString() }
    }
    return { message: 'Already checked out', checkedInAt: record.checkedInAt.toISOString(), checkedOutAt: record.checkedOutAt?.toISOString() ?? null }
}

export async function resetCheckIn(jobId: string, userId: string, userRole: string, body: { targetUserId: string; date?: string }) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, include: { supervisors: true } })
    if (!job) throw { status: 404, message: 'Job not found' }
    const isSupervisorOnJob = job.supervisors.some((s) => s.userId === userId)
    if (!isOwnerOrHr(userRole) && !isSupervisorOnJob) throw { status: 403, message: 'Only Supervisor or HR can reset check-in' }
    const date = body.date || new Date().toISOString().slice(0, 10)
    await prisma.jobCheckIn.deleteMany({ where: { jobId, userId: body.targetUserId, date } })
    return { message: 'Check-in reset' }
}
