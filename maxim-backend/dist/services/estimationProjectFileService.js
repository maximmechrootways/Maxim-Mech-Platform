"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEstimationFolder = parseEstimationFolder;
exports.listFiles = listFiles;
exports.uploadFile = uploadFile;
exports.getFileMetaForUser = getFileMetaForUser;
exports.removeFile = removeFile;
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const ROLES = new Set(['owner', 'hr', 'supervisor']);
const FOLDER_SET = new Set(Object.values(client_1.EstimationPricingFolder));
function parseEstimationFolder(raw) {
    if (typeof raw !== 'string')
        return null;
    const normalized = raw.trim();
    if (!normalized || !FOLDER_SET.has(normalized))
        return null;
    return normalized;
}
function ensureRole(role) {
    if (!ROLES.has(role)) {
        throw { status: 403, message: 'Only owners, HR, and supervisors can access estimation files.' };
    }
}
async function listFiles(userRole, folder, siteId) {
    ensureRole(userRole);
    const where = {};
    if (folder)
        where.folder = folder;
    if (siteId)
        where.siteId = siteId;
    return prisma_1.prisma.estimationProjectFile.findMany({
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
    });
}
async function uploadFile(userId, userRole, file, body) {
    ensureRole(userRole);
    const folder = parseEstimationFolder(body.folder);
    if (!folder) {
        throw { status: 400, message: 'Invalid folder. Use a valid estimation category.' };
    }
    const name = (body.name && String(body.name).trim()) || file.originalname || 'Untitled';
    let siteId = null;
    if (body.siteId && String(body.siteId).trim() && String(body.siteId).trim() !== 'none') {
        const site = await prisma_1.prisma.site.findUnique({ where: { id: String(body.siteId).trim() } });
        if (!site)
            throw { status: 400, message: 'Job site not found.' };
        siteId = site.id;
    }
    const blobName = await (0, blobStorageService_1.uploadBlob)(file.path, 'estimation_pricing');
    const rawNotes = body.notes != null ? String(body.notes).trim() : '';
    const notes = rawNotes ? rawNotes.slice(0, 8000) : null;
    const row = await prisma_1.prisma.estimationProjectFile.create({
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
    });
    return row;
}
async function getFileMetaForUser(id, userRole) {
    ensureRole(userRole);
    const doc = await prisma_1.prisma.estimationProjectFile.findUnique({
        where: { id },
        select: { id: true, filePath: true, mimeType: true, originalName: true },
    });
    if (!doc)
        throw { status: 404, message: 'File not found' };
    return doc;
}
async function removeFile(id, userRole) {
    ensureRole(userRole);
    if (userRole !== 'owner' && userRole !== 'hr') {
        throw { status: 403, message: 'Only owners and HR can delete estimation files.' };
    }
    const doc = await prisma_1.prisma.estimationProjectFile.findUnique({ where: { id }, select: { id: true, filePath: true } });
    if (!doc)
        throw { status: 404, message: 'File not found' };
    const { deleteBlob } = await Promise.resolve().then(() => __importStar(require('./blobStorageService')));
    try {
        await deleteBlob(doc.filePath);
    }
    catch {
        /* still remove DB row */
    }
    await prisma_1.prisma.estimationProjectFile.delete({ where: { id } });
}
