"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDhaPresets = listDhaPresets;
exports.createDhaPreset = createDhaPreset;
exports.updateDhaPreset = updateDhaPreset;
exports.deleteDhaPreset = deleteDhaPreset;
const prisma_1 = require("../lib/prisma");
async function listDhaPresets() {
    const presets = await prisma_1.prisma.dhaPreset.findMany({
        orderBy: { name: 'asc' },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    return presets.map((p) => ({
        id: p.id,
        name: p.name,
        data: p.data,
        createdBy: `${p.createdBy.firstName} ${p.createdBy.lastName}`.trim(),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    }));
}
async function createDhaPreset(userId, name, data) {
    const preset = await prisma_1.prisma.dhaPreset.create({
        data: {
            name: name.trim(),
            data,
            createdById: userId,
        },
    });
    return { id: preset.id, name: preset.name };
}
async function updateDhaPreset(id, userId, userRole, name, data) {
    const existing = await prisma_1.prisma.dhaPreset.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Preset not found' };
    const updateData = {};
    if (name !== undefined)
        updateData.name = name.trim();
    if (data !== undefined)
        updateData.data = data;
    const updated = await prisma_1.prisma.dhaPreset.update({ where: { id }, data: updateData });
    return { id: updated.id, name: updated.name };
}
async function deleteDhaPreset(id, userId, userRole) {
    const existing = await prisma_1.prisma.dhaPreset.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Preset not found' };
    await prisma_1.prisma.dhaPreset.delete({ where: { id } });
    return { success: true };
}
