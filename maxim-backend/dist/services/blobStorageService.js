"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadBlob = uploadBlob;
exports.getBlobSasUrl = getBlobSasUrl;
exports.deleteBlob = deleteBlob;
exports.blobExists = blobExists;
exports.getBlobBuffer = getBlobBuffer;
exports.uploadBufferToBlob = uploadBufferToBlob;
exports.listBlobsByPrefix = listBlobsByPrefix;
const storage_blob_1 = require("@azure/storage-blob");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'maxim-uploads';
if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
}
const blobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);
// Ensure container exists on startup
containerClient.createIfNotExists().catch((err) => {
    console.error('Failed to ensure blob container exists:', err.message);
});
async function uploadBlob(localFilePath, folder = 'templates') {
    const ext = path_1.default.extname(localFilePath) || '.pdf';
    const lowerExt = ext.toLowerCase();
    const byExt = {
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
    };
    const detectedContentType = byExt[lowerExt] || 'application/octet-stream';
    const blobName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    try {
        await blockBlobClient.uploadFile(localFilePath, {
            blobHTTPHeaders: {
                blobContentType: detectedContentType,
            },
            metadata: {
                uploadedAt: new Date().toISOString(),
                folder
            }
        });
        return blobName;
    }
    catch (err) {
        console.error(`Blob upload failed:`, err.message);
        throw new Error('File storage failed. Please try again.');
    }
    finally {
        // Always clean up local temp file whether upload succeeded or failed
        if (fs_1.default.existsSync(localFilePath)) {
            fs_1.default.unlinkSync(localFilePath);
        }
    }
}
async function getBlobSasUrl(blobName, expiryMinutes = 30) {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiryMinutes);
    try {
        return await blockBlobClient.generateSasUrl({
            permissions: storage_blob_1.BlobSASPermissions.parse('r'),
            expiresOn,
        });
    }
    catch (err) {
        console.error(`Failed to generate SAS URL:`, err.message);
        throw new Error('Could not generate file access URL.');
    }
}
async function deleteBlob(blobName) {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.deleteIfExists({ deleteSnapshots: 'include' });
    }
    catch (err) {
        // Log but don't throw — failed blob delete shouldn't block DB delete
        console.error(`Failed to delete blob ${blobName}:`, err.message);
    }
}
async function blobExists(blobName) {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        return await blockBlobClient.exists();
    }
    catch {
        return false;
    }
}
/** Download a blob to a Buffer (for ingestion, backfill, etc.). */
async function getBlobBuffer(blobName) {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const download = await blockBlobClient.download();
    const body = download.readableStreamBody;
    if (!body)
        throw new Error('No stream body from blob download');
    const chunks = [];
    for await (const chunk of body)
        chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}
/** Upload a buffer directly to blob storage */
async function uploadBufferToBlob(blobName, buffer, contentType = 'application/pdf') {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    try {
        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: {
                blobContentType: contentType,
            }
        });
        return blobName;
    }
    catch (err) {
        console.error(`Buffer upload failed:`, err.message);
        throw new Error('File storage failed.');
    }
}
async function listBlobsByPrefix(prefix) {
    const names = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
        names.push(blob.name);
    }
    return names;
}
