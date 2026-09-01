import { prisma } from '../lib/prisma'
import { uploadBlob, getBlobSasUrl, deleteBlob } from './blobStorageService'

const ROLES_ALLOWED = ['owner', 'hr', 'supervisor']

function ensureRole(role: string) {
    if (!ROLES_ALLOWED.includes(role)) throw { status: 403, message: 'Only Owner, HR, or Supervisor can manage inspection files' }
}

export async function listAttachments(requestRole: string, scheduleId?: string | null) {
    ensureRole(requestRole)
    const where: { scheduleId?: string | null } = {}
    if (scheduleId !== undefined && scheduleId !== null && scheduleId !== '') {
        where.scheduleId = scheduleId
    } else {
        where.scheduleId = null
    }
    const list = await prisma.inspectionAttachment.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        select: {
            id: true,
            scheduleId: true,
            originalName: true,
            notes: true,
            uploadedAt: true,
        },
    })
    return list.map((a) => ({
        id: a.id,
        scheduleId: a.scheduleId ?? undefined,
        name: a.originalName,
        notes: a.notes ?? undefined,
        uploadedAt: a.uploadedAt.toISOString().slice(0, 10),
    }))
}

export async function listAllAttachments(requestRole: string) {
    ensureRole(requestRole)
    const list = await prisma.inspectionAttachment.findMany({
        orderBy: { uploadedAt: 'desc' },
        select: {
            id: true,
            scheduleId: true,
            originalName: true,
            notes: true,
            uploadedAt: true,
        },
    })
    return list.map((a) => ({
        id: a.id,
        scheduleId: a.scheduleId ?? undefined,
        name: a.originalName,
        notes: a.notes ?? undefined,
        uploadedAt: a.uploadedAt.toISOString().slice(0, 10),
    }))
}

export async function upload(
    uploaderId: string,
    requestRole: string,
    file: Express.Multer.File,
    body: { scheduleId?: string; notes?: string }
) {
    ensureRole(requestRole)
    const scheduleId = body.scheduleId?.trim() || null
    const notes = body.notes?.trim() || null

    const blobName = await uploadBlob(file.path, 'inspection_attachments')

    const doc = await prisma.inspectionAttachment.create({
        data: {
            scheduleId,
            filePath: blobName,
            originalName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            notes,
            uploadedById: uploaderId,
        },
        select: {
            id: true,
            scheduleId: true,
            originalName: true,
            notes: true,
            uploadedAt: true,
        },
    })
    return {
        id: doc.id,
        scheduleId: doc.scheduleId ?? undefined,
        name: doc.originalName,
        notes: doc.notes ?? undefined,
        uploadedAt: doc.uploadedAt.toISOString().slice(0, 10),
    }
}

export async function getFileUrl(attachmentId: string, requestRole: string) {
    ensureRole(requestRole)
    const a = await prisma.inspectionAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, filePath: true },
    })
    if (!a) throw { status: 404, message: 'Attachment not found' }
    const url = await getBlobSasUrl(a.filePath, 30)
    return { url, expiresInMinutes: 30 }
}

export async function remove(attachmentId: string, requestRole: string) {
    ensureRole(requestRole)
    const a = await prisma.inspectionAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, filePath: true },
    })
    if (!a) throw { status: 404, message: 'Attachment not found' }
    await deleteBlob(a.filePath)
    await prisma.inspectionAttachment.delete({ where: { id: attachmentId } })
    return { deleted: true }
}
