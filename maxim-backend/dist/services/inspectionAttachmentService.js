"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAttachments = listAttachments;
exports.listAllAttachments = listAllAttachments;
exports.upload = upload;
exports.getFileUrl = getFileUrl;
exports.remove = remove;
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const ROLES_ALLOWED = ['owner', 'hr', 'supervisor'];
function ensureRole(role) {
    if (!ROLES_ALLOWED.includes(role))
        throw { status: 403, message: 'Only Owner, HR, or Supervisor can manage inspection files' };
}
async function listAttachments(requestRole, scheduleId) {
    ensureRole(requestRole);
    const where = {};
    if (scheduleId !== undefined && scheduleId !== null && scheduleId !== '') {
        where.scheduleId = scheduleId;
    }
    else {
        where.scheduleId = null;
    }
    const list = await prisma_1.prisma.inspectionAttachment.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        select: {
            id: true,
            scheduleId: true,
            originalName: true,
            notes: true,
            uploadedAt: true,
        },
    });
    return list.map((a) => ({
        id: a.id,
        scheduleId: a.scheduleId ?? undefined,
        name: a.originalName,
        notes: a.notes ?? undefined,
        uploadedAt: a.uploadedAt.toISOString().slice(0, 10),
    }));
}
async function listAllAttachments(requestRole) {
    ensureRole(requestRole);
    const list = await prisma_1.prisma.inspectionAttachment.findMany({
        orderBy: { uploadedAt: 'desc' },
        select: {
            id: true,
            scheduleId: true,
            originalName: true,
            notes: true,
            uploadedAt: true,
        },
    });
    return list.map((a) => ({
        id: a.id,
        scheduleId: a.scheduleId ?? undefined,
        name: a.originalName,
        notes: a.notes ?? undefined,
        uploadedAt: a.uploadedAt.toISOString().slice(0, 10),
    }));
}
async function upload(uploaderId, requestRole, file, body) {
    ensureRole(requestRole);
    const scheduleId = body.scheduleId?.trim() || null;
    const notes = body.notes?.trim() || null;
    const blobName = await (0, blobStorageService_1.uploadBlob)(file.path, 'inspection_attachments');
    const doc = await prisma_1.prisma.inspectionAttachment.create({
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
    });
    return {
        id: doc.id,
        scheduleId: doc.scheduleId ?? undefined,
        name: doc.originalName,
        notes: doc.notes ?? undefined,
        uploadedAt: doc.uploadedAt.toISOString().slice(0, 10),
    };
}
async function getFileUrl(attachmentId, requestRole) {
    ensureRole(requestRole);
    const a = await prisma_1.prisma.inspectionAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, filePath: true },
    });
    if (!a)
        throw { status: 404, message: 'Attachment not found' };
    const url = await (0, blobStorageService_1.getBlobSasUrl)(a.filePath, 30);
    return { url, expiresInMinutes: 30 };
}
async function remove(attachmentId, requestRole) {
    ensureRole(requestRole);
    const a = await prisma_1.prisma.inspectionAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, filePath: true },
    });
    if (!a)
        throw { status: 404, message: 'Attachment not found' };
    await (0, blobStorageService_1.deleteBlob)(a.filePath);
    await prisma_1.prisma.inspectionAttachment.delete({ where: { id: attachmentId } });
    return { deleted: true };
}
