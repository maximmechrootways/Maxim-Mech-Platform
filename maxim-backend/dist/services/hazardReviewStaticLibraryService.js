"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStaticHiddenKeys = listStaticHiddenKeys;
exports.listStaticOverrideKeys = listStaticOverrideKeys;
exports.isStaticTemplateHidden = isStaticTemplateHidden;
exports.getStaticOverrideViewUrl = getStaticOverrideViewUrl;
exports.upsertStaticOverridePdf = upsertStaticOverridePdf;
exports.hideStaticTemplate = hideStaticTemplate;
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const hazardRiskAssessmentTemplateFields_1 = require("../seed/hazardRiskAssessmentTemplateFields");
function canManage(role) {
    return role === 'hr' || role === 'owner';
}
function assertBuiltInKey(templateKey) {
    if (!hazardRiskAssessmentTemplateFields_1.HAZARD_RISK_TEMPLATE_KEYS.includes(templateKey)) {
        throw { status: 400, message: 'Invalid built-in template key' };
    }
}
async function listStaticHiddenKeys() {
    const rows = await prisma_1.prisma.hazardReviewStaticTemplateHidden.findMany({ select: { templateKey: true } });
    return rows.map((r) => r.templateKey);
}
async function listStaticOverrideKeys() {
    const rows = await prisma_1.prisma.hazardReviewStaticPdfOverride.findMany({ select: { templateKey: true } });
    return rows.map((r) => r.templateKey);
}
async function isStaticTemplateHidden(templateKey) {
    const row = await prisma_1.prisma.hazardReviewStaticTemplateHidden.findUnique({
        where: { templateKey },
        select: { templateKey: true },
    });
    return !!row;
}
async function getStaticOverrideViewUrl(templateKey) {
    assertBuiltInKey(templateKey);
    const row = await prisma_1.prisma.hazardReviewStaticPdfOverride.findUnique({
        where: { templateKey },
        select: { filePath: true },
    });
    if (!row)
        throw { status: 404, message: 'No override PDF for this template' };
    const url = await (0, blobStorageService_1.getBlobSasUrl)(row.filePath, 120);
    return { url };
}
async function upsertStaticOverridePdf(templateKey, userRole, file) {
    if (!canManage(userRole))
        throw { status: 403, message: 'Forbidden' };
    assertBuiltInKey(templateKey);
    const newPath = await (0, blobStorageService_1.uploadBlob)(file.path, 'documents');
    const existing = await prisma_1.prisma.hazardReviewStaticPdfOverride.findUnique({
        where: { templateKey },
        select: { filePath: true },
    });
    if (existing?.filePath)
        await (0, blobStorageService_1.deleteBlob)(existing.filePath);
    await prisma_1.prisma.hazardReviewStaticPdfOverride.upsert({
        where: { templateKey },
        create: { templateKey, filePath: newPath },
        update: { filePath: newPath },
    });
    return { templateKey, ok: true };
}
/** Remove built-in card from library and delete any replacement PDF. */
async function hideStaticTemplate(templateKey, userRole) {
    if (!canManage(userRole))
        throw { status: 403, message: 'Forbidden' };
    assertBuiltInKey(templateKey);
    const override = await prisma_1.prisma.hazardReviewStaticPdfOverride.findUnique({
        where: { templateKey },
        select: { filePath: true },
    });
    if (override?.filePath)
        await (0, blobStorageService_1.deleteBlob)(override.filePath);
    await prisma_1.prisma.hazardReviewStaticPdfOverride.deleteMany({ where: { templateKey } });
    await prisma_1.prisma.hazardReviewStaticTemplateHidden.upsert({
        where: { templateKey },
        create: { templateKey },
        update: {},
    });
    return { ok: true };
}
