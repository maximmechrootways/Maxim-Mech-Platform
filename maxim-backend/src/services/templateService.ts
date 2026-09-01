import { prisma } from '../lib/prisma'
import path from 'path'
import fs from 'fs'

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'

function isOwnerOrHr(role: string) {
    return role === 'owner' || role === 'hr'
}

export async function uploadScannedPdf(userId: string, userRole: string, file: Express.Multer.File, name?: string) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can upload PDF templates' }
    const fileName = name || file.originalname || `upload-${Date.now()}.pdf`
    const record = await prisma.scannedPdf.create({
        data: {
            name: fileName,
            filePath: file.path,
            uploadedById: userId,
        },
        include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    })
    return {
        id: record.id,
        name: record.name,
        uploadedAt: record.uploadedAt.toISOString(),
        uploadedBy: `${record.uploadedBy.firstName} ${record.uploadedBy.lastName}`,
    }
}

export async function listScannedPdfs(userId: string, userRole: string) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Forbidden' }
    const list = await prisma.scannedPdf.findMany({
        orderBy: { uploadedAt: 'desc' },
        include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    })
    return list.map((p) => ({
        id: p.id,
        name: p.name,
        uploadedAt: p.uploadedAt.toISOString(),
        uploadedBy: `${p.uploadedBy.firstName} ${p.uploadedBy.lastName}`,
    }))
}

export async function getScannedPdfById(id: string, userId: string, userRole: string) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Forbidden' }
    const pdf = await prisma.scannedPdf.findUnique({
        where: { id },
        include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    })
    if (!pdf) throw { status: 404, message: 'PDF not found' }
    return {
        id: pdf.id,
        name: pdf.name,
        filePath: pdf.filePath,
        uploadedAt: pdf.uploadedAt.toISOString(),
        uploadedBy: `${pdf.uploadedBy.firstName} ${pdf.uploadedBy.lastName}`,
    }
}

export async function getScannedPdfFile(id: string, userId: string, userRole: string) {
    const pdf = await getScannedPdfById(id, userId, userRole)
    if (!fs.existsSync(pdf.filePath)) throw { status: 404, message: 'File not found' }
    return pdf.filePath
}

export async function createSignableTemplate(userId: string, userRole: string, data: {
    name: string
    description?: string
    sourcePdfId?: string
    schedule: string
    assignedToRoles: string[]
    assignedToUserIds?: string[]
    placedFields: any[]
}) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can create templates' }
    const template = await prisma.signableFormTemplate.create({
        data: {
            name: data.name.trim(),
            description: data.description?.trim() ?? '',
            sourcePdfId: data.sourcePdfId || null,
            schedule: data.schedule || 'daily',
            assignedToRoles: (data.assignedToRoles || []) as any,
            assignedToUserIds: (data.assignedToUserIds || []) as any,
            placedFields: (data.placedFields || []) as any,
            createdById: userId,
        },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
    })
    return toSignableTemplateResponse(template)
}

export async function listSignableTemplates(userId: string, userRole: string) {
    const raw = await prisma.signableFormTemplate.findMany({
        where: { active: true },
        include: { createdBy: { select: { firstName: true, lastName: true } }, sourcePdf: true },
    })
    const assignedToMe = raw.filter((t) => {
        const roles = (t.assignedToRoles as string[]) || []
        const userIds = (t.assignedToUserIds as string[]) || []
        if (roles.includes(userRole)) return true
        if (userIds.includes(userId)) return true
        if (isOwnerOrHr(userRole)) return true
        return false
    })
    return assignedToMe.map((t) => toSignableTemplateResponse(t))
}

function toSignableTemplateResponse(t: any) {
    return {
        id: t.id,
        name: t.name,
        description: t.description,
        sourcePdfId: t.sourcePdfId,
        schedule: t.schedule,
        assignedToRoles: t.assignedToRoles || [],
        assignedToUserIds: t.assignedToUserIds || [],
        placedFields: t.placedFields || [],
        createdAt: t.createdAt.toISOString(),
        createdBy: t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : '',
        active: t.active,
    }
}

export async function getSignableTemplateById(id: string, userId: string, userRole: string) {
    const template = await prisma.signableFormTemplate.findUnique({
        where: { id },
        include: { createdBy: true, sourcePdf: true },
    })
    if (!template) throw { status: 404, message: 'Template not found' }
    const roles = (template.assignedToRoles as string[]) || []
    const userIds = (template.assignedToUserIds as string[]) || []
    const canAccess = isOwnerOrHr(userRole) || roles.includes(userRole) || userIds.includes(userId)
    if (!canAccess) throw { status: 403, message: 'Forbidden' }
    return {
        ...toSignableTemplateResponse(template),
        sourcePdf: template.sourcePdf ? { id: template.sourcePdf.id, name: template.sourcePdf.name, filePath: template.sourcePdf.filePath } : null,
    }
}

export async function updateSignableTemplate(id: string, userId: string, userRole: string, data: Partial<{
    name: string
    description: string
    schedule: string
    assignedToRoles: string[]
    assignedToUserIds: string[]
    placedFields: any[]
    active: boolean
}>) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can update templates' }
    const template = await prisma.signableFormTemplate.findUnique({ where: { id } })
    if (!template) throw { status: 404, message: 'Template not found' }
    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name.trim()
    if (data.description !== undefined) updateData.description = data.description
    if (data.schedule !== undefined) updateData.schedule = data.schedule
    if (data.assignedToRoles !== undefined) updateData.assignedToRoles = data.assignedToRoles
    if (data.assignedToUserIds !== undefined) updateData.assignedToUserIds = data.assignedToUserIds
    if (data.placedFields !== undefined) updateData.placedFields = data.placedFields
    if (data.active !== undefined) updateData.active = data.active
    const updated = await prisma.signableFormTemplate.update({
        where: { id },
        data: updateData,
        include: { createdBy: { select: { firstName: true, lastName: true } } },
    })
    return toSignableTemplateResponse(updated)
}
