"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDraft = createDraft;
exports.getById = getById;
exports.list = list;
exports.update = update;
exports.submit = submit;
const prisma_1 = require("../lib/prisma");
function isOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
async function createDraft(userId, jobId, siteId) {
    const existing = await prisma_1.prisma.elevatingPlatformInspection.findFirst({
        where: {
            submittedById: userId,
            status: 'draft',
        },
        orderBy: { createdAt: 'desc' },
    });
    if (existing)
        return existing;
    return prisma_1.prisma.elevatingPlatformInspection.create({
        data: {
            submittedById: userId,
            status: 'draft',
            jobId: jobId || null,
            siteId: siteId || null,
            checklistValues: {},
        },
    });
}
async function getById(id, userId, userRole) {
    const inspection = await prisma_1.prisma.elevatingPlatformInspection.findUnique({
        where: { id },
        include: {
            submittedBy: { select: { firstName: true, lastName: true } },
        },
    });
    if (!inspection)
        throw { status: 404, message: 'Inspection not found' };
    if (!isOwnerOrHr(userRole) && inspection.submittedById !== userId) {
        throw { status: 403, message: 'Forbidden' };
    }
    return inspection;
}
async function list(userId, userRole, query) {
    const where = {};
    if (!isOwnerOrHr(userRole)) {
        where.submittedById = userId;
    }
    if (query?.status) {
        where.status = query.status;
    }
    return prisma_1.prisma.elevatingPlatformInspection.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
            submittedBy: { select: { firstName: true, lastName: true } },
        },
    });
}
async function update(id, userId, userRole, data) {
    const inspection = await prisma_1.prisma.elevatingPlatformInspection.findUnique({ where: { id } });
    if (!inspection)
        throw { status: 404, message: 'Not found' };
    if (!isOwnerOrHr(userRole) && inspection.submittedById !== userId) {
        throw { status: 403, message: 'Forbidden' };
    }
    return prisma_1.prisma.elevatingPlatformInspection.update({
        where: { id },
        data,
    });
}
async function submit(id, userId, userRole) {
    const inspection = await prisma_1.prisma.elevatingPlatformInspection.findUnique({ where: { id } });
    if (!inspection)
        throw { status: 404, message: 'Not found' };
    if (!isOwnerOrHr(userRole) && inspection.submittedById !== userId) {
        throw { status: 403, message: 'Forbidden' };
    }
    return prisma_1.prisma.elevatingPlatformInspection.update({
        where: { id },
        data: {
            status: 'submitted',
            submittedAt: new Date(),
        },
    });
}
