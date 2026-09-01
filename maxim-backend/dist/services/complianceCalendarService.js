"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEvents = listEvents;
exports.listDue = listDue;
const prisma_1 = require("../lib/prisma");
const ROLES = ['owner', 'hr', 'supervisor'];
function canAccess(role) {
    if (!ROLES.includes(role))
        throw { status: 403, message: 'Insufficient role for compliance calendar' };
}
async function listEvents(role, query) {
    canAccess(role);
    const where = {};
    if (query.type)
        where.type = query.type;
    if (query.from || query.to) {
        where.dueDate = {};
        if (query.from)
            where.dueDate.gte = query.from;
        if (query.to)
            where.dueDate.lte = query.to;
    }
    const list = await prisma_1.prisma.complianceCalendarEvent.findMany({
        where,
        orderBy: { dueDate: 'asc' },
    });
    return list.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        dueDate: r.dueDate,
        siteName: r.siteName ?? undefined,
        recordId: r.recordId ?? undefined,
        metadata: r.metadata ?? {},
    }));
}
async function listDue(role, asOf) {
    canAccess(role);
    const date = asOf || new Date().toISOString().slice(0, 10);
    const list = await prisma_1.prisma.complianceCalendarEvent.findMany({
        where: { dueDate: { gte: date } },
        orderBy: { dueDate: 'asc' },
        take: 50,
    });
    return list.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        dueDate: r.dueDate,
        siteName: r.siteName ?? undefined,
        recordId: r.recordId ?? undefined,
        metadata: r.metadata ?? {},
    }));
}
