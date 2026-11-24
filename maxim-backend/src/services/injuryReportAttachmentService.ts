import { prisma } from '../lib/prisma'
import { uploadBlob, getBlobSasUrl, deleteBlob } from './blobStorageService'

const ROLES_ALLOWED = ['owner', 'hr', 'supervisor']

function ensureRole(role: string) {
    if (!ROLES_ALLOWED.includes(role)) {
        throw { status: 403, message: 'Only Owner, HR, or Supervisor can manage injury report files' }
    }
}

async function ensureReportExists(injuryReportId: string) {
    const report = await prisma.injuryReport.findUnique({
        where: { id: injuryReportId },
        select: { id: true },
    })
    if (!report) throw { status: 404, message: 'Injury report not found' }
}

export async function listAttachments(injuryReportId: string, requestRole: string) {
    ensureRole(requestRole)
    await ensureReportExists(injuryReportId)
    const list = await prisma.injuryReportAttachment.findMany({
        where: { injuryReportId },
        orderBy: { uploadedAt: 'desc' },
        select: {
            id: true,
            injuryReportId: true,
            originalName: true,
            notes: true,
            uploadedAt: true,
        },
    })
    return list.map((a) => ({
        id: a.id,
        injuryReportId: a.injuryReportId,
        name: a.originalName,
        notes: a.notes ?? undefined,
        uploadedAt: a.uploadedAt.toISOString().slice(0, 10),
    }))
}

export async function upload(
    uploaderId: string,
    requestRole: string,
    injuryReportId: string,
    file: Express.Multer.File,
    body: { notes?: string }
) {
    ensureRole(requestRole)
    await ensureReportExists(injuryReportId)
    const notes = body.notes?.trim() || null

    const blobName = await uploadBlob(file.path, 'injury_report_attachments')

    const doc = await prisma.injuryReportAttachment.create({
        data: {
            injuryReportId,
            filePath: blobName,
            originalName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            notes,
            uploadedById: uploaderId,
        },
        select: {
            id: true,
            injuryReportId: true,
            originalName: true,
            notes: true,
            uploadedAt: true,
        },
    })
    return {
        id: doc.id,
        injuryReportId: doc.injuryReportId,
        name: doc.originalName,
        notes: doc.notes ?? undefined,
        uploadedAt: doc.uploadedAt.toISOString().slice(0, 10),
    }
}

export async function getFileUrl(attachmentId: string, requestRole: string) {
    ensureRole(requestRole)
    const a = await prisma.injuryReportAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, filePath: true },
    })
    if (!a) throw { status: 404, message: 'Attachment not found' }
    const url = await getBlobSasUrl(a.filePath, 30)
    return { url, expiresInMinutes: 30 }
}

export async function remove(attachmentId: string, requestRole: string) {
    ensureRole(requestRole)
    const a = await prisma.injuryReportAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, filePath: true },
    })
    if (!a) throw { status: 404, message: 'Attachment not found' }
    await deleteBlob(a.filePath)
    await prisma.injuryReportAttachment.delete({ where: { id: attachmentId } })
    return { deleted: true }
}
