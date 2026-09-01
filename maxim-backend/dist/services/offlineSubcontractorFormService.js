"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCanAccessOfflineSubcontractorForms = assertCanAccessOfflineSubcontractorForms;
exports.listOfflineSubcontractorForms = listOfflineSubcontractorForms;
exports.createOfflineSubcontractorForm = createOfflineSubcontractorForm;
exports.deleteOfflineSubcontractorForm = deleteOfflineSubcontractorForm;
const crypto_1 = require("crypto");
const prisma_1 = require("../lib/prisma");
const ALLOWED_ROLES = new Set(['owner', 'hr', 'supervisor']);
function assertCanAccessOfflineSubcontractorForms(role) {
    if (!ALLOWED_ROLES.has(role)) {
        throw { status: 403, message: 'Forbidden' };
    }
}
function mapRecord(f) {
    const uploadedByName = [f.firstName ?? '', f.lastName ?? ''].filter(Boolean).join(' ').trim()
        || f.email
        || 'Unknown user';
    const createdAt = new Date(f.createdAt);
    return {
        id: f.id,
        title: f.title,
        filePath: f.filePath ?? '',
        originalName: f.originalName ?? '',
        mimeType: f.mimeType ?? undefined,
        sizeBytes: f.sizeBytes ?? undefined,
        uploadedById: f.uploadedById ?? '',
        uploadedByName,
        createdAt: createdAt.toISOString(),
    };
}
async function listOfflineSubcontractorForms() {
    const rows = await prisma_1.prisma.$queryRaw `
        SELECT
            f."id",
            f."title",
            f."filePath",
            f."originalName",
            f."mimeType",
            f."sizeBytes",
            f."uploadedById",
            f."createdAt",
            u."firstName",
            u."lastName",
            u."email"
        FROM "OfflineSubcontractorForm" f
        INNER JOIN "User" u ON u."id" = f."uploadedById"
        ORDER BY f."createdAt" DESC
    `;
    return rows.map(mapRecord);
}
async function createOfflineSubcontractorForm(userId, data) {
    const id = (0, crypto_1.randomUUID)();
    await prisma_1.prisma.$executeRaw `
        INSERT INTO "OfflineSubcontractorForm"
            ("id", "title", "filePath", "originalName", "mimeType", "sizeBytes", "uploadedById", "createdAt")
        VALUES
            (${id}, ${data.title}, ${data.filePath}, ${data.originalName}, ${data.mimeType}, ${data.sizeBytes}, ${userId}, NOW())
    `;
    const rows = await prisma_1.prisma.$queryRaw `
        SELECT
            f."id",
            f."title",
            f."filePath",
            f."originalName",
            f."mimeType",
            f."sizeBytes",
            f."uploadedById",
            f."createdAt",
            u."firstName",
            u."lastName",
            u."email"
        FROM "OfflineSubcontractorForm" f
        INNER JOIN "User" u ON u."id" = f."uploadedById"
        WHERE f."id" = ${id}
        LIMIT 1
    `;
    if (rows.length === 0)
        throw { status: 500, message: 'Failed to create form upload record' };
    return mapRecord(rows[0]);
}
async function deleteOfflineSubcontractorForm(id) {
    const rows = await prisma_1.prisma.$queryRaw `
        SELECT "id", "filePath"
        FROM "OfflineSubcontractorForm"
        WHERE "id" = ${id}
        LIMIT 1
    `;
    if (rows.length === 0)
        throw { status: 404, message: 'Not found' };
    await prisma_1.prisma.$executeRaw `
        DELETE FROM "OfflineSubcontractorForm"
        WHERE "id" = ${id}
    `;
    return rows[0];
}
