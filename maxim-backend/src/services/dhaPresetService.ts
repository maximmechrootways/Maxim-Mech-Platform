import { prisma } from '../lib/prisma'

export async function listDhaPresets() {
    const presets = await prisma.dhaPreset.findMany({
        orderBy: { name: 'asc' },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
    })
    return presets.map((p) => ({
        id: p.id,
        name: p.name,
        data: p.data,
        createdBy: `${p.createdBy.firstName} ${p.createdBy.lastName}`.trim(),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    }))
}

export async function createDhaPreset(userId: string, name: string, data: any) {
    const preset = await prisma.dhaPreset.create({
        data: {
            name: name.trim(),
            data,
            createdById: userId,
        },
    })
    return { id: preset.id, name: preset.name }
}

export async function updateDhaPreset(id: string, userId: string, userRole: string, name?: string, data?: any) {
    const existing = await prisma.dhaPreset.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Preset not found' }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name.trim()
    if (data !== undefined) updateData.data = data

    const updated = await prisma.dhaPreset.update({ where: { id }, data: updateData })
    return { id: updated.id, name: updated.name }
}

export async function deleteDhaPreset(id: string, userId: string, userRole: string) {
    const existing = await prisma.dhaPreset.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Preset not found' }

    await prisma.dhaPreset.delete({ where: { id } })
    return { success: true }
}
