import { prisma } from '../lib/prisma'
import { canManageFeature, canViewFeature } from '../config/permissions'
import { deleteBlob } from './blobStorageService'

export const MAXIM_WSIB_DOCUMENT_TYPES = ['WSIB Clearance', 'CAD-7', 'NEER', 'Other'] as const
export type MaximWsibDocumentType = (typeof MAXIM_WSIB_DOCUMENT_TYPES)[number]

function ensureOwnerOrHr(userRole: string, action: 'view' | 'manage') {
    const ok = action === 'view'
        ? canViewFeature(userRole, 'maxim_wsib')
        : canManageFeature(userRole, 'maxim_wsib')
    if (!ok) {
        throw { status: 403, message: 'Only Owner or HR can access Maxim WSIB documents' }
    }
}

function normalizeDocumentType(value?: string | null): MaximWsibDocumentType {
    const trimmed = (value || '').trim()
    if ((MAXIM_WSIB_DOCUMENT_TYPES as readonly string[]).includes(trimmed)) {
        return trimmed as MaximWsibDocumentType
    }
    return 'Other'
}

function mapDoc(d: {
    id: string
    title: string
    documentType: string
    issueDate: string | null
    expirationDate: string | null
    fileName: string
    filePath: string
    uploadedById: string
    uploadedBy: string
    uploadedAt: Date
    updatedAt: Date
    notes: string | null
}) {
    return {
        id: d.id,
        title: d.title,
        documentType: d.documentType,
        issueDate: d.issueDate ?? undefined,
        expirationDate: d.expirationDate ?? undefined,
        fileName: d.fileName,
        filePath: d.filePath,
        uploadedById: d.uploadedById,
        uploadedBy: d.uploadedBy,
        uploadedAt: d.uploadedAt?.toISOString?.() ?? d.uploadedAt,
        updatedAt: d.updatedAt?.toISOString?.() ?? d.updatedAt,
        notes: d.notes ?? undefined,
    }
}

export async function listMaximWsibDocuments(userRole: string) {
    ensureOwnerOrHr(userRole, 'view')
    const list = await prisma.maximWsibDocument.findMany({
        orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { uploadedAt: 'desc' }],
    })
    return list.map(mapDoc)
}

export async function getMaximWsibDocumentById(id: string, userRole: string) {
    ensureOwnerOrHr(userRole, 'view')
    const d = await prisma.maximWsibDocument.findUnique({ where: { id } })
    if (!d) throw { status: 404, message: 'Maxim WSIB document not found' }
    return mapDoc(d)
}

export async function createMaximWsibDocument(
    userId: string,
    userRole: string,
    userName: string,
    data: {
        title: string
        documentType?: string
        issueDate?: string
        expirationDate?: string
        fileName: string
        filePath: string
        notes?: string
    }
) {
    ensureOwnerOrHr(userRole, 'manage')
    const title = data.title?.trim()
    if (!title) throw { status: 400, message: 'Title is required' }
    if (!data.fileName?.trim() || !data.filePath?.trim()) {
        throw { status: 400, message: 'A file is required' }
    }

    const created = await prisma.maximWsibDocument.create({
        data: {
            title,
            documentType: normalizeDocumentType(data.documentType),
            issueDate: data.issueDate?.trim() || null,
            expirationDate: data.expirationDate?.trim() || null,
            fileName: data.fileName.trim(),
            filePath: data.filePath.trim(),
            uploadedById: userId,
            uploadedBy: userName,
            notes: data.notes?.trim() || null,
        },
    })
    return mapDoc(created)
}

export async function updateMaximWsibDocument(
    id: string,
    userRole: string,
    data: {
        title?: string
        documentType?: string
        issueDate?: string | null
        expirationDate?: string | null
        fileName?: string
        filePath?: string
        notes?: string | null
    }
) {
    ensureOwnerOrHr(userRole, 'manage')
    const existing = await prisma.maximWsibDocument.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Maxim WSIB document not found' }

    const previousFilePath = existing.filePath
    const replacingFile = Boolean(data.filePath && data.filePath !== previousFilePath)

    const updated = await prisma.maximWsibDocument.update({
        where: { id },
        data: {
            ...(data.title !== undefined ? { title: data.title.trim() || existing.title } : {}),
            ...(data.documentType !== undefined ? { documentType: normalizeDocumentType(data.documentType) } : {}),
            ...(data.issueDate !== undefined ? { issueDate: data.issueDate?.trim() || null } : {}),
            ...(data.expirationDate !== undefined ? { expirationDate: data.expirationDate?.trim() || null } : {}),
            ...(data.fileName !== undefined ? { fileName: data.fileName.trim() || existing.fileName } : {}),
            ...(data.filePath !== undefined ? { filePath: data.filePath.trim() || existing.filePath } : {}),
            ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        },
    })

    // Keep only current file — delete previous blob when replaced
    if (replacingFile && previousFilePath) {
        await deleteBlob(previousFilePath)
    }

    return mapDoc(updated)
}

export async function deleteMaximWsibDocument(id: string, userRole: string) {
    ensureOwnerOrHr(userRole, 'manage')
    const existing = await prisma.maximWsibDocument.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Maxim WSIB document not found' }
    await prisma.maximWsibDocument.delete({ where: { id } })
    if (existing.filePath) await deleteBlob(existing.filePath)
    return { message: 'Deleted' }
}
