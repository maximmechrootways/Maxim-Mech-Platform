import { prisma } from '../lib/prisma'
import { uploadBlob, getBlobSasUrl, deleteBlob } from './blobStorageService'
import { assertFolderBelongsToJob } from './projectDocumentFolderService'
import fs from 'fs'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')

/** Large SDS books — skip sync extract (OOM/timeout risk); background ingest handles text. */
const MAX_SYNC_PDF_EXTRACT_BYTES = 2 * 1024 * 1024
const PDF_EXTRACT_TIMEOUT_MS = 8_000
const MAX_EXTRACTED_TEXT_CHARS = 500_000

function isOwnerOrHr(role: string) {
    return role === 'owner' || role === 'hr'
}

async function tryExtractPdfText(file: Express.Multer.File): Promise<string | null> {
    if (file.mimetype !== 'application/pdf') return null
    const size = file.size || 0
    if (size > MAX_SYNC_PDF_EXTRACT_BYTES) {
        console.log(
            `Skipping sync PDF extract for large file ${file.originalname} (${(size / 1024 / 1024).toFixed(1)}MB) — background ingest will process it`
        )
        return null
    }
    try {
        const fileBuffer = fs.readFileSync(file.path)
        const pdfData = await Promise.race([
            pdfParse(fileBuffer),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('PDF extract timeout')), PDF_EXTRACT_TIMEOUT_MS)
            ),
        ])
        const text = pdfData.text?.trim() || null
        if (!text) return null
        return text.length > MAX_EXTRACTED_TEXT_CHARS ? text.slice(0, MAX_EXTRACTED_TEXT_CHARS) : text
    } catch (e) {
        console.warn('PDF text extraction failed for', file.originalname, e)
        return null
    }
}

export async function listLibraryDocuments(userId: string, userRole: string) {
    const all = await prisma.libraryDocument.findMany({
        include: { site: true, uploadedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
    })
    const visible = all.filter((d) => canView(d, userId, userRole))
    return visible.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        siteId: d.siteId,
        siteName: d.site?.name,
        jobId: d.jobId,
        date: d.date,
        uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
        visibility: d.visibility,
        visibleToRoles: (d.visibleToRoles as string[]) || [],
        visibleToUserIds: (d.visibleToUserIds as string[]) || [],
        filePath: d.filePath,
        tags: (d.tags as string[]) || [],
        version: d.version,
        acknowledgedBy: (d.acknowledgedBy as any[]) || [],
        lastOpenedAt: d.lastOpenedAt?.toISOString(),
        lastOpenedBy: d.lastOpenedBy,
        lastEditedAt: d.lastEditedAt?.toISOString(),
        lastEditedBy: d.lastEditedBy,
    }))
}

function canView(d: any, userId: string, userRole: string): boolean {
    if (d.visibility === 'everyone') return true
    const roles = (d.visibleToRoles as string[]) || []
    const userIds = (d.visibleToUserIds as string[]) || []
    if (isOwnerOrHr(userRole)) return true
    if (roles.includes(userRole)) return true
    if (userIds.includes(userId)) return true
    return false
}

export async function getLibraryDocumentById(id: string, userId: string, userRole: string) {
    const d = await prisma.libraryDocument.findUnique({
        where: { id },
        include: { site: true, uploadedBy: { select: { firstName: true, lastName: true } } },
    })
    if (!d) throw { status: 404, message: 'Document not found' }
    if (!canView(d, userId, userRole)) throw { status: 403, message: 'Forbidden' }
    return {
        id: d.id,
        name: d.name,
        type: d.type,
        siteId: d.siteId,
        siteName: d.site?.name,
        jobId: d.jobId,
        date: d.date,
        uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
        visibility: d.visibility,
        visibleToRoles: (d.visibleToRoles as string[]) || [],
        visibleToUserIds: (d.visibleToUserIds as string[]) || [],
        filePath: d.filePath,
        tags: (d.tags as string[]) || [],
        version: d.version,
        extractedText: d.extractedText ?? undefined,
        acknowledgedBy: (d.acknowledgedBy as any[]) || [],
        lastOpenedAt: d.lastOpenedAt?.toISOString(),
        lastOpenedBy: d.lastOpenedBy,
        lastEditedAt: d.lastEditedAt?.toISOString(),
        lastEditedBy: d.lastEditedBy,
    }
}

export async function getLibraryDocumentFile(id: string, userId: string, userRole: string) {
    const doc = await getLibraryDocumentById(id, userId, userRole)
    // Return a SAS URL for the blob
    const sasUrl = await getBlobSasUrl(doc.filePath, 30)
    return sasUrl
}

export async function createLibraryDocument(userId: string, userRole: string, file: Express.Multer.File, data: {
    name: string
    type?: string
    siteId?: string
    jobId?: string
    folderId?: string | null
    date?: string
    visibility?: string
    visibleToRoles?: string[]
    visibleToUserIds?: string[]
}) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can upload library documents' }

    if (data.folderId && data.jobId) {
        await assertFolderBelongsToJob(data.jobId, data.folderId)
    } else if (data.folderId && !data.jobId) {
        throw { status: 400, message: 'jobId is required when folderId is set' }
    }

    // Extract text BEFORE blob upload (uploadBlob deletes the local temp file).
    // Large SDS/MSDS books skip sync extract to avoid Azure OOM/timeouts.
    const extractedText = await tryExtractPdfText(file)
    if (extractedText) {
        console.log(`Extracted ${extractedText.length} chars from ${file.originalname}`)
    }

    // Upload to Azure Blob Storage (deletes local file)
    const blobName = await uploadBlob(file.path, 'documents')
    const date = data.date || new Date().toISOString().slice(0, 10)
    const doc = await prisma.libraryDocument.create({
        data: {
            name: data.name?.trim() || file.originalname || 'Document',
            type: data.type || 'other',
            siteId: data.siteId || null,
            jobId: data.jobId || null,
            folderId: data.folderId || null,
            date,
            filePath: blobName,
            uploadedById: userId,
            visibility: data.visibility || 'everyone',
            visibleToRoles: (data.visibleToRoles || []) as any,
            visibleToUserIds: (data.visibleToUserIds || []) as any,
            extractedText,
        },
    })
    return { id: doc.id, name: doc.name, type: doc.type, date: doc.date, filePath: doc.filePath }
}

export async function updateLibraryDocument(id: string, userId: string, userRole: string, data: {
    visibility?: string
    visibleToRoles?: string[]
    visibleToUserIds?: string[]
    lastOpenedAt?: string
    lastOpenedBy?: string
    folderId?: string | null
    name?: string
}) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Forbidden' }
    const doc = await prisma.libraryDocument.findUnique({ where: { id } })
    if (!doc) throw { status: 404, message: 'Document not found' }
    const updateData: any = {}
    if (data.visibility !== undefined) updateData.visibility = data.visibility
    if (data.visibleToRoles !== undefined) updateData.visibleToRoles = data.visibleToRoles
    if (data.visibleToUserIds !== undefined) updateData.visibleToUserIds = data.visibleToUserIds
    if (data.lastOpenedAt !== undefined) updateData.lastOpenedAt = new Date(data.lastOpenedAt)
    if (data.lastOpenedBy !== undefined) updateData.lastOpenedBy = data.lastOpenedBy
    if (data.name !== undefined) {
        const trimmed = data.name.trim()
        if (!trimmed) throw { status: 400, message: 'Document name is required' }
        updateData.name = trimmed
    }
    if (data.folderId !== undefined) {
        if (data.folderId && doc.jobId) {
            await assertFolderBelongsToJob(doc.jobId, data.folderId)
        } else if (data.folderId && !doc.jobId) {
            throw { status: 400, message: 'Cannot assign folder to a document not linked to a project' }
        }
        updateData.folderId = data.folderId || null
    }
    await prisma.libraryDocument.update({ where: { id }, data: updateData })
    return await getLibraryDocumentById(id, userId, userRole)
}

export async function replaceLibraryDocumentFile(
    id: string,
    userId: string,
    userRole: string,
    file: Express.Multer.File
) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can overwrite library documents' }

    const doc = await prisma.libraryDocument.findUnique({ where: { id } })
    if (!doc) throw { status: 404, message: 'Document not found' }

    const extractedText = await tryExtractPdfText(file)

    // Upload new file to blob storage
    const newBlobName = await uploadBlob(file.path, 'documents')

    // Delete the old blob if the new one uploaded successfully
    if (doc.filePath) {
        await deleteBlob(doc.filePath)
    }

    // Update the record with the new file, cleared extractedText, and edit metadata
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } })
    const editorName = user ? `${user.firstName} ${user.lastName}`.trim() : userId

    await prisma.libraryDocument.update({
        where: { id },
        data: {
            filePath: newBlobName,
            extractedText,
            lastEditedAt: new Date(),
            lastEditedBy: editorName,
        },
    })

    return {
        id: doc.id,
        name: doc.name,
        filePath: newBlobName,
    }
}

export async function listByJobId(jobId: string, userId: string, userRole: string, folderId?: string | null) {
    const where: { jobId: string; folderId?: string | null } = { jobId }
    if (folderId !== undefined) {
        where.folderId = folderId
    }

    const docs = await prisma.libraryDocument.findMany({
        where,
        include: { site: true, uploadedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
    })
    return docs
        .filter((d) => canView(d, userId, userRole))
        .map((d) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            jobId: d.jobId,
            folderId: d.folderId,
            date: d.date,
            uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
            createdAt: d.createdAt.toISOString(),
            filePath: d.filePath,
        }))
}

export async function deleteLibraryDocument(id: string, _userId: string, userRole: string) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can delete library documents' }

    const doc = await prisma.libraryDocument.findUnique({ where: { id } })
    if (!doc) throw { status: 404, message: 'Document not found' }

    if (doc.filePath) {
        await deleteBlob(doc.filePath)
    }

    await prisma.libraryDocument.delete({ where: { id } })
    return { ok: true }
}

