"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadScannedPdf = uploadScannedPdf;
exports.listScannedPdfs = listScannedPdfs;
exports.getScannedPdfById = getScannedPdfById;
exports.getScannedPdfFile = getScannedPdfFile;
exports.createSignableTemplate = createSignableTemplate;
exports.listSignableTemplates = listSignableTemplates;
exports.getSignableTemplateById = getSignableTemplateById;
exports.updateSignableTemplate = updateSignableTemplate;
const prisma_1 = require("../lib/prisma");
const fs_1 = __importDefault(require("fs"));
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
function isOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
async function uploadScannedPdf(userId, userRole, file, name) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Only Owner or HR can upload PDF templates' };
    const fileName = name || file.originalname || `upload-${Date.now()}.pdf`;
    const record = await prisma_1.prisma.scannedPdf.create({
        data: {
            name: fileName,
            filePath: file.path,
            uploadedById: userId,
        },
        include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    });
    return {
        id: record.id,
        name: record.name,
        uploadedAt: record.uploadedAt.toISOString(),
        uploadedBy: `${record.uploadedBy.firstName} ${record.uploadedBy.lastName}`,
    };
}
async function listScannedPdfs(userId, userRole) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Forbidden' };
    const list = await prisma_1.prisma.scannedPdf.findMany({
        orderBy: { uploadedAt: 'desc' },
        include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    });
    return list.map((p) => ({
        id: p.id,
        name: p.name,
        uploadedAt: p.uploadedAt.toISOString(),
        uploadedBy: `${p.uploadedBy.firstName} ${p.uploadedBy.lastName}`,
    }));
}
async function getScannedPdfById(id, userId, userRole) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Forbidden' };
    const pdf = await prisma_1.prisma.scannedPdf.findUnique({
        where: { id },
        include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    });
    if (!pdf)
        throw { status: 404, message: 'PDF not found' };
    return {
        id: pdf.id,
        name: pdf.name,
        filePath: pdf.filePath,
        uploadedAt: pdf.uploadedAt.toISOString(),
        uploadedBy: `${pdf.uploadedBy.firstName} ${pdf.uploadedBy.lastName}`,
    };
}
async function getScannedPdfFile(id, userId, userRole) {
    const pdf = await getScannedPdfById(id, userId, userRole);
    if (!fs_1.default.existsSync(pdf.filePath))
        throw { status: 404, message: 'File not found' };
    return pdf.filePath;
}
async function createSignableTemplate(userId, userRole, data) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Only Owner or HR can create templates' };
    const template = await prisma_1.prisma.signableFormTemplate.create({
        data: {
            name: data.name.trim(),
            description: data.description?.trim() ?? '',
            sourcePdfId: data.sourcePdfId || null,
            schedule: data.schedule || 'daily',
            assignedToRoles: (data.assignedToRoles || []),
            assignedToUserIds: (data.assignedToUserIds || []),
            placedFields: (data.placedFields || []),
            createdById: userId,
        },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    return toSignableTemplateResponse(template);
}
async function listSignableTemplates(userId, userRole) {
    const raw = await prisma_1.prisma.signableFormTemplate.findMany({
        where: { active: true },
        include: { createdBy: { select: { firstName: true, lastName: true } }, sourcePdf: true },
    });
    const assignedToMe = raw.filter((t) => {
        const roles = t.assignedToRoles || [];
        const userIds = t.assignedToUserIds || [];
        if (roles.includes(userRole))
            return true;
        if (userIds.includes(userId))
            return true;
        if (isOwnerOrHr(userRole))
            return true;
        return false;
    });
    return assignedToMe.map((t) => toSignableTemplateResponse(t));
}
function toSignableTemplateResponse(t) {
    return {
        id: t.id,
        name: t.name,
        description: t.description,
        sourcePdfId: t.sourcePdfId,
        schedule: t.schedule,
        assignedToRoles: t.assignedToRoles || [],
        assignedToUserIds: t.assignedToUserIds || [],
        placedFields: t.placedFields || [],
        createdAt: t.createdAt.toISOString(),
        createdBy: t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : '',
        active: t.active,
    };
}
async function getSignableTemplateById(id, userId, userRole) {
    const template = await prisma_1.prisma.signableFormTemplate.findUnique({
        where: { id },
        include: { createdBy: true, sourcePdf: true },
    });
    if (!template)
        throw { status: 404, message: 'Template not found' };
    const roles = template.assignedToRoles || [];
    const userIds = template.assignedToUserIds || [];
    const canAccess = isOwnerOrHr(userRole) || roles.includes(userRole) || userIds.includes(userId);
    if (!canAccess)
        throw { status: 403, message: 'Forbidden' };
    return {
        ...toSignableTemplateResponse(template),
        sourcePdf: template.sourcePdf ? { id: template.sourcePdf.id, name: template.sourcePdf.name, filePath: template.sourcePdf.filePath } : null,
    };
}
async function updateSignableTemplate(id, userId, userRole, data) {
    if (!isOwnerOrHr(userRole))
        throw { status: 403, message: 'Only Owner or HR can update templates' };
    const template = await prisma_1.prisma.signableFormTemplate.findUnique({ where: { id } });
    if (!template)
        throw { status: 404, message: 'Template not found' };
    const updateData = {};
    if (data.name !== undefined)
        updateData.name = data.name.trim();
    if (data.description !== undefined)
        updateData.description = data.description;
    if (data.schedule !== undefined)
        updateData.schedule = data.schedule;
    if (data.assignedToRoles !== undefined)
        updateData.assignedToRoles = data.assignedToRoles;
    if (data.assignedToUserIds !== undefined)
        updateData.assignedToUserIds = data.assignedToUserIds;
    if (data.placedFields !== undefined)
        updateData.placedFields = data.placedFields;
    if (data.active !== undefined)
        updateData.active = data.active;
    const updated = await prisma_1.prisma.signableFormTemplate.update({
        where: { id },
        data: updateData,
        include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    return toSignableTemplateResponse(updated);
}
