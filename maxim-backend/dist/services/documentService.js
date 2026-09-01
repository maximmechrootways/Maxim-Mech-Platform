"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDocumentById = exports.getDocumentById = exports.listUserDocuments = exports.uploadDocumentRecord = void 0;
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const uploadDocumentRecord = async (userId, file, docType) => {
    // Upload to Azure Blob Storage (deletes local file on success or failure)
    const blobName = await (0, blobStorageService_1.uploadBlob)(file.path, 'documents');
    const doc = await prisma_1.prisma.document.create({
        data: {
            originalName: file.originalname,
            filename: file.filename,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            filePath: blobName,
            docType: docType,
            uploadedById: userId,
            status: 'uploaded'
        },
        select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            docType: true,
            uploadedAt: true,
            status: true
        }
    });
    return doc;
};
exports.uploadDocumentRecord = uploadDocumentRecord;
const listUserDocuments = async (userId, queryParams) => {
    const { docType, status, limit, offset } = queryParams;
    const whereClause = { uploadedById: userId };
    if (docType)
        whereClause.docType = docType;
    if (status)
        whereClause.status = status;
    const safeLimit = Math.min(limit, 100);
    const [documents, total] = await Promise.all([
        prisma_1.prisma.document.findMany({
            where: whereClause,
            take: safeLimit,
            skip: offset,
            orderBy: { uploadedAt: 'desc' },
            select: {
                id: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                docType: true,
                uploadedAt: true,
                status: true
            }
        }),
        prisma_1.prisma.document.count({ where: whereClause })
    ]);
    return { documents, total, limit: safeLimit, offset };
};
exports.listUserDocuments = listUserDocuments;
const getDocumentById = async (userId, docId) => {
    const doc = await prisma_1.prisma.document.findUnique({
        where: { id: docId }
    });
    if (!doc)
        throw { status: 404, message: 'Document not found' };
    if (doc.uploadedById !== userId)
        throw { status: 403, message: 'Forbidden' };
    return {
        id: doc.id,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        docType: doc.docType,
        filePath: doc.filePath,
        uploadedAt: doc.uploadedAt,
        status: doc.status,
        extractedText: doc.extractedText
    };
};
exports.getDocumentById = getDocumentById;
const deleteDocumentById = async (userId, docId) => {
    const doc = await prisma_1.prisma.document.findUnique({
        where: { id: docId }
    });
    if (!doc)
        throw { status: 404, message: 'Document not found' };
    if (doc.uploadedById !== userId)
        throw { status: 403, message: 'Forbidden' };
    // Delete blob from Azure Storage
    if (doc.filePath) {
        await (0, blobStorageService_1.deleteBlob)(doc.filePath);
    }
    await prisma_1.prisma.document.delete({ where: { id: docId } });
};
exports.deleteDocumentById = deleteDocumentById;
