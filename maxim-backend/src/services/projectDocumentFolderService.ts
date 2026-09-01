import { prisma } from '../lib/prisma'

function isOwnerOrHr(role: string) {
    return role === 'owner' || role === 'hr'
}

function normalizeFolderName(name: string): string {
    return name.trim().replace(/\s+/g, ' ')
}

async function assertJobExists(jobId: string) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } })
    if (!job) throw { status: 404, message: 'Project not found' }
}

async function getFolderInJob(jobId: string, folderId: string) {
    const folder = await prisma.projectDocumentFolder.findFirst({
        where: { id: folderId, jobId },
    })
    if (!folder) throw { status: 404, message: 'Folder not found' }
    return folder
}

async function assertUniqueName(jobId: string, parentId: string | null, name: string, excludeId?: string) {
    const existing = await prisma.projectDocumentFolder.findFirst({
        where: {
            jobId,
            parentId,
            name: { equals: name, mode: 'insensitive' },
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
    })
    if (existing) throw { status: 409, message: 'A folder with this name already exists here' }
}

async function assertValidParent(jobId: string, parentId: string | null, folderId?: string) {
    if (!parentId) return
    const parent = await getFolderInJob(jobId, parentId)
    if (folderId && parent.id === folderId) {
        throw { status: 400, message: 'A folder cannot be its own parent' }
    }
    if (folderId) {
        let cursor: string | null = parentId
        while (cursor) {
            if (cursor === folderId) {
                throw { status: 400, message: 'Cannot move a folder into one of its subfolders' }
            }
            const node: { parentId: string | null } | null = await prisma.projectDocumentFolder.findUnique({
                where: { id: cursor },
                select: { parentId: true },
            })
            cursor = node?.parentId ?? null
        }
    }
}

function mapFolder(f: {
    id: string
    name: string
    parentId: string | null
    createdAt: Date
    createdBy: { firstName: string; lastName: string }
    _count?: { documents: number; children: number }
}) {
    return {
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        createdAt: f.createdAt.toISOString(),
        createdBy: `${f.createdBy.firstName} ${f.createdBy.lastName}`.trim(),
        documentCount: f._count?.documents ?? 0,
        subfolderCount: f._count?.children ?? 0,
    }
}

export async function listProjectDocumentFolders(jobId: string, parentId: string | null) {
    await assertJobExists(jobId)
    if (parentId) await getFolderInJob(jobId, parentId)

    const folders = await prisma.projectDocumentFolder.findMany({
        where: { jobId, parentId },
        include: {
            createdBy: { select: { firstName: true, lastName: true } },
            _count: { select: { documents: true, children: true } },
        },
        orderBy: { name: 'asc' },
    })

    return folders.map(mapFolder)
}

export async function getProjectDocumentFolderPath(jobId: string, folderId: string) {
    await assertJobExists(jobId)
    const folder = await getFolderInJob(jobId, folderId)

    const path: { id: string; name: string }[] = []
    let cursor: { id: string; name: string; parentId: string | null } | null = folder

    while (cursor) {
        path.unshift({ id: cursor.id, name: cursor.name })
        if (!cursor.parentId) break
        const parent: { id: string; name: string; parentId: string | null } | null =
            await prisma.projectDocumentFolder.findFirst({
                where: { id: cursor.parentId, jobId },
                select: { id: true, name: true, parentId: true },
            })
        if (!parent) break
        cursor = parent
    }

    return path
}

export async function createProjectDocumentFolder(
    userId: string,
    userRole: string,
    jobId: string,
    data: { name: string; parentId?: string | null }
) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can create folders' }

    const name = normalizeFolderName(data.name)
    if (!name) throw { status: 400, message: 'Folder name is required' }
    if (name.length > 120) throw { status: 400, message: 'Folder name is too long' }

    await assertJobExists(jobId)
    const parentId = data.parentId ?? null
    await assertValidParent(jobId, parentId)
    await assertUniqueName(jobId, parentId, name)

    const folder = await prisma.projectDocumentFolder.create({
        data: {
            jobId,
            name,
            parentId,
            createdById: userId,
        },
        include: {
            createdBy: { select: { firstName: true, lastName: true } },
            _count: { select: { documents: true, children: true } },
        },
    })

    return mapFolder(folder)
}

export async function renameProjectDocumentFolder(
    userId: string,
    userRole: string,
    jobId: string,
    folderId: string,
    name: string
) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can rename folders' }

    const trimmed = normalizeFolderName(name)
    if (!trimmed) throw { status: 400, message: 'Folder name is required' }
    if (trimmed.length > 120) throw { status: 400, message: 'Folder name is too long' }

    const folder = await getFolderInJob(jobId, folderId)
    await assertUniqueName(jobId, folder.parentId, trimmed, folderId)

    const updated = await prisma.projectDocumentFolder.update({
        where: { id: folderId },
        data: { name: trimmed },
        include: {
            createdBy: { select: { firstName: true, lastName: true } },
            _count: { select: { documents: true, children: true } },
        },
    })

    return mapFolder(updated)
}

export async function deleteProjectDocumentFolder(
    userId: string,
    userRole: string,
    jobId: string,
    folderId: string
) {
    if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can delete folders' }

    await getFolderInJob(jobId, folderId)

    const [docCount, childCount] = await Promise.all([
        prisma.libraryDocument.count({ where: { folderId } }),
        prisma.projectDocumentFolder.count({ where: { parentId: folderId } }),
    ])

    if (docCount > 0 || childCount > 0) {
        throw { status: 409, message: 'Folder must be empty before it can be deleted' }
    }

    await prisma.projectDocumentFolder.delete({ where: { id: folderId } })
    return { ok: true }
}

export async function assertFolderBelongsToJob(jobId: string, folderId: string | null | undefined) {
    if (!folderId) return null
    return getFolderInJob(jobId, folderId)
}
