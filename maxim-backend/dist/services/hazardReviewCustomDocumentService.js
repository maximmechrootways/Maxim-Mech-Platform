"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertTemplateKeyAllowedForComments = assertTemplateKeyAllowedForComments;
exports.listCustomDocumentMeta = listCustomDocumentMeta;
exports.createCustomDocument = createCustomDocument;
exports.updateCustomDocumentLabel = updateCustomDocumentLabel;
exports.replaceCustomDocumentFile = replaceCustomDocumentFile;
exports.deleteCustomDocument = deleteCustomDocument;
exports.getCustomDocumentViewUrl = getCustomDocumentViewUrl;
exports.listCustomTemplateKeys = listCustomTemplateKeys;
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const hazardRiskAssessmentTemplateFields_1 = require("../seed/hazardRiskAssessmentTemplateFields");
function canManageCustomHazardDocs(role) {
    return role === 'hr' || role === 'owner';
}
/** Static seed keys or an existing custom document id. */
async function assertTemplateKeyAllowedForComments(templateKey) {
    if (hazardRiskAssessmentTemplateFields_1.HAZARD_RISK_TEMPLATE_KEYS.includes(templateKey))
        return;
    const custom = await prisma_1.prisma.hazardReviewCustomDocument.findUnique({
        where: { id: templateKey },
        select: { id: true },
    });
    if (!custom)
        throw { status: 400, message: 'Invalid templateKey' };
}
async function listCustomDocumentMeta() {
    const rows = await prisma_1.prisma.hazardReviewCustomDocument.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            shortLabel: true,
            createdAt: true,
            updatedAt: true,
        },
    });
    return rows.map((r) => ({
        id: r.id,
        templateKey: r.id,
        shortLabel: r.shortLabel,
        title: `Hazard Risk Assessment — ${r.shortLabel}`,
        description: `Completed hazard risk assessment for ${r.shortLabel} roles.`,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
    }));
}
async function createCustomDocument(userId, userRole, file, shortLabelRaw) {
    if (!canManageCustomHazardDocs(userRole))
        throw { status: 403, message: 'Only HR or Owner can add hazard documents' };
    const shortLabel = String(shortLabelRaw ?? '').trim();
    if (!shortLabel || shortLabel.length > 120)
        throw { status: 400, message: 'Name is required (max 120 characters)' };
    const filePath = await (0, blobStorageService_1.uploadBlob)(file.path, 'documents');
    const doc = await prisma_1.prisma.hazardReviewCustomDocument.create({
        data: {
            shortLabel,
            filePath,
            uploadedById: userId,
        },
        select: { id: true, shortLabel: true, createdAt: true, updatedAt: true },
    });
    return {
        id: doc.id,
        templateKey: doc.id,
        shortLabel: doc.shortLabel,
        title: `Hazard Risk Assessment — ${doc.shortLabel}`,
        description: `Completed hazard risk assessment for ${doc.shortLabel} roles.`,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}
async function updateCustomDocumentLabel(id, userId, userRole, shortLabelRaw) {
    if (!canManageCustomHazardDocs(userRole))
        throw { status: 403, message: 'Forbidden' };
    const shortLabel = String(shortLabelRaw ?? '').trim();
    if (!shortLabel || shortLabel.length > 120)
        throw { status: 400, message: 'Name is required (max 120 characters)' };
    const existing = await prisma_1.prisma.hazardReviewCustomDocument.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Not found' };
    const doc = await prisma_1.prisma.hazardReviewCustomDocument.update({
        where: { id },
        data: { shortLabel },
        select: { id: true, shortLabel: true, updatedAt: true },
    });
    return {
        id: doc.id,
        templateKey: doc.id,
        shortLabel: doc.shortLabel,
        title: `Hazard Risk Assessment — ${doc.shortLabel}`,
        description: `Completed hazard risk assessment for ${doc.shortLabel} roles.`,
        updatedAt: doc.updatedAt.toISOString(),
    };
}
async function replaceCustomDocumentFile(id, userId, userRole, file) {
    if (!canManageCustomHazardDocs(userRole))
        throw { status: 403, message: 'Forbidden' };
    const existing = await prisma_1.prisma.hazardReviewCustomDocument.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Not found' };
    const newPath = await (0, blobStorageService_1.uploadBlob)(file.path, 'documents');
    if (existing.filePath)
        await (0, blobStorageService_1.deleteBlob)(existing.filePath);
    await prisma_1.prisma.hazardReviewCustomDocument.update({
        where: { id },
        data: { filePath: newPath },
    });
    return { id, templateKey: id, filePath: newPath };
}
async function deleteCustomDocument(id, userRole) {
    if (!canManageCustomHazardDocs(userRole))
        throw { status: 403, message: 'Forbidden' };
    const existing = await prisma_1.prisma.hazardReviewCustomDocument.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Not found' };
    if (existing.filePath)
        await (0, blobStorageService_1.deleteBlob)(existing.filePath);
    await prisma_1.prisma.hazardReviewComment.deleteMany({ where: { templateKey: id } });
    await prisma_1.prisma.hazardReviewCustomDocument.delete({ where: { id } });
    return { ok: true };
}
async function getCustomDocumentViewUrl(_userRole, id) {
    const doc = await prisma_1.prisma.hazardReviewCustomDocument.findUnique({
        where: { id },
        select: { filePath: true },
    });
    if (!doc)
        throw { status: 404, message: 'Not found' };
    const url = await (0, blobStorageService_1.getBlobSasUrl)(doc.filePath, 120);
    return { url };
}
async function listCustomTemplateKeys() {
    const rows = await prisma_1.prisma.hazardReviewCustomDocument.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
}
