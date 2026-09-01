import { prisma } from '../lib/prisma'
import { z } from 'zod'
import { documentQuerySchema } from '../schemas/documentSchemas'
import { uploadBlob, deleteBlob } from './blobStorageService'

export const uploadDocumentRecord = async (
    userId: string,
    file: Express.Multer.File,
    docType: string
) => {
    // Upload to Azure Blob Storage (deletes local file on success or failure)
    const blobName = await uploadBlob(file.path, 'documents')

    const doc = await prisma.document.create({
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
    })

    return doc
}

export const listUserDocuments = async (userId: string, queryParams: z.infer<typeof documentQuerySchema>) => {
    const { docType, status, limit, offset } = queryParams

    const whereClause: any = { uploadedById: userId }
    if (docType) whereClause.docType = docType
    if (status) whereClause.status = status

    const safeLimit = Math.min(limit, 100)

    const [documents, total] = await Promise.all([
        prisma.document.findMany({
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
        prisma.document.count({ where: whereClause })
    ])

    return { documents, total, limit: safeLimit, offset }
}

export const getDocumentById = async (userId: string, docId: string) => {
    const doc = await prisma.document.findUnique({
        where: { id: docId }
    })

    if (!doc) throw { status: 404, message: 'Document not found' }
    if (doc.uploadedById !== userId) throw { status: 403, message: 'Forbidden' }

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
    }
}

export const deleteDocumentById = async (userId: string, docId: string) => {
    const doc = await prisma.document.findUnique({
        where: { id: docId }
    })

    if (!doc) throw { status: 404, message: 'Document not found' }
    if (doc.uploadedById !== userId) throw { status: 403, message: 'Forbidden' }

    // Delete blob from Azure Storage
    if (doc.filePath) {
        await deleteBlob(doc.filePath)
    }

    await prisma.document.delete({ where: { id: docId } })
}
