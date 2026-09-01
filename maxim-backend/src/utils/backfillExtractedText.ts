import { prisma } from '../lib/prisma'
import { getBlobSasUrl } from '../services/blobStorageService'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')

/**
 * Download a URL to a local temp file, returning the file path.
 */
function downloadToTemp(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const tmpPath = path.join(process.env.UPLOAD_DIR || 'uploads', `backfill-${Date.now()}.pdf`)
        const dir = path.dirname(tmpPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

        const client = url.startsWith('https') ? https : http
        client.get(url, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Download failed: HTTP ${res.statusCode}`))
            }
            const stream = fs.createWriteStream(tmpPath)
            res.pipe(stream)
            stream.on('finish', () => {
                stream.close()
                resolve(tmpPath)
            })
            stream.on('error', reject)
        }).on('error', reject)
    })
}

/**
 * Backfill extractedText for all LibraryDocuments that don't have it yet.
 * Downloads each PDF from Azure Blob, extracts text via pdf-parse, updates the DB.
 */
export async function backfillLibraryDocumentText(): Promise<{ processed: number; succeeded: number; failed: string[] }> {
    const docs = await prisma.libraryDocument.findMany({
        where: { extractedText: null },
        select: { id: true, name: true, filePath: true },
    })

    console.log(`Backfill: ${docs.length} documents need text extraction`)

    let succeeded = 0
    const failed: string[] = []

    for (const doc of docs) {
        let tmpPath: string | null = null
        try {
            const sasUrl = await getBlobSasUrl(doc.filePath, 10)
            tmpPath = await downloadToTemp(sasUrl)

            const buffer = fs.readFileSync(tmpPath)
            const pdfData = await pdfParse(buffer)
            const text = pdfData.text?.trim() || null

            if (text) {
                await prisma.libraryDocument.update({
                    where: { id: doc.id },
                    data: { extractedText: text },
                })
                console.log(`  ✓ ${doc.name}: ${text.length} chars`)
                succeeded++
            } else {
                console.log(`  ⚠ ${doc.name}: no text extracted (possibly image-only PDF)`)
                failed.push(`${doc.name} (no text found)`)
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`  ✗ ${doc.name}: ${message}`)
            failed.push(`${doc.name} (${message})`)
        } finally {
            if (tmpPath && fs.existsSync(tmpPath)) {
                try {
                    fs.unlinkSync(tmpPath)
                } catch {
                    /* ignore */
                }
            }
        }
    }

    return { processed: docs.length, succeeded, failed }
}
