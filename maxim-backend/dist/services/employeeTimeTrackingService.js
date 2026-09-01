"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertEmployeeTimeViewerMayAccessSubject = assertEmployeeTimeViewerMayAccessSubject;
exports.startSession = startSession;
exports.endSession = endSession;
exports.listSessions = listSessions;
exports.getActiveSession = getActiveSession;
exports.getSiteWorkRoster = getSiteWorkRoster;
exports.bulkStartSessionsAtSite = bulkStartSessionsAtSite;
const prisma_1 = require("../lib/prisma");
const jobService_1 = require("./jobService");
const WORK_SESSION_DB_MISSING_MSG = 'Employee Time tracking is not set up on this database. On the backend host run: npm run db:migrate:deploy (in the maxim-backend folder), then restart the API server.';
/** Prisma/Postgres typically mention the model/table when migrations were not applied. */
function isLikelyMissingEmployeeWorkSessionTable(err) {
    const msg = `${err?.message ?? ''}`.toLowerCase();
    const meta = `${err?.meta?.table ?? ''}`.toLowerCase();
    const code = String(err?.meta?.code ?? err?.code ?? '');
    if (code === 'P2021' || /\b42p01\b/.test(msg)) {
        return /employeeworksession|employee.work.session|employee_work_session/i.test(msg + meta);
    }
    const blob = `${msg} ${meta}`;
    if (!/employeeworksession|employee.work.session|employee_work_session/i.test(blob))
        return false;
    return (/\bdoes not exist\b/.test(blob) ||
        /\bundefined table\b/i.test(blob) ||
        /\b42704\b/.test(blob) ||
        /\b42p01\b/.test(blob));
}
async function withEmployeeWorkSessionTable(fn) {
    try {
        return await fn();
    }
    catch (err) {
        if (isLikelyMissingEmployeeWorkSessionTable(err))
            throw { status: 422, message: WORK_SESSION_DB_MISSING_MSG };
        throw err;
    }
}
function isOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
/** Clock-in subcontractor fields and supervisor “HR-style” punching for others — full org for owner/hr, supervised labourers for supervisors. */
function hasEmployeeTimeElevatedPrivileges(actorRole) {
    return isOwnerOrHr(actorRole) || actorRole === 'supervisor';
}
function punchActorDisplay(fkId, u) {
    if (!fkId)
        return null;
    if (u) {
        const n = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
        return n || u.email || null;
    }
    return 'Unknown user';
}
function mapSession(row) {
    const userName = row.user
        ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim() || row.user.email
        : undefined;
    return {
        id: row.id,
        userId: row.userId,
        userName,
        siteId: row.siteId,
        siteName: row.site?.name ?? null,
        jobId: row.jobId,
        jobTitle: row.job?.title ?? null,
        subcontractorId: row.subcontractorId,
        subcontractorCompanyName: row.subcontractor?.companyName ?? null,
        subcontractorPersonnelId: row.subcontractorPersonnelId,
        subcontractorPersonnelName: row.subcontractorPersonnel?.name ?? null,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        startNote: row.startNote,
        endNote: row.endNote,
        startLatitude: row.startLatitude,
        startLongitude: row.startLongitude,
        startAccuracyM: row.startAccuracyM,
        endLatitude: row.endLatitude,
        endLongitude: row.endLongitude,
        endAccuracyM: row.endAccuracyM,
        durationSeconds: row.endedAt != null
            ? Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 1000))
            : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        clockInByUserId: row.clockInByUserId ?? null,
        clockInByDisplayName: punchActorDisplay(row.clockInByUserId ?? null, row.clockInBy),
        clockOutByUserId: row.clockOutByUserId ?? null,
        clockOutByDisplayName: punchActorDisplay(row.clockOutByUserId ?? null, row.clockOutBy),
    };
}
async function hasOpenSession(userId) {
    return withEmployeeWorkSessionTable(async () => {
        const open = await prisma_1.prisma.employeeWorkSession.findFirst({
            where: { userId, endedAt: null },
            select: { id: true },
        });
        return Boolean(open);
    });
}
async function assertNotOnTimeOff(userId, at) {
    const entries = await prisma_1.prisma.timeOffEntry.findMany({
        where: { labourerId: userId },
        select: { id: true, startDate: true, endDate: true, reason: true },
    });
    const t = at.getTime();
    for (const e of entries) {
        const start = e.startDate.getTime();
        const end = e.endDate.getTime();
        if (t >= start && t <= end) {
            throw {
                status: 400,
                message: `Cannot clock in during scheduled time off (${e.reason}). Update time off on the Time off page or contact HR.`,
            };
        }
    }
}
async function assertLabourerMayUseJob(userId, userRole, jobId) {
    if (isOwnerOrHr(userRole))
        return;
    const job = await prisma_1.prisma.job.findUnique({
        where: { id: jobId },
        select: { siteId: true },
    });
    if (!job)
        throw { status: 404, message: 'Job not found' };
    const onJob = await prisma_1.prisma.jobAssignment.findFirst({
        where: { jobId, userId },
        select: { id: true },
    });
    if (onJob)
        return;
    const onSite = await prisma_1.prisma.siteAssignment.findFirst({
        where: { siteId: job.siteId, userId },
        select: { id: true },
    });
    if (onSite)
        return;
    throw {
        status: 403,
        message: 'You are not assigned to this job or its site. Ask a supervisor to add you on Job management.',
    };
}
async function resolveScopeUserIds(viewerId, viewerRole, requestedUserId) {
    const target = (requestedUserId || viewerId).trim();
    if (target !== viewerId) {
        if (isOwnerOrHr(viewerRole))
            return target;
        if (viewerRole === 'supervisor') {
            const team = await (0, jobService_1.getLabourerIdsSupervisedBy)(viewerId);
            if (team.includes(target))
                return target;
            throw { status: 403, message: 'You can only view time for your supervised team members' };
        }
        throw { status: 403, message: 'You can only view your own time entries' };
    }
    return target;
}
/** Allows viewing or starting a session **for** `subjectUserId` when acting as someone other than the subject (Owners/HR:any; Supervisors: supervised labourers only). */
async function assertEmployeeTimeViewerMayAccessSubject(viewerId, viewerRole, subjectUserId) {
    await resolveScopeUserIds(viewerId, viewerRole, subjectUserId);
}
async function assertActorMayManageSession(actorId, actorRole, sessionOwnerUserId) {
    if (sessionOwnerUserId === actorId)
        return;
    if (isOwnerOrHr(actorRole))
        return;
    if (actorRole === 'supervisor') {
        const team = await (0, jobService_1.getLabourerIdsSupervisedBy)(actorId);
        if (team.includes(sessionOwnerUserId))
            return;
        throw { status: 403, message: 'You can only clock out sessions for employees you supervise.' };
    }
    throw { status: 403, message: 'You can only end your own sessions.' };
}
const sessionInclude = {
    site: { select: { id: true, name: true } },
    job: { select: { id: true, title: true, siteId: true } },
    subcontractor: { select: { id: true, companyName: true } },
    subcontractorPersonnel: { select: { id: true, name: true } },
    user: { select: { id: true, firstName: true, lastName: true, email: true } },
    clockInBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    clockOutBy: { select: { id: true, firstName: true, lastName: true, email: true } },
};
async function startSession(labourerUserId, actorUserId, actorRole, body) {
    const targetUser = await prisma_1.prisma.user.findUnique({
        where: { id: labourerUserId },
        select: { role: true, isActive: true, employmentStatus: true },
    });
    if (!targetUser?.isActive)
        throw { status: 400, message: 'Employee account is not active.' };
    if (targetUser.employmentStatus === 'terminated') {
        throw { status: 400, message: 'Cannot clock in a terminated employee.' };
    }
    if (((body.subcontractorId ?? '').trim() || (body.subcontractorPersonnelId ?? '').trim()) &&
        !hasEmployeeTimeElevatedPrivileges(actorRole)) {
        throw { status: 403, message: 'Only Owner, HR, or Supervisors can attach subcontractor context when clocking in.' };
    }
    if (await hasOpenSession(labourerUserId)) {
        throw { status: 400, message: 'You already have an open session. Clock out first.' };
    }
    const now = new Date();
    await assertNotOnTimeOff(labourerUserId, now);
    let siteId = body.siteId?.trim() || null;
    const jobId = body.jobId?.trim() || null;
    let subcontractorId = body.subcontractorId?.trim() || null;
    const subcontractorPersonnelId = body.subcontractorPersonnelId?.trim() || null;
    if (jobId) {
        await assertLabourerMayUseJob(labourerUserId, targetUser.role, jobId);
        const job = await prisma_1.prisma.job.findUnique({
            where: { id: jobId },
            select: { siteId: true },
        });
        if (!job)
            throw { status: 404, message: 'Job not found' };
        if (!siteId)
            siteId = job.siteId;
        else if (siteId !== job.siteId) {
            throw { status: 400, message: 'Selected site does not match this job’s site' };
        }
    }
    if (siteId) {
        const site = await prisma_1.prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
        if (!site)
            throw { status: 404, message: 'Site not found' };
    }
    if (subcontractorPersonnelId) {
        const p = await prisma_1.prisma.subcontractorPersonnel.findUnique({
            where: { id: subcontractorPersonnelId },
            select: { id: true, subcontractorId: true },
        });
        if (!p)
            throw { status: 404, message: 'Subcontractor personnel not found' };
        if (subcontractorId && subcontractorId !== p.subcontractorId) {
            throw { status: 400, message: 'Subcontractor personnel does not belong to the selected company' };
        }
        if (!subcontractorId)
            subcontractorId = p.subcontractorId;
    }
    if (subcontractorId) {
        const sub = await prisma_1.prisma.subcontractor.findUnique({ where: { id: subcontractorId }, select: { id: true } });
        if (!sub)
            throw { status: 404, message: 'Subcontractor not found' };
    }
    const row = await withEmployeeWorkSessionTable(() => prisma_1.prisma.employeeWorkSession.create({
        data: {
            userId: labourerUserId,
            clockInByUserId: actorUserId,
            siteId,
            jobId,
            subcontractorId,
            subcontractorPersonnelId,
            startedAt: now,
            startNote: body.startNote?.trim() || null,
            startLatitude: body.startLatitude ?? null,
            startLongitude: body.startLongitude ?? null,
            startAccuracyM: body.startAccuracyM ?? null,
        },
        include: sessionInclude,
    }));
    return mapSession(row);
}
async function endSession(actorId, actorRole, sessionId, body) {
    return withEmployeeWorkSessionTable(async () => {
        const row = await prisma_1.prisma.employeeWorkSession.findFirst({
            where: { id: sessionId },
        });
        if (!row)
            throw { status: 404, message: 'Session not found' };
        await assertActorMayManageSession(actorId, actorRole, row.userId);
        if (row.endedAt)
            throw { status: 400, message: 'This session is already closed' };
        const updated = await prisma_1.prisma.employeeWorkSession.update({
            where: { id: sessionId },
            data: {
                endedAt: new Date(),
                endNote: body.endNote?.trim() || null,
                endLatitude: body.endLatitude ?? null,
                endLongitude: body.endLongitude ?? null,
                endAccuracyM: body.endAccuracyM ?? null,
                clockOutByUserId: actorId,
            },
            include: sessionInclude,
        });
        return mapSession(updated);
    });
}
async function listSessions(viewerId, viewerRole, query) {
    const targetUserId = await resolveScopeUserIds(viewerId, viewerRole, query.userId);
    const where = { userId: targetUserId };
    if (query.from || query.to) {
        where.startedAt = {};
        if (query.from) {
            const d = new Date(`${query.from}T00:00:00.000Z`);
            if (!Number.isNaN(d.getTime()))
                where.startedAt.gte = d;
        }
        if (query.to) {
            const d = new Date(`${query.to}T23:59:59.999Z`);
            if (!Number.isNaN(d.getTime()))
                where.startedAt.lte = d;
        }
    }
    return withEmployeeWorkSessionTable(async () => {
        const rows = await prisma_1.prisma.employeeWorkSession.findMany({
            where,
            orderBy: { startedAt: 'desc' },
            take: 500,
            include: sessionInclude,
        });
        return rows.map(mapSession);
    });
}
async function getActiveSession(userId) {
    return withEmployeeWorkSessionTable(async () => {
        const row = await prisma_1.prisma.employeeWorkSession.findFirst({
            where: { userId, endedAt: null },
            orderBy: { startedAt: 'desc' },
            include: sessionInclude,
        });
        return row ? mapSession(row) : null;
    });
}
const BULK_SITE_ROLES = new Set(['owner', 'hr', 'supervisor']);
async function idsAssignedToSite(siteId) {
    const [siteRows, jobRows] = await Promise.all([
        prisma_1.prisma.siteAssignment.findMany({ where: { siteId }, select: { userId: true } }),
        prisma_1.prisma.jobAssignment.findMany({
            where: { job: { siteId } },
            select: { userId: true },
        }),
    ]);
    return [...new Set([...siteRows.map((r) => r.userId), ...jobRows.map((r) => r.userId)])];
}
/** Active labourers/supervisors on the site roster the viewer may see / bulk-clock. */
async function scopedSiteWorkforceIds(viewerRole, viewerId, siteId) {
    const pool = await idsAssignedToSite(siteId);
    if (pool.length === 0)
        return [];
    if (viewerRole === 'supervisor') {
        const supervised = new Set(await (0, jobService_1.getLabourerIdsSupervisedBy)(viewerId));
        return pool.filter((id) => supervised.has(id));
    }
    return pool;
}
async function getSiteWorkRoster(viewerId, viewerRole, siteId) {
    if (!BULK_SITE_ROLES.has(viewerRole))
        throw { status: 403, message: 'Insufficient permissions.' };
    const site = await prisma_1.prisma.site.findUnique({ where: { id: siteId }, select: { id: true, name: true } });
    if (!site)
        throw { status: 404, message: 'Site not found' };
    const scoped = await scopedSiteWorkforceIds(viewerRole, viewerId, siteId);
    if (scoped.length === 0)
        return { site, people: [] };
    const users = await prisma_1.prisma.user.findMany({
        where: {
            id: { in: scoped },
            isActive: true,
            role: { in: ['labourer', 'supervisor'] },
            NOT: { employmentStatus: 'terminated' },
        },
        select: { id: true, firstName: true, lastName: true, role: true, email: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const open = await withEmployeeWorkSessionTable(() => prisma_1.prisma.employeeWorkSession.findMany({
        where: { userId: { in: users.map((u) => u.id) }, endedAt: null },
        select: {
            id: true,
            userId: true,
            startedAt: true,
            job: { select: { title: true } },
        },
    }));
    const activeByUser = new Map(open.map((r) => [r.userId, r]));
    const people = users.map((u) => {
        const sess = activeByUser.get(u.id);
        return {
            userId: u.id,
            name: `${u.firstName} ${u.lastName}`.trim() || u.email,
            role: u.role,
            email: u.email,
            activeSession: sess
                ? {
                    id: sess.id,
                    startedAt: sess.startedAt.toISOString(),
                    jobTitle: sess.job?.title ?? null,
                }
                : null,
        };
    });
    return { site, people };
}
async function bulkStartSessionsAtSite(viewerId, viewerRole, body) {
    if (!BULK_SITE_ROLES.has(viewerRole))
        throw { status: 403, message: 'Insufficient permissions.' };
    const siteId = body.siteId.trim();
    if (!siteId)
        throw { status: 400, message: 'siteId is required' };
    const site = await prisma_1.prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!site)
        throw { status: 404, message: 'Site not found' };
    const eligible = new Set(await scopedSiteWorkforceIds(viewerRole, viewerId, siteId));
    const uniqueIds = [...new Set((body.userIds || []).map((id) => id.trim()).filter(Boolean))];
    const commonBody = {
        siteId,
        jobId: body.jobId?.trim() || null,
        subcontractorId: null,
        subcontractorPersonnelId: null,
        startNote: body.startNote?.trim() || null,
        startLatitude: body.startLatitude ?? null,
        startLongitude: body.startLongitude ?? null,
        startAccuracyM: body.startAccuracyM ?? null,
    };
    const results = [];
    for (const uid of uniqueIds) {
        if (!eligible.has(uid)) {
            results.push({
                userId: uid,
                ok: false,
                error: "Not on this site's roster or not in your supervisory scope.",
            });
            continue;
        }
        try {
            const session = await startSession(uid, viewerId, viewerRole, commonBody);
            results.push({ userId: uid, ok: true, session });
        }
        catch (e) {
            const msg = typeof e?.message === 'string'
                ? e.message
                : typeof e?.status === 'number'
                    ? `Request failed (${e.status})`
                    : 'Clock-in failed.';
            results.push({ userId: uid, ok: false, error: msg });
        }
    }
    return { siteId, results };
}
