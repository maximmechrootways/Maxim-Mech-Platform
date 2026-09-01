"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = writeAuditLog;
exports.listAuditLogs = listAuditLogs;
const prisma_1 = require("../lib/prisma");
/** Write-only: append an audit log entry (immutable, no update/delete). */
async function writeAuditLog(data) {
    return prisma_1.prisma.auditLog.create({
        data: {
            userId: data.userId,
            userName: data.userName,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId,
            entityLabel: data.entityLabel ?? undefined,
            linkTo: data.linkTo ?? undefined,
        },
    });
}
async function listAuditLogs(query) {
    const where = {};
    if (query.entityType)
        where.entityType = query.entityType;
    if (query.entityId)
        where.entityId = query.entityId;
    if (query.userId)
        where.userId = query.userId;
    if (query.from || query.to) {
        where.createdAt = {};
        if (query.from)
            where.createdAt.gte = new Date(query.from);
        if (query.to)
            where.createdAt.lte = new Date(query.to + 'T23:59:59.999Z');
    }
    const order = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const [items, total] = await Promise.all([
        prisma_1.prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: order },
            take: Math.min(query.limit ?? 100, 500),
            skip: query.offset ?? 0,
        }),
        prisma_1.prisma.auditLog.count({ where }),
    ]);
    return {
        items: items.map((r) => ({
            id: r.id,
            at: r.createdAt.toISOString(),
            by: r.userName,
            userId: r.userId,
            action: r.action,
            entityType: r.entityType,
            entityId: r.entityId,
            entityLabel: r.entityLabel ?? undefined,
            linkTo: r.linkTo ?? undefined,
        })),
        total,
    };
}
