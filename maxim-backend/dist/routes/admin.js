"use strict";
/**
 * Admin routes for document diagnostics and sync.
 * RAG pipeline — document sync
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("../services/blobStorageService");
const documentIngestionService_1 = require("../services/documentIngestionService");
const router = (0, express_1.Router)();
// ── Temporary debug routes (no auth, secret query param) ──────────────
// DELETE THESE after debugging is done!
const DEBUG_SECRET = 'maxim2026';
router.get('/documents/env-check', async (req, res) => {
    if (req.query.key !== DEBUG_SECRET)
        return res.status(403).json({ error: 'Bad key' });
    res.json({
        VOYAGE_API_KEY: !!process.env.VOYAGE_API_KEY,
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: !!process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
        AZURE_DOCUMENT_INTELLIGENCE_KEY: !!process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
        ocrEnabled: !!(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY),
        voyageModel: process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-3.5-lite (default)',
    });
});
router.get('/documents/test-ingest/:id', async (req, res) => {
    if (req.query.key !== DEBUG_SECRET)
        return res.status(403).json({ error: 'Bad key' });
    try {
        const doc = await prisma_1.prisma.libraryDocument.findUnique({
            where: { id: req.params.id },
            select: { id: true, name: true, filePath: true },
        });
        if (!doc)
            return res.status(404).json({ error: 'Document not found' });
        console.log(`[Test-Ingest] Starting: ${doc.name}`);
        const result = await (0, documentIngestionService_1.ingestDocument)({
            documentId: doc.id,
            documentName: doc.name,
            filePath: doc.filePath,
        });
        res.json({ success: true, document: doc.name, chunksCreated: result.chunksCreated });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Test-Ingest] Error:`, err);
        res.status(500).json({ success: false, error: message });
    }
});
router.get('/documents/debug-reindex', async (req, res) => {
    if (req.query.key !== DEBUG_SECRET)
        return res.status(403).json({ error: 'Bad key' });
    try {
        const docs = await prisma_1.prisma.libraryDocument.findMany({
            where: { chunks: { none: {} } },
            select: { id: true, name: true, filePath: true },
            orderBy: { createdAt: 'asc' },
        });
        // Respond immediately, run in background
        res.json({
            message: `Background reindex started for ${docs.length} documents. Check Azure Server Logs!`,
            documents: docs.map((d) => d.name),
        });
        for (const doc of docs) {
            try {
                const exists = await (0, blobStorageService_1.blobExists)(doc.filePath);
                if (!exists) {
                    console.log(`[Reindex] Skipping ${doc.name} — blob not found`);
                    continue;
                }
                console.log(`[Reindex] → ${doc.name}`);
                const result = await (0, documentIngestionService_1.ingestDocument)({
                    documentId: doc.id,
                    documentName: doc.name,
                    filePath: doc.filePath,
                });
                console.log(`[Reindex]   ✓ ${result.chunksCreated} chunks`);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[Reindex]   ✗ ${doc.name}: ${message}`);
            }
        }
        console.log('[Reindex] Complete.');
    }
    catch (e) {
        console.error(`[Reindex Starter Error]`, e);
    }
});
// ── End temporary debug routes ────────────────────────────────────────
router.use(authenticate_1.authenticate);
/**
 * GET /admin/documents/diagnostics
 * Owner-only. Shows document-blob alignment, chunk counts, and stale records.
 */
router.get('/documents/diagnostics', async (req, res, next) => {
    try {
        if (req.user.role !== 'owner') {
            return res.status(403).json({ error: 'Owner only' });
        }
        // 1. Get all LibraryDocument records
        const dbDocs = await prisma_1.prisma.libraryDocument.findMany({
            select: {
                id: true,
                name: true,
                filePath: true,
                extractedText: false,
                createdAt: true,
                _count: { select: { chunks: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        // 2. Check blob existence for each doc
        const docsWithStatus = await Promise.all(dbDocs.map(async (doc) => {
            const exists = await (0, blobStorageService_1.blobExists)(doc.filePath);
            return {
                id: doc.id,
                name: doc.name,
                filePath: doc.filePath,
                blobExists: exists,
                chunkCount: doc._count.chunks,
                createdAt: doc.createdAt,
            };
        }));
        // 3. List actual blobs in documents/ folder
        const blobNames = await (0, blobStorageService_1.listBlobsByPrefix)('documents/');
        // 4. Find blobs not linked to any DB record
        const dbPaths = new Set(dbDocs.map((d) => d.filePath));
        const orphanBlobs = blobNames.filter((b) => !dbPaths.has(b));
        // 5. Summary
        const staleRecords = docsWithStatus.filter((d) => !d.blobExists);
        const unindexedDocs = docsWithStatus.filter((d) => d.blobExists && d.chunkCount === 0);
        res.json({
            summary: {
                totalDbRecords: dbDocs.length,
                totalBlobs: blobNames.length,
                staleRecords: staleRecords.length,
                orphanBlobs: orphanBlobs.length,
                indexedDocs: docsWithStatus.filter((d) => d.chunkCount > 0).length,
                unindexedDocs: unindexedDocs.length,
            },
            documents: docsWithStatus,
            orphanBlobs,
            staleRecords: staleRecords.map((d) => ({ id: d.id, name: d.name })),
            unindexedDocs: unindexedDocs.map((d) => ({ id: d.id, name: d.name })),
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * POST /admin/documents/cleanup-stale
 * Owner-only. Deletes LibraryDocument records whose blob no longer exists.
 */
router.post('/documents/cleanup-stale', async (req, res, next) => {
    try {
        if (req.user.role !== 'owner') {
            return res.status(403).json({ error: 'Owner only' });
        }
        const docs = await prisma_1.prisma.libraryDocument.findMany({
            select: { id: true, name: true, filePath: true },
        });
        const deleted = [];
        for (const doc of docs) {
            const exists = await (0, blobStorageService_1.blobExists)(doc.filePath);
            if (!exists) {
                // Delete chunks first (cascade should handle it, but be safe)
                await prisma_1.prisma.documentChunk.deleteMany({ where: { documentId: doc.id } });
                await prisma_1.prisma.libraryDocument.delete({ where: { id: doc.id } });
                deleted.push(doc.name);
                console.log(`[Sync] Deleted stale record: ${doc.name} (blob missing: ${doc.filePath})`);
            }
        }
        res.json({
            message: `Cleaned up ${deleted.length} stale document records`,
            deleted,
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * POST /admin/documents/reindex
 * Owner-only. Ingests all documents that have 0 chunks.
 */
router.post('/documents/reindex', async (req, res, next) => {
    try {
        if (req.user.role !== 'owner') {
            return res.status(403).json({ error: 'Owner only' });
        }
        const docs = await prisma_1.prisma.libraryDocument.findMany({
            where: { chunks: { none: {} } },
            select: { id: true, name: true, filePath: true },
            orderBy: { createdAt: 'asc' },
        });
        // Run in background — respond immediately
        res.json({
            message: `Re-indexing ${docs.length} documents in background. Check server logs for progress.`,
            documents: docs.map((d) => d.name),
        });
        // Fire-and-forget ingestion
        for (const doc of docs) {
            try {
                const exists = await (0, blobStorageService_1.blobExists)(doc.filePath);
                if (!exists) {
                    console.log(`[Reindex] Skipping ${doc.name} — blob not found: ${doc.filePath}`);
                    continue;
                }
                console.log(`[Reindex] → ${doc.name}`);
                const result = await (0, documentIngestionService_1.ingestDocument)({
                    documentId: doc.id,
                    documentName: doc.name,
                    filePath: doc.filePath,
                });
                console.log(`[Reindex]   ✓ ${result.chunksCreated} chunks`);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[Reindex]   ✗ ${doc.name}: ${message}`);
            }
        }
        console.log('[Reindex] Complete.');
    }
    catch (e) {
        next(e);
    }
});
/**
 * POST /admin/documents/test-ingest/:id
 * Owner-only. Synchronously ingests ONE document and returns the result/error directly.
 * Use this to debug ingestion failures.
 */
router.post('/documents/test-ingest/:id', async (req, res, next) => {
    try {
        if (req.user.role !== 'owner') {
            return res.status(403).json({ error: 'Owner only' });
        }
        const doc = await prisma_1.prisma.libraryDocument.findUnique({
            where: { id: req.params.id },
            select: { id: true, name: true, filePath: true },
        });
        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }
        console.log(`[Test-Ingest] Starting: ${doc.name}`);
        const result = await (0, documentIngestionService_1.ingestDocument)({
            documentId: doc.id,
            documentName: doc.name,
            filePath: doc.filePath,
        });
        res.json({
            success: true,
            document: doc.name,
            chunksCreated: result.chunksCreated,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error(`[Test-Ingest] Error:`, err);
        res.status(500).json({ success: false, error: message, stack });
    }
});
/**
 * GET /admin/documents/env-check
 * Owner-only. Shows which ingestion env vars are set (without revealing values).
 */
router.get('/documents/env-check', async (req, res) => {
    if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Owner only' });
    }
    res.json({
        VOYAGE_API_KEY: !!process.env.VOYAGE_API_KEY,
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: !!process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
        AZURE_DOCUMENT_INTELLIGENCE_KEY: !!process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
        ocrEnabled: !!(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY),
        voyageModel: process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-3.5-lite (default)',
    });
});
exports.default = router;
