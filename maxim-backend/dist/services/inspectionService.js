"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSchedules = listSchedules;
exports.listDue = listDue;
exports.listResults = listResults;
const prisma_1 = require("../lib/prisma");
const ROLES = ['owner', 'hr', 'supervisor'];
function canAccess(role) {
    if (!ROLES.includes(role))
        throw { status: 403, message: 'Insufficient role for inspections' };
}
async function listSchedules(role) {
    canAccess(role);
    const list = await prisma_1.prisma.inspectionSchedule.findMany({ orderBy: { nextDue: 'asc' } });
    return list.map((r) => ({
        id: r.id,
        title: r.title,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName ?? undefined,
        checklistId: r.checklistId,
        frequency: r.frequency,
        nextDue: r.nextDue,
        assignedToRole: r.assignedToRole ?? undefined,
    }));
}
async function listDue(role, asOf) {
    canAccess(role);
    const date = asOf ?? new Date().toISOString().slice(0, 10);
    const list = await prisma_1.prisma.inspectionSchedule.findMany({
        where: { nextDue: { lte: date } },
        orderBy: { nextDue: 'asc' },
    });
    return list.map((r) => ({
        id: r.id,
        title: r.title,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName ?? undefined,
        checklistId: r.checklistId,
        frequency: r.frequency,
        nextDue: r.nextDue,
        assignedToRole: r.assignedToRole ?? undefined,
    }));
}
async function listResults(role, query) {
    canAccess(role);
    const where = {};
    if (query.scheduleId)
        where.scheduleId = query.scheduleId;
    const list = await prisma_1.prisma.inspectionResult.findMany({
        where,
        orderBy: { completedAt: 'desc' },
    });
    return list.map((r) => ({
        id: r.id,
        scheduleId: r.scheduleId,
        title: r.title,
        siteName: r.siteName ?? undefined,
        completedAt: r.completedAt?.toISOString?.() ?? undefined,
        completedBy: r.completedBy ?? undefined,
        items: r.items ?? [],
    }));
}
