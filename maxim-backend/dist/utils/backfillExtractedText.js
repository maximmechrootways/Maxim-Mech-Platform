"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillLibraryDocumentText = backfillLibraryDocumentText;
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("../services/blobStorageService");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
/**
 * Download a URL to a local temp file, returning the file path.
 */
function downloadToTemp(url) {
    return new Promise((resolve, reject) => {
        const tmpPath = path_1.default.join(process.env.UPLOAD_DIR || 'uploads', `backfill-${Date.now()}.pdf`);
        const dir = path_1.default.dirname(tmpPath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        const client = url.startsWith('https') ? https_1.default : http_1.default;
        client.get(url, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            }
            const stream = fs_1.default.createWriteStream(tmpPath);
            res.pipe(stream);
            stream.on('finish', () => {
                stream.close();
                resolve(tmpPath);
            });
            stream.on('error', reject);
        }).on('error', reject);
    });
}
/**
 * Backfill extractedText for all LibraryDocuments that don't have it yet.
 * Downloads each PDF from Azure Blob, extracts text via pdf-parse, updates the DB.
 */
async function backfillLibraryDocumentText() {
    const docs = await prisma_1.prisma.libraryDocument.findMany({
        where: { extractedText: null },
        select: { id: true, name: true, filePath: true },
    });
    console.log(`Backfill: ${docs.length} documents need text extraction`);
    let succeeded = 0;
    const failed = [];
    for (const doc of docs) {
        let tmpPath = null;
        try {
            const sasUrl = await (0, blobStorageService_1.getBlobSasUrl)(doc.filePath, 10);
            tmpPath = await downloadToTemp(sasUrl);
            const buffer = fs_1.default.readFileSync(tmpPath);
            const pdfData = await pdfParse(buffer);
            const text = pdfData.text?.trim() || null;
            if (text) {
                await prisma_1.prisma.libraryDocument.update({
                    where: { id: doc.id },
                    data: { extractedText: text },
                });
                console.log(`  ✓ ${doc.name}: ${text.length} chars`);
                succeeded++;
            }
            else {
                console.log(`  ⚠ ${doc.name}: no text extracted (possibly image-only PDF)`);
                failed.push(`${doc.name} (no text found)`);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`  ✗ ${doc.name}: ${message}`);
            failed.push(`${doc.name} (${message})`);
        }
        finally {
            if (tmpPath && fs_1.default.existsSync(tmpPath)) {
                try {
                    fs_1.default.unlinkSync(tmpPath);
                }
                catch {
                    /* ignore */
                }
            }
        }
    }
    return { processed: docs.length, succeeded, failed };
}
