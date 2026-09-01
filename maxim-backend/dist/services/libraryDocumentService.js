"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLibraryDocuments = listLibraryDocuments;
exports.getLibraryDocumentById = getLibraryDocumentById;
exports.getLibraryDocumentFile = getLibraryDocumentFile;
exports.createLibraryDocument = createLibraryDocument;
exports.updateLibraryDocument = updateLibraryDocument;
exports.replaceLibraryDocumentFile = replaceLibraryDocumentFile;
exports.listByJobId = listByJobId;
exports.deleteLibraryDocument = deleteLibraryDocument;
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const projectDocumentFolderService_1 = require("./projectDocumentFolderService");
const fs_1 = __importDefault(require("fs"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
function isOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
async function listLibraryDocuments(userId, userRole) {
    const all = await prisma_1.prisma.libraryDocument.findMany({
        include: { site: true, uploadedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
    });
    const visible = all.filter((d) => canView(d, userId, userRole));
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
        visibleToRoles: d.visibleToRoles || [],
        visibleToUserIds: d.visibleToUserIds || [],
        filePath: d.filePath,
        tags: d.tags || [],
        version: d.version,
        acknowledgedBy: d.acknowledgedBy || [],
        lastOpenedAt: d.lastOpenedAt?.toISOString(),
        lastOpenedBy: d.lastOpenedBy,
        lastEditedAt: d.lastEditedAt?.toISOString(),
        lastEditedBy: d.lastEditedBy,
    }));
}
function canView(d, userId, userRole) {
    if (d.visibility === 'everyone')
        return true;
    const roles = d.visibleToRoles || [];
    const userIds = d.visibleToUserIds || [];
    if (isOwnerOrHr(userRole))
        return true;
    if (roles.includes(userRole))
        return true;
    if (userIds.includes(userId))
        return true;
    return false;
}
async function getLibraryDocumentById(id, userId, userRole) {
    const d = await prisma_1.prisma.libraryDocument.findUnique({
        where: { id },
        include: { site: true, uploadedBy: { select: { firstName: true, lastName: true } } },
    });
    if (!d)
        throw { status: 404, message: 'Document not found' };
    if (!canView(d, userId, userRole))
        throw { status: 403, message: 'Forbidden' };
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
        visibleToRoles: d.visibleToRoles || [],
        visibleToUserIds: d.visibleToUserIds || [],
        filePath: d.filePath,
        tags: d.tags || [],
        version: d.version,
        extractedText: d.extractedText ?? undefined,
        acknowledgedBy: d.acknowledgedBy || [],
        lastOpenedAt: d.lastOpenedAt?.toISOString(),
        lastOpenedBy: d.lastOpenedBy,
        lastEditedAt: d.lastEditedAt?.toISOString(),
        lastEditedBy: d.lastEditedBy,
    };
}
async function getLibraryDocumentFile(id, userId, userRole) {
    const doc = await getLibraryDocumentById(id, userId, userRole);
    // Return a SAS URL for the blob
    const sasUrl = await (0, blobStorageService_1.getBlobSasUrl)(doc.filePath, 30);
    return sasUrl;
}
async function createLibraryDocument(userId, userRole, file, data) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Only Owner or HR can upload library documents' };
    if (data.folderId && data.jobId) {
        await (0, projectDocumentFolderService_1.assertFolderBelongsToJob)(data.jobId, data.folderId);
    }
    else if (data.folderId && !data.jobId) {
        throw { status: 400, message: 'jobId is required when folderId is set' };
    }
    // Extract PDF text BEFORE uploading (uploadBlob deletes the local file)
    let extractedText = null;
    if (file.mimetype === 'application/pdf') {
        try {
            const fileBuffer = fs_1.default.readFileSync(file.path);
            const pdfData = await pdfParse(fileBuffer);
            extractedText = pdfData.text?.trim() || null;
            console.log(`Extracted ${extractedText?.length ?? 0} chars from ${file.originalname}`);
        }
        catch (e) {
            console.warn('PDF text extraction failed for', file.originalname, e);
        }
    }
    // Upload to Azure Blob Storage (deletes local file)
    const blobName = await (0, blobStorageService_1.uploadBlob)(file.path, 'documents');
    const date = data.date || new Date().toISOString().slice(0, 10);
    const doc = await prisma_1.prisma.libraryDocument.create({
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
            visibleToRoles: (data.visibleToRoles || []),
            visibleToUserIds: (data.visibleToUserIds || []),
            extractedText,
        },
    });
    return { id: doc.id, name: doc.name, type: doc.type, date: doc.date, filePath: doc.filePath };
}
async function updateLibraryDocument(id, userId, userRole, data) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Forbidden' };
    const doc = await prisma_1.prisma.libraryDocument.findUnique({ where: { id } });
    if (!doc)
        throw { status: 404, message: 'Document not found' };
    const updateData = {};
    if (data.visibility !== undefined)
        updateData.visibility = data.visibility;
    if (data.visibleToRoles !== undefined)
        updateData.visibleToRoles = data.visibleToRoles;
    if (data.visibleToUserIds !== undefined)
        updateData.visibleToUserIds = data.visibleToUserIds;
    if (data.lastOpenedAt !== undefined)
        updateData.lastOpenedAt = new Date(data.lastOpenedAt);
    if (data.lastOpenedBy !== undefined)
        updateData.lastOpenedBy = data.lastOpenedBy;
    if (data.name !== undefined) {
        const trimmed = data.name.trim();
        if (!trimmed)
            throw { status: 400, message: 'Document name is required' };
        updateData.name = trimmed;
    }
    if (data.folderId !== undefined) {
        if (data.folderId && doc.jobId) {
            await (0, projectDocumentFolderService_1.assertFolderBelongsToJob)(doc.jobId, data.folderId);
        }
        else if (data.folderId && !doc.jobId) {
            throw { status: 400, message: 'Cannot assign folder to a document not linked to a project' };
        }
        updateData.folderId = data.folderId || null;
    }
    await prisma_1.prisma.libraryDocument.update({ where: { id }, data: updateData });
    return await getLibraryDocumentById(id, userId, userRole);
}
async function replaceLibraryDocumentFile(id, userId, userRole, file) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Only Owner or HR can overwrite library documents' };
    const doc = await prisma_1.prisma.libraryDocument.findUnique({ where: { id } });
    if (!doc)
        throw { status: 404, message: 'Document not found' };
    // Extract text from new file before upload (uploadBlob deletes local file)
    let extractedText = null;
    if (file.mimetype === 'application/pdf') {
        try {
            const fileBuffer = fs_1.default.readFileSync(file.path);
            const pdfData = await pdfParse(fileBuffer);
            extractedText = pdfData.text?.trim() || null;
        }
        catch (e) {
            console.warn('PDF text extraction failed during overwrite for', file.originalname, e);
        }
    }
    // Upload new file to blob storage
    const newBlobName = await (0, blobStorageService_1.uploadBlob)(file.path, 'documents');
    // Delete the old blob if the new one uploaded successfully
    if (doc.filePath) {
        await (0, blobStorageService_1.deleteBlob)(doc.filePath);
    }
    // Update the record with the new file, cleared extractedText, and edit metadata
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const editorName = user ? `${user.firstName} ${user.lastName}`.trim() : userId;
    await prisma_1.prisma.libraryDocument.update({
        where: { id },
        data: {
            filePath: newBlobName,
            extractedText,
            lastEditedAt: new Date(),
            lastEditedBy: editorName,
        },
    });
    return {
        id: doc.id,
        name: doc.name,
        filePath: newBlobName,
    };
}
async function listByJobId(jobId, userId, userRole, folderId) {
    const where = { jobId };
    if (folderId !== undefined) {
        where.folderId = folderId;
    }
    const docs = await prisma_1.prisma.libraryDocument.findMany({
        where,
        include: { site: true, uploadedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
    });
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
    }));
}
async function deleteLibraryDocument(id, _userId, userRole) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Only Owner or HR can delete library documents' };
    const doc = await prisma_1.prisma.libraryDocument.findUnique({ where: { id } });
    if (!doc)
        throw { status: 404, message: 'Document not found' };
    if (doc.filePath) {
        await (0, blobStorageService_1.deleteBlob)(doc.filePath);
    }
    await prisma_1.prisma.libraryDocument.delete({ where: { id } });
    return { ok: true };
}
