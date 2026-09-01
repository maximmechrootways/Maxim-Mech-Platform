/**
 * One-time backfill: ingest all existing library documents into DocumentChunk (pgvector)
 * so Frank can semantic-search them. Run after enabling pgvector and OPENAI_API_KEY.
 *
 * Run (from maxim-backend):
 *   npx ts-node -r dotenv/config scripts/ingestExistingDocs.ts
 */

import { PrismaClient } from '@prisma/client'
import { ingestDocument } from '../src/services/documentIngestionService'

async function run() {
    const prisma = new PrismaClient()

    const docs = await prisma.libraryDocument.findMany({
        select: { id: true, name: true, filePath: true },
    })

    console.log(`Found ${docs.length} library documents to ingest`)

    for (const doc of docs) {
        try {
            const result = await ingestDocument({
                documentId: doc.id,
                documentName: doc.name,
                filePath: doc.filePath,
                organisationId: undefined,
            })
            console.log(`✓ ${doc.name}: ${result.chunksCreated} chunks`)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`✗ ${doc.name}: ${message}`)
        }
    }

    await prisma.$disconnect()
    console.log('Done.')
}

run().catch((e) => {
    console.error(e)
    process.exit(1)
})
