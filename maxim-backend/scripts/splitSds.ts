/**
 * Split the 3 large SDS books in blob storage into one small PDF per chemical entry,
 * upload each to documents/sds-chunks/{trade}/, and create a LibraryDocument record
 * so Frank can find and read them.
 *
 * Run (from maxim-backend):
 *   npm install
 *   npx ts-node -r dotenv/config scripts/splitSds.ts
 *
 * Env: AZURE_STORAGE_CONNECTION_STRING, AZURE_STORAGE_CONTAINER (default: maxim-uploads).
 * Uses the first Owner user in the DB as uploadedById for new records.
 */

import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import { PrismaClient } from '@prisma/client'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFDocument } = require('pdf-lib')

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING as string | undefined
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'maxim-uploads'

if (!connectionString) {
  console.error('AZURE_STORAGE_CONNECTION_STRING is required')
  process.exit(1)
}

const conn = connectionString as string

const SOURCE_FILES = [
  { blob: 'documents/(M)SDS BOOK FOR HVAC 12225.pdf', trade: 'hvac' },
  { blob: 'documents/(M)SDS BOOK FOR PLUMBING 12225.pdf', trade: 'plumbing' },
  { blob: 'documents/(M)SDS BOOK FOR WELDERS & METAL FABRICATION 12325.pdf', trade: 'welding' },
]

const SDS_HEADER_PATTERNS = [
  /SAFETY DATA SHEET/i,
  /MATERIAL SAFETY DATA SHEET/i,
  /Section 1[\s\S]{0,40}(Product|Chemical|Identification)/i,
]

function looksLikeSdsStart(text: string): boolean {
  const firstLines = text.slice(0, 300)
  return SDS_HEADER_PATTERNS.some((p) => p.test(firstLines))
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

async function downloadBlob(blobClient: { download: () => Promise<{ readableStreamBody?: NodeJS.ReadableStream }> }): Promise<Buffer> {
  const chunks: Buffer[] = []
  const stream = await blobClient.download()
  const body = stream.readableStreamBody
  if (!body) throw new Error('No stream body')
  for await (const chunk of body) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function uploadChunk(
  containerClient: ContainerClient,
  buffer: Buffer,
  blobName: string
): Promise<void> {
  const blockClient = containerClient.getBlockBlobClient(blobName)
  await blockClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: 'application/pdf' },
  })
}

function extractPageTexts(fullText: string, pageCount: number): string[] {
  const byFormFeed = fullText.split(/\f/)
  if (byFormFeed.length >= pageCount) return byFormFeed
  if (pageCount <= 0) return [fullText]
  const approxLen = Math.ceil(fullText.length / pageCount)
  const pages: string[] = []
  for (let i = 0; i < pageCount; i++) {
    pages.push(fullText.slice(i * approxLen, (i + 1) * approxLen))
  }
  return pages
}

async function run() {
  const prisma = new PrismaClient()
  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isActive: true },
    select: { id: true },
  })
  if (!owner) {
    console.error('No active Owner user found in the database. Create an owner first.')
    await prisma.$disconnect()
    process.exit(1)
  }

  const blobService = BlobServiceClient.fromConnectionString(conn)
  const containerClient = blobService.getContainerClient(containerName)

  const date = new Date().toISOString().slice(0, 10)

  for (const source of SOURCE_FILES) {
    console.log(`\nProcessing: ${source.blob}`)

    const sourceBlobClient = containerClient.getBlobClient(source.blob)
    let pdfBuffer: Buffer
    try {
      pdfBuffer = await downloadBlob(sourceBlobClient)
    } catch (e) {
      console.error(`  Failed to download: ${(e as Error).message}`)
      continue
    }

    const srcDoc = await PDFDocument.load(pdfBuffer)
    const totalPages = srcDoc.getPageCount()

    const pdfData = await pdfParse(pdfBuffer)
    const fullText = pdfData.text || ''
    const pageTexts = extractPageTexts(fullText, totalPages)

    const entryStartPages: number[] = []
    for (let i = 0; i < pageTexts.length; i++) {
      if (looksLikeSdsStart(pageTexts[i])) entryStartPages.push(i)
    }

    if (entryStartPages.length < 3) {
      console.log('  SDS header detection inconclusive — falling back to 4-page chunks')
      for (let i = 0; i < totalPages; i += 4) entryStartPages.push(i)
    }

    console.log(`  Found ${entryStartPages.length} SDS entries (${totalPages} pages)`)

    for (let i = 0; i < entryStartPages.length; i++) {
      const startPage = entryStartPages[i]
      const nextStart = entryStartPages[i + 1]
      const endPage = nextStart !== undefined ? nextStart - 1 : totalPages - 1
      const lastPage = Math.min(Math.max(startPage, endPage), totalPages - 1)

      const chunkText = pageTexts[startPage] ?? ''
      const nameMatch =
        chunkText.match(/product\s+name[:\s]+([^\n]{3,60})/i) ??
        chunkText.match(/1\.1[^a-z]{0,10}([A-Z][^\n]{3,60})/)
      const rawName = nameMatch ? nameMatch[1].trim() : `entry-${i + 1}`
      const chunkName = slugify(rawName) || `entry-${i + 1}`

      const chunkDoc = await PDFDocument.create()
      const pageIndices: number[] = []
      for (let p = startPage; p <= lastPage && p < totalPages; p++) pageIndices.push(p)
      const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices)
      copiedPages.forEach((p: { getWidth: () => number }) => chunkDoc.addPage(p))
      const chunkBuffer = Buffer.from(await chunkDoc.save())

      let extractedText: string | null = null
      try {
        const chunkPdfData = await pdfParse(chunkBuffer)
        extractedText = chunkPdfData.text?.trim() || null
      } catch {
        // ignore
      }

      const blobName = `documents/sds-chunks/${source.trade}/${chunkName}.pdf`
      await uploadChunk(containerClient, chunkBuffer, blobName)

      await prisma.libraryDocument.create({
        data: {
          name: rawName,
          type: 'sds',
          siteId: null,
          date,
          filePath: blobName,
          uploadedById: owner.id,
          visibility: 'everyone',
          visibleToRoles: [],
          visibleToUserIds: [],
          tags: [source.trade, 'sds', 'safety'],
          extractedText,
        } as any,
      })

      console.log(`  ✓ [${i + 1}/${entryStartPages.length}] ${rawName} (pages ${startPage + 1}–${lastPage + 1})`)
    }
  }

  console.log('\nDone.')
  await prisma.$disconnect()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
