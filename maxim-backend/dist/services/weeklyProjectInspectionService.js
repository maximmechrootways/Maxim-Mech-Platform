"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWeeklyProjectInspection = createWeeklyProjectInspection;
exports.listWeeklyProjectInspections = listWeeklyProjectInspections;
exports.getWeeklyProjectInspectionById = getWeeklyProjectInspectionById;
const prisma_1 = require("../lib/prisma");
async function createWeeklyProjectInspection(userId, userName, data) {
    const r = await prisma_1.prisma.weeklyProjectInspection.create({
        data: {
            location: data.location,
            date: data.date || new Date().toISOString().slice(0, 10),
            time: data.time || null,
            inspectedById: data.inspectedById,
            inspectedByName: data.inspectedByName || null,
            reviewedById: data.reviewedById || null,
            reviewedByName: data.reviewedByName || null,
            checkedItems: Array.isArray(data.checkedItems) ? data.checkedItems : [],
            hazardObservations: Array.isArray(data.hazardObservations) ? data.hazardObservations : [],
            comments: data.comments?.trim() || null,
            managementInitials: data.managementInitials?.trim() || null,
            submittedById: userId,
            submittedBy: { connect: { id: userId } },
        },
    });
    return r;
}
async function listWeeklyProjectInspections(params) {
    const where = {};
    if (params?.fromDate || params?.toDate) {
        where.date = {};
        if (params.fromDate)
            where.date.gte = params.fromDate;
        if (params.toDate)
            where.date.lte = params.toDate;
    }
    const list = await prisma_1.prisma.weeklyProjectInspection.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
    });
    return list;
}
async function getWeeklyProjectInspectionById(id) {
    const r = await prisma_1.prisma.weeklyProjectInspection.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Inspection not found' };
    return r;
}
