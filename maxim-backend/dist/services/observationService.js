"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listObservations = listObservations;
exports.getObservationById = getObservationById;
exports.createObservation = createObservation;
exports.updateObservation = updateObservation;
exports.deleteObservation = deleteObservation;
const prisma_1 = require("../lib/prisma");
const ROLES = ['owner', 'hr', 'supervisor'];
function canAccess(role) {
    if (!ROLES.includes(role))
        throw { status: 403, message: 'Insufficient role for safety observations' };
}
function map(r) {
    return {
        id: r.id,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName,
        type: r.type,
        description: r.description,
        observedBy: r.observedBy,
        observedAt: r.observedAt?.toISOString?.() ?? undefined,
        photoUrl: r.photoUrl ?? undefined,
    };
}
async function listObservations(role, query) {
    canAccess(role);
    const where = {};
    if (query.type)
        where.type = query.type;
    if (query.siteId)
        where.siteId = query.siteId;
    const list = await prisma_1.prisma.safetyObservation.findMany({ where, orderBy: { observedAt: 'desc' } });
    return list.map(map);
}
async function getObservationById(id, role) {
    canAccess(role);
    const r = await prisma_1.prisma.safetyObservation.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Observation not found' };
    return map(r);
}
async function createObservation(userId, role, userName, data) {
    canAccess(role);
    const r = await prisma_1.prisma.safetyObservation.create({
        data: {
            siteId: data.siteId?.trim() || null,
            siteName: (data.siteName || '').trim(),
            type: data.type === 'positive' || data.type === 'corrective' ? data.type : 'positive',
            description: (data.description || '').trim(),
            observedBy: data.observedBy?.trim() || userName,
            observedById: userId,
            photoUrl: data.photoUrl?.trim() || null,
        },
    });
    return map(r);
}
async function updateObservation(id, role, data) {
    canAccess(role);
    const existing = await prisma_1.prisma.safetyObservation.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Observation not found' };
    const r = await prisma_1.prisma.safetyObservation.update({
        where: { id },
        data: {
            ...(data.siteName !== undefined && { siteName: data.siteName.trim() }),
            ...(data.siteId !== undefined && { siteId: data.siteId?.trim() || null }),
            ...(data.type !== undefined && { type: data.type }),
            ...(data.description !== undefined && { description: data.description.trim() }),
            ...(data.observedBy !== undefined && { observedBy: data.observedBy.trim() }),
            ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl?.trim() || null }),
        },
    });
    return map(r);
}
async function deleteObservation(id, role) {
    canAccess(role);
    await prisma_1.prisma.safetyObservation.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Observation not found' };
    });
    return { message: 'Deleted' };
}
