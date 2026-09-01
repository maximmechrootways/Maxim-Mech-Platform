"use strict";
/**
 * Re-index all LibraryDocument records that haven't been ingested into DocumentChunk yet.
 * Uses existing documentIngestionService.ingestDocument().
 *
 * Usage:
 *   npx ts-node src/scripts/reindex-documents.ts
 *
 * Or from the project root:
 *   npx ts-node -P maxim-backend/tsconfig.json maxim-backend/src/scripts/reindex-documents.ts
 *
 * Requires: DATABASE_URL, AZURE_STORAGE_CONNECTION_STRING, VOYAGE_API_KEY in environment.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const documentIngestionService_1 = require("../services/documentIngestionService");
async function reindexAll() {
    console.log('[Reindex] Fetching documents without chunks...');
    // Find all LibraryDocument records that have NO matching DocumentChunk rows
    const docs = await prisma_1.prisma.libraryDocument.findMany({
        where: {
            chunks: { none: {} },
        },
        select: { id: true, name: true, filePath: true },
        orderBy: { createdAt: 'asc' },
    });
    console.log(`[Reindex] ${docs.length} documents to process`);
    let success = 0;
    let failed = 0;
    for (const doc of docs) {
        console.log(`\n[Reindex] → ${doc.name}`);
        try {
            const result = await (0, documentIngestionService_1.ingestDocument)({
                documentId: doc.id,
                documentName: doc.name,
                filePath: doc.filePath,
            });
            console.log(`[Reindex]   ✓ ${result.chunksCreated} chunks`);
            success++;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[Reindex]   ✗ Failed: ${message}`);
            failed++;
        }
    }
    console.log(`\n[Reindex] Complete. Success: ${success}, Failed: ${failed}, Total: ${docs.length}`);
    await prisma_1.prisma.$disconnect();
}
reindexAll().catch((err) => {
    console.error('[Reindex] Fatal error:', err);
    process.exit(1);
});
