"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProjectDocumentFolders = listProjectDocumentFolders;
exports.getProjectDocumentFolderPath = getProjectDocumentFolderPath;
exports.createProjectDocumentFolder = createProjectDocumentFolder;
exports.renameProjectDocumentFolder = renameProjectDocumentFolder;
exports.deleteProjectDocumentFolder = deleteProjectDocumentFolder;
exports.assertFolderBelongsToJob = assertFolderBelongsToJob;
const prisma_1 = require("../lib/prisma");
function isOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
function normalizeFolderName(name) {
    return name.trim().replace(/\s+/g, ' ');
}
async function assertJobExists(jobId) {
    const job = await prisma_1.prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!job)
        throw { status: 404, message: 'Project not found' };
}
async function getFolderInJob(jobId, folderId) {
    const folder = await prisma_1.prisma.projectDocumentFolder.findFirst({
        where: { id: folderId, jobId },
    });
    if (!folder)
        throw { status: 404, message: 'Folder not found' };
    return folder;
}
async function assertUniqueName(jobId, parentId, name, excludeId) {
    const existing = await prisma_1.prisma.projectDocumentFolder.findFirst({
        where: {
            jobId,
            parentId,
            name: { equals: name, mode: 'insensitive' },
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
    });
    if (existing)
        throw { status: 409, message: 'A folder with this name already exists here' };
}
async function assertValidParent(jobId, parentId, folderId) {
    if (!parentId)
        return;
    const parent = await getFolderInJob(jobId, parentId);
    if (folderId && parent.id === folderId) {
        throw { status: 400, message: 'A folder cannot be its own parent' };
    }
    if (folderId) {
        let cursor = parentId;
        while (cursor) {
            if (cursor === folderId) {
                throw { status: 400, message: 'Cannot move a folder into one of its subfolders' };
            }
            const node = await prisma_1.prisma.projectDocumentFolder.findUnique({
                where: { id: cursor },
                select: { parentId: true },
            });
            cursor = node?.parentId ?? null;
        }
    }
}
function mapFolder(f) {
    return {
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        createdAt: f.createdAt.toISOString(),
        createdBy: `${f.createdBy.firstName} ${f.createdBy.lastName}`.trim(),
        documentCount: f._count?.documents ?? 0,
        subfolderCount: f._count?.children ?? 0,
    };
}
async function listProjectDocumentFolders(jobId, parentId) {
    await assertJobExists(jobId);
    if (parentId)
        await getFolderInJob(jobId, parentId);
    const folders = await prisma_1.prisma.projectDocumentFolder.findMany({
        where: { jobId, parentId },
        include: {
            createdBy: { select: { firstName: true, lastName: true } },
            _count: { select: { documents: true, children: true } },
        },
        orderBy: { name: 'asc' },
    });
    return folders.map(mapFolder);
}
async function getProjectDocumentFolderPath(jobId, folderId) {
    await assertJobExists(jobId);
    const folder = await getFolderInJob(jobId, folderId);
    const path = [];
    let cursor = folder;
    while (cursor) {
        path.unshift({ id: cursor.id, name: cursor.name });
        if (!cursor.parentId)
            break;
        const parent = await prisma_1.prisma.projectDocumentFolder.findFirst({
            where: { id: cursor.parentId, jobId },
            select: { id: true, name: true, parentId: true },
        });
        if (!parent)
            break;
        cursor = parent;
    }
    return path;
}
async function createProjectDocumentFolder(userId, userRole, jobId, data) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Only Owner or HR can create folders' };
    const name = normalizeFolderName(data.name);
    if (!name)
        throw { status: 400, message: 'Folder name is required' };
    if (name.length > 120)
        throw { status: 400, message: 'Folder name is too long' };
    await assertJobExists(jobId);
    const parentId = data.parentId ?? null;
    await assertValidParent(jobId, parentId);
    await assertUniqueName(jobId, parentId, name);
    const folder = await prisma_1.prisma.projectDocumentFolder.create({
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
    });
    return mapFolder(folder);
}
async function renameProjectDocumentFolder(userId, userRole, jobId, folderId, name) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Only Owner or HR can rename folders' };
    const trimmed = normalizeFolderName(name);
    if (!trimmed)
        throw { status: 400, message: 'Folder name is required' };
    if (trimmed.length > 120)
        throw { status: 400, message: 'Folder name is too long' };
    const folder = await getFolderInJob(jobId, folderId);
    await assertUniqueName(jobId, folder.parentId, trimmed, folderId);
    const updated = await prisma_1.prisma.projectDocumentFolder.update({
        where: { id: folderId },
        data: { name: trimmed },
        include: {
            createdBy: { select: { firstName: true, lastName: true } },
            _count: { select: { documents: true, children: true } },
        },
    });
    return mapFolder(updated);
}
async function deleteProjectDocumentFolder(userId, userRole, jobId, folderId) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Only Owner or HR can delete folders' };
    await getFolderInJob(jobId, folderId);
    const [docCount, childCount] = await Promise.all([
        prisma_1.prisma.libraryDocument.count({ where: { folderId } }),
        prisma_1.prisma.projectDocumentFolder.count({ where: { parentId: folderId } }),
    ]);
    if (docCount > 0 || childCount > 0) {
        throw { status: 409, message: 'Folder must be empty before it can be deleted' };
    }
    await prisma_1.prisma.projectDocumentFolder.delete({ where: { id: folderId } });
    return { ok: true };
}
async function assertFolderBelongsToJob(jobId, folderId) {
    if (!folderId)
        return null;
    return getFolderInJob(jobId, folderId);
}
