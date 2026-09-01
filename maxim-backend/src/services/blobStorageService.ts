import {
    BlobServiceClient,
    BlobSASPermissions
} from '@azure/storage-blob'
import fs from 'fs'
import path from 'path'

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'maxim-uploads'

if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set')
}

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
const containerClient = blobServiceClient.getContainerClient(containerName)

// Ensure container exists on startup
containerClient.createIfNotExists().catch((err: any) => {
    console.error('Failed to ensure blob container exists:', err.message)
})

export async function uploadBlob(
    localFilePath: string,
    folder: 'templates' | 'documents' | 'signatures' | 'employee_documents' | 'inspection_attachments' | 'equipment' | 'estimation_pricing' = 'templates'
): Promise<string> {
    const ext = path.extname(localFilePath) || '.pdf'
    const lowerExt = ext.toLowerCase()
    const byExt: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.csv': 'text/csv',
        '.txt': 'text/plain',
        '.zip': 'application/zip',
    }
    const detectedContentType = byExt[lowerExt] || 'application/octet-stream'
    const blobName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)

    try {
        await blockBlobClient.uploadFile(localFilePath, {
            blockSize: 4 * 1024 * 1024,
            concurrency: 4,
            blobHTTPHeaders: {
                blobContentType: detectedContentType,
            },
            metadata: {
                uploadedAt: new Date().toISOString(),
                folder
            }
        })
        return blobName
    } catch (err: any) {
        console.error(`Blob upload failed (attempt 1):`, err.message)
        // One retry for transient Azure/network blips (common on larger SDS PDFs)
        try {
            await blockBlobClient.uploadFile(localFilePath, {
                blockSize: 4 * 1024 * 1024,
                concurrency: 2,
                blobHTTPHeaders: {
                    blobContentType: detectedContentType,
                },
                metadata: {
                    uploadedAt: new Date().toISOString(),
                    folder,
                    retried: 'true',
                }
            })
            return blobName
        } catch (err2: any) {
            console.error(`Blob upload failed (attempt 2):`, err2.message)
            throw {
                status: 503,
                expose: true,
                message: 'File storage failed. Please try again in a moment.',
            }
        }
    } finally {
        // Always clean up local temp file whether upload succeeded or failed
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath)
        }
    }
}

export async function getBlobSasUrl(
    blobName: string,
    expiryMinutes = 30
): Promise<string> {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)
    const expiresOn = new Date()
    expiresOn.setMinutes(expiresOn.getMinutes() + expiryMinutes)

    try {
        return await blockBlobClient.generateSasUrl({
            permissions: BlobSASPermissions.parse('r'),
            expiresOn,
        })
    } catch (err: any) {
        console.error(`Failed to generate SAS URL:`, err.message)
        throw {
            status: 503,
            expose: true,
            message: 'Could not generate file access URL. Please try again.',
        }
    }
}

export async function deleteBlob(blobName: string): Promise<void> {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(blobName)
        await blockBlobClient.deleteIfExists({ deleteSnapshots: 'include' })
    } catch (err: any) {
        // Log but don't throw — failed blob delete shouldn't block DB delete
        console.error(`Failed to delete blob ${blobName}:`, err.message)
    }
}

export async function blobExists(blobName: string): Promise<boolean> {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(blobName)
        return await blockBlobClient.exists()
    } catch {
        return false
    }
}

/** Download a blob to a Buffer (for ingestion, backfill, etc.). */
export async function getBlobBuffer(blobName: string): Promise<Buffer> {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)
    const download = await blockBlobClient.download()
    const body = download.readableStreamBody
    if (!body) throw new Error('No stream body from blob download')
    const chunks: Buffer[] = []
    for await (const chunk of body) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks)
}

/** Upload a buffer directly to blob storage */
export async function uploadBufferToBlob(
    blobName: string,
    buffer: Buffer,
    contentType: string = 'application/pdf'
): Promise<string> {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)
    try {
        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: {
                blobContentType: contentType,
            }
        })
        return blobName
    } catch (err: any) {
        console.error(`Buffer upload failed:`, err.message)
        throw {
            status: 503,
            expose: true,
            message: 'File storage failed. Please try again in a moment.',
        }
    }
}
export async function listBlobsByPrefix(prefix: string): Promise<string[]> {
    const names: string[] = []
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
        names.push(blob.name)
    }
    return names
}
