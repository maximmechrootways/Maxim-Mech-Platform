"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCAPA = listCAPA;
exports.getCAPAById = getCAPAById;
exports.createCAPA = createCAPA;
exports.updateCAPA = updateCAPA;
exports.deleteCAPA = deleteCAPA;
const prisma_1 = require("../lib/prisma");
const ROLES = ['owner', 'hr', 'supervisor'];
function canAccess(role) {
    if (!ROLES.includes(role))
        throw { status: 403, message: 'Insufficient role for CAPA' };
}
function map(r) {
    return {
        id: r.id,
        actionType: r.actionType,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        title: r.title,
        description: r.description,
        assignedTo: r.assignedTo,
        dueDate: r.dueDate,
        status: r.status,
        completedAt: r.completedAt?.toISOString?.() ?? undefined,
        createdAt: r.createdAt?.toISOString?.() ?? undefined,
    };
}
async function listCAPA(role, query) {
    canAccess(role);
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.sourceType)
        where.sourceType = query.sourceType;
    const list = await prisma_1.prisma.correctiveAction.findMany({ where, orderBy: { dueDate: 'asc' } });
    return list.map(map);
}
async function getCAPAById(id, role) {
    canAccess(role);
    const r = await prisma_1.prisma.correctiveAction.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'CAPA not found' };
    return map(r);
}
async function createCAPA(role, data) {
    canAccess(role);
    const r = await prisma_1.prisma.correctiveAction.create({
        data: {
            actionType: data.actionType === 'preventive' ? 'preventive' : 'corrective',
            sourceType: (data.sourceType || 'incident').trim(),
            sourceId: (data.sourceId || '').trim(),
            title: (data.title || '').trim(),
            description: (data.description || '').trim(),
            assignedTo: (data.assignedTo || '').trim(),
            dueDate: (data.dueDate || '').trim(),
            status: data.status || 'open',
        },
    });
    return map(r);
}
async function updateCAPA(id, role, data) {
    canAccess(role);
    const existing = await prisma_1.prisma.correctiveAction.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'CAPA not found' };
    const r = await prisma_1.prisma.correctiveAction.update({
        where: { id },
        data: {
            ...(data.actionType !== undefined && { actionType: data.actionType }),
            ...(data.sourceType !== undefined && { sourceType: data.sourceType }),
            ...(data.sourceId !== undefined && { sourceId: data.sourceId }),
            ...(data.title !== undefined && { title: data.title.trim() }),
            ...(data.description !== undefined && { description: data.description.trim() }),
            ...(data.assignedTo !== undefined && { assignedTo: data.assignedTo.trim() }),
            ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.completedAt !== undefined && { completedAt: data.completedAt ? new Date(data.completedAt) : null }),
        },
    });
    return map(r);
}
async function deleteCAPA(id, role) {
    canAccess(role);
    await prisma_1.prisma.correctiveAction.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'CAPA not found' };
    });
    return { message: 'Deleted' };
}
