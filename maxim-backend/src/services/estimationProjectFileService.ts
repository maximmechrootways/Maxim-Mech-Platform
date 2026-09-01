import { EstimationPricingFolder } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { uploadBlob } from './blobStorageService'

const ROLES = new Set(['owner', 'hr', 'supervisor'])

const FOLDER_SET = new Set<string>(Object.values(EstimationPricingFolder))

export function parseEstimationFolder(raw: unknown): EstimationPricingFolder | null {
    if (typeof raw !== 'string') return null
    const normalized = raw.trim()
    if (!normalized || !FOLDER_SET.has(normalized)) return null
    return normalized as EstimationPricingFolder
}

function ensureRole(role: string) {
    if (!ROLES.has(role)) {
        throw { status: 403, message: 'Only owners, HR, and supervisors can access estimation files.' }
    }
}

export async function listFiles(userRole: string, folder?: EstimationPricingFolder, siteId?: string) {
    ensureRole(userRole)
    const where: { folder?: EstimationPricingFolder; siteId?: string } = {}
    if (folder) where.folder = folder
    if (siteId) where.siteId = siteId

    return prisma.estimationProjectFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            folder: true,
            name: true,
            siteId: true,
            site: { select: { id: true, name: true } },
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            notes: true,
            createdAt: true,
            uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
    })
}

export async function uploadFile(
    userId: string,
    userRole: string,
    file: Express.Multer.File,
    body: { folder: string; name?: string; siteId?: string | null; notes?: string | null }
) {
    ensureRole(userRole)
    const folder = parseEstimationFolder(body.folder)
    if (!folder) {
        throw { status: 400, message: 'Invalid folder. Use a valid estimation category.' }
    }

    const name = (body.name && String(body.name).trim()) || file.originalname || 'Untitled'
    let siteId: string | null = null
    if (body.siteId && String(body.siteId).trim() && String(body.siteId).trim() !== 'none') {
        const site = await prisma.site.findUnique({ where: { id: String(body.siteId).trim() } })
        if (!site) throw { status: 400, message: 'Job site not found.' }
        siteId = site.id
    }

    const blobName = await uploadBlob(file.path, 'estimation_pricing')

    const rawNotes = body.notes != null ? String(body.notes).trim() : ''
    const notes = rawNotes ? rawNotes.slice(0, 8000) : null

    const row = await prisma.estimationProjectFile.create({
        data: {
            folder,
            name: name.slice(0, 500),
            siteId,
            filePath: blobName,
            originalName: file.originalname.slice(0, 500),
            mimeType: file.mimetype.slice(0, 200),
            sizeBytes: file.size,
            notes,
            uploadedById: userId,
        },
        select: {
            id: true,
            folder: true,
            name: true,
            siteId: true,
            site: { select: { id: true, name: true } },
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            notes: true,
            createdAt: true,
            uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
    })

    return row
}

export async function getFileMetaForUser(id: string, userRole: string) {
    ensureRole(userRole)
    const doc = await prisma.estimationProjectFile.findUnique({
        where: { id },
        select: { id: true, filePath: true, mimeType: true, originalName: true },
    })
    if (!doc) throw { status: 404, message: 'File not found' }
    return doc
}

export async function removeFile(id: string, userRole: string) {
    ensureRole(userRole)
    if (userRole !== 'owner' && userRole !== 'hr') {
        throw { status: 403, message: 'Only owners and HR can delete estimation files.' }
    }
    const doc = await prisma.estimationProjectFile.findUnique({ where: { id }, select: { id: true, filePath: true } })
    if (!doc) throw { status: 404, message: 'File not found' }
    const { deleteBlob } = await import('./blobStorageService')
    try {
        await deleteBlob(doc.filePath)
    } catch {
        /* still remove DB row */
    }
    await prisma.estimationProjectFile.delete({ where: { id } })
}
