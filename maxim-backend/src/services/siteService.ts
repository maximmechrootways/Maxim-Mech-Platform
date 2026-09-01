import { prisma } from '../lib/prisma'

export async function listSites(activeOnly: boolean = true) {
    const sites = await prisma.site.findMany({
        where: activeOnly ? { active: true } : undefined,
        include: {
            siteSupervisors: { include: { user: { select: { firstName: true, lastName: true } } } },
            jobs: {
                where: { status: 'active' },
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    title: true,
                    supervisors: { include: { user: { select: { firstName: true, lastName: true } } } },
                },
            },
        },
        orderBy: { name: 'asc' },
    })
    return sites.map((s) => {
        const activeJob = s.jobs[0]
        const supervisorNames = new Set<string>()
        for (const sup of s.siteSupervisors) {
            const name = `${sup.user.firstName} ${sup.user.lastName}`.trim()
            if (name) supervisorNames.add(name)
        }
        for (const sup of activeJob?.supervisors ?? []) {
            const name = `${sup.user.firstName} ${sup.user.lastName}`.trim()
            if (name) supervisorNames.add(name)
        }
        const managerName = supervisorNames.size > 0 ? [...supervisorNames].join(', ') : 'Unassigned'

        return {
            id: s.id,
            name: s.name,
            jobId: activeJob?.id ?? null,
            activeJobTitle: activeJob?.title ?? null,
            managerName,
        }
    })
}

export async function getSiteById(id: string) {
    const today = new Date().toISOString().slice(0, 10)
    const site = await prisma.site.findUnique({
        where: { id },
        include: {
            jobs: {
                where: { status: 'active' },
                take: 1,
                orderBy: { createdAt: 'desc' },
                include: {
                    checkIns: {
                        where: { date: today },
                        include: { user: { select: { id: true, firstName: true, lastName: true } } },
                    },
                },
            },
            siteSupervisors: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
            siteLabourers: { include: { user: { select: { id: true, firstName: true, lastName: true } }, assignedBy: { select: { firstName: true, lastName: true } } } },
        },
    })
    if (!site) throw { status: 404, message: 'Site not found' }

    const activeJob = site.jobs[0]
    const checkInsToday = activeJob?.checkIns ?? []

    return {
        id: site.id,
        name: site.name,
        address: site.address ?? undefined,
        meetingPoint: site.meetingPoint ?? undefined,
        nearestHospital: site.nearestHospital ?? undefined,
        firstAiderName: site.firstAiderName ?? undefined,
        firstAiderPhone: site.firstAiderPhone ?? undefined,
        emergencyContact: site.emergencyContact ?? undefined,
        jobId: activeJob?.id ?? null,
        activeJobTitle: activeJob?.title ?? null,
        activeJob: activeJob
            ? {
                id: activeJob.id,
                title: activeJob.title,
                status: activeJob.status,
            }
            : null,
        checkedInToday: checkInsToday
            .filter((c) => c.checkedInAt)
            .map((c) => ({
                userId: c.userId,
                userName: `${c.user.firstName} ${c.user.lastName}`,
                checkedInAt: c.checkedInAt?.toISOString(),
            })),
        siteSupervisors: site.siteSupervisors.map((s) => ({
            id: s.id,
            userId: s.userId,
            userName: `${s.user.firstName} ${s.user.lastName}`,
        })),
        siteLabourers: site.siteLabourers.map((l) => ({
            id: l.id,
            userId: l.userId,
            userName: `${l.user.firstName} ${l.user.lastName}`,
            assignedAt: l.assignedAt.toISOString(),
        })),
        openHazardsCount: 0,
        recentIncidents: [],
        injuryReports: [],
    }
}

export async function createSite(userRole: string, data: { name: string; address?: string }) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can create sites' }
    const site = await prisma.site.create({
        data: {
            name: data.name.trim(),
            ...(data.address !== undefined && data.address !== '' ? { address: data.address.trim() } : {}),
        },
    })
    return { id: site.id, name: site.name, address: site.address ?? undefined }
}

const SITE_UPDATE_KEYS = ['name', 'address', 'meetingPoint', 'nearestHospital', 'firstAiderName', 'firstAiderPhone', 'emergencyContact'] as const

export async function updateSite(
  id: string,
  userRole: string,
  data: {
    name?: string
    address?: string
    meetingPoint?: string
    nearestHospital?: string
    firstAiderName?: string
    firstAiderPhone?: string
    emergencyContact?: string
    active?: boolean
  }
) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can update sites' }
    const site = await prisma.site.findUnique({ where: { id } })
    if (!site) throw { status: 404, message: 'Site not found' }
    const updateData: Record<string, any> = {}
    for (const key of SITE_UPDATE_KEYS) {
        if (data[key] !== undefined) updateData[key] = typeof data[key] === 'string' ? data[key].trim() : (data[key] ?? '')
    }
    if (data.active !== undefined) updateData.active = Boolean(data.active)
    const updated = await prisma.site.update({
        where: { id },
        data: updateData,
    })
    return {
        id: updated.id,
        name: updated.name,
        address: updated.address ?? undefined,
        meetingPoint: updated.meetingPoint ?? undefined,
        nearestHospital: updated.nearestHospital ?? undefined,
        firstAiderName: updated.firstAiderName ?? undefined,
        firstAiderPhone: updated.firstAiderPhone ?? undefined,
        emergencyContact: updated.emergencyContact ?? undefined,
    }
}

export async function deleteSite(id: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can delete sites' }
    const site = await prisma.site.findUnique({ where: { id } })
    if (!site) throw { status: 404, message: 'Site not found' }
    await prisma.site.update({ where: { id }, data: { active: false } })
    return { id, inactive: true }
}

export async function addSiteSupervisor(siteId: string, userId: string, assignedByRole: string) {
    if (assignedByRole !== 'owner' && assignedByRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can assign site personnel' }
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw { status: 404, message: 'Site not found' }
    const created = await prisma.siteSupervisor.upsert({
        where: { siteId_userId: { siteId, userId } },
        create: { siteId, userId },
        update: {},
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
    })

    const activeJob = await prisma.job.findFirst({
        where: { siteId, status: 'active' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    })
    if (activeJob) {
        await prisma.jobSupervisor.upsert({
            where: { jobId_userId: { jobId: activeJob.id, userId } },
            create: { jobId: activeJob.id, userId },
            update: {},
        })
    }

    return { id: created.id, userId: created.userId, userName: `${created.user.firstName} ${created.user.lastName}` }
}

export async function removeSiteSupervisor(siteId: string, userId: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can remove site personnel' }
    await prisma.siteSupervisor.deleteMany({ where: { siteId, userId } })
    const jobs = await prisma.job.findMany({ where: { siteId }, select: { id: true } })
    if (jobs.length > 0) {
        await prisma.jobSupervisor.deleteMany({
            where: { userId, jobId: { in: jobs.map((j) => j.id) } },
        })
    }
    return { ok: true }
}

export async function addSiteLabourer(siteId: string, userId: string, assignedById: string, assignedByRole: string) {
    if (assignedByRole !== 'owner' && assignedByRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can assign site personnel' }
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw { status: 404, message: 'Site not found' }
    const created = await prisma.siteAssignment.create({
        data: { siteId, userId, assignedById },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
    })
    return { id: created.id, userId: created.userId, userName: `${created.user.firstName} ${created.user.lastName}`, assignedAt: created.assignedAt.toISOString() }
}

export async function removeSiteLabourer(siteId: string, userId: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can remove site personnel' }
    await prisma.siteAssignment.deleteMany({ where: { siteId, userId } })
    return { ok: true }
}
