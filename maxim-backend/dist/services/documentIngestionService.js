"use strict";
/**
 * RAG ingestion: extract text from PDFs, chunk, embed with Voyage AI (Anthropic's recommended
 * embeddings provider), store in DocumentChunk (pgvector). Frank (Claude) uses this for semantic search.
 *
 * Uses Azure Document Intelligence OCR for scanned image PDFs (MSDS/SDS books).
 * Falls back to pdf-parse for text-layer PDFs if Azure OCR env vars are not set.
 *
 * After first migration, run in Neon SQL Editor for faster similarity search:
 *   CREATE INDEX ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestDocument = ingestDocument;
exports.searchDocumentChunks = searchDocumentChunks;
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const document_intelligence_extractor_1 = require("../lib/document-intelligence-extractor");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-3.5-lite'; // 1024 dims, fast & cheap
const WORDS_PER_CHUNK = 400;
const OVERLAP_WORDS = 50;
/** Chunk text by words with overlap. Used for OCR-extracted page text. */
function chunkTextByWords(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; i += WORDS_PER_CHUNK - OVERLAP_WORDS) {
        const chunk = words.slice(i, i + WORDS_PER_CHUNK).join(' ');
        if (chunk.trim().length > 30)
            chunks.push(chunk);
        if (i + WORDS_PER_CHUNK >= words.length)
            break;
    }
    return chunks;
}
/** Legacy character-based chunking for pdf-parse fallback. */
function chunkTextByChars(text) {
    const CHARS_PER_CHUNK = 2000;
    const OVERLAP_CHARS = 400;
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = start + CHARS_PER_CHUNK;
        const chunk = text.slice(start, end).trim();
        if (chunk.length > 50)
            chunks.push(chunk);
        start += CHARS_PER_CHUNK - OVERLAP_CHARS;
    }
    return chunks;
}
/** Generate embedding via Voyage AI. Takes a string or array of strings. inputType: 'document' for chunks, 'query' for search. */
async function embed(text, inputType = 'document') {
    if (!VOYAGE_API_KEY)
        throw new Error('VOYAGE_API_KEY is not set — cannot generate embeddings');
    const input = Array.isArray(text) ? text.map(t => t.slice(0, 16000)) : [text.slice(0, 16000)];
    let retries = 0;
    while (true) {
        const res = await fetch('https://api.voyageai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${VOYAGE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input,
                model: VOYAGE_MODEL,
                input_type: inputType,
            }),
        });
        if (res.status === 429 && retries < 3) {
            retries++;
            console.log(`[Voyage] Rate limit hit (429). Waiting 21 seconds (retry ${retries}/3)...`);
            await new Promise(resolve => setTimeout(resolve, 21000));
            continue;
        }
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Voyage embeddings failed: ${res.status} ${err}`);
        }
        const data = (await res.json());
        return data.data.map(d => d.embedding);
    }
}
/**
 * Ingest a PDF: download, extract text (OCR or text-layer), chunk, embed, store.
 * Prefers Azure Document Intelligence OCR (handles scanned PDFs).
 * Falls back to pdf-parse if Azure OCR env vars are not configured.
 */
async function ingestDocument(params) {
    const { documentId, documentName, filePath, organisationId } = params;
    // RAG pipeline — clear old chunks before re-ingesting
    await prisma_1.prisma.$executeRaw `DELETE FROM "DocumentChunk" WHERE "documentId" = ${documentId}`;
    console.log(`Ingesting: ${documentName}`);
    const buffer = await (0, blobStorageService_1.getBlobBuffer)(filePath);
    const useOCR = !!(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY);
    if (useOCR) {
        return ingestWithOCR(buffer, documentId, documentName, filePath, organisationId);
    }
    else {
        console.log('  [Fallback] Azure Doc Intelligence not configured, using pdf-parse');
        return ingestWithPdfParse(buffer, documentId, documentName, filePath, organisationId);
    }
}
/** OCR-based ingestion using Azure Document Intelligence. Works on scanned image PDFs. */
async function ingestWithOCR(buffer, documentId, documentName, filePath, organisationId) {
    const pages = await (0, document_intelligence_extractor_1.extractPagesWithOCR)(buffer);
    console.log(`  [OCR] ${pages.length} pages with text`);
    if (pages.length === 0) {
        throw new Error(`[OCR] No readable text found in ${documentName}`);
    }
    // Collect all chunks across all pages first
    const allChunks = [];
    let globalChunkIndex = 0;
    for (const page of pages) {
        const pageChunks = chunkTextByWords(page.text);
        for (const content of pageChunks) {
            allChunks.push({ content, page: page.page, chunkIndex: globalChunkIndex++ });
        }
    }
    // Voyage allows up to 128 elements in the input array.
    const BATCH_SIZE = 120;
    let chunksCreated = 0;
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
        const batch = allChunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map(c => c.content);
        // One API call for up to 120 chunks
        const embeddings = await embed(texts, 'document');
        await Promise.all(batch.map(async (chunk, j) => {
            const embeddingStr = `[${embeddings[j].join(',')}]`;
            await prisma_1.prisma.$executeRaw `
                  INSERT INTO "DocumentChunk"
                    (id, content, embedding, "documentId", "documentName", "sourceFilePath",
                     "pageNumber", "chunkIndex", "organisationId", "createdAt")
                  VALUES (
                    gen_random_uuid(),
                    ${chunk.content},
                    ${embeddingStr}::vector,
                    ${documentId},
                    ${documentName},
                    ${filePath},
                    ${chunk.page},
                    ${chunk.chunkIndex},
                    ${organisationId ?? null},
                    NOW()
                  )
                `;
            chunksCreated++;
        }));
        console.log(`  Embedded chunks ${i + 1}–${Math.min(i + BATCH_SIZE, allChunks.length)}`);
    }
    console.log(`  ✓ Done: ${chunksCreated} chunks stored for "${documentName}"`);
    return { chunksCreated };
}
/** Legacy pdf-parse fallback for text-layer PDFs. */
async function ingestWithPdfParse(buffer, documentId, documentName, filePath, organisationId) {
    let fullText;
    try {
        const parsed = await pdfParse(buffer);
        fullText = parsed.text ?? '';
    }
    catch (err) {
        console.error(`pdf-parse failed for ${documentName}:`, err);
        throw new Error(`Could not extract text from ${documentName}`);
    }
    if (!fullText || fullText.trim().length < 50) {
        throw new Error(`No readable text found in ${documentName}. It may be a scanned image PDF — configure Azure Document Intelligence for OCR.`);
    }
    const chunks = chunkTextByChars(fullText);
    console.log(`  ${chunks.length} chunks from ${fullText.length} chars`);
    const BATCH_SIZE = 120;
    let chunksCreated = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        // One API call for up to 120 chunks
        const embeddings = await embed(batch, 'document');
        await Promise.all(batch.map(async (content, j) => {
            const chunkIndex = i + j;
            const embeddingStr = `[${embeddings[j].join(',')}]`;
            await prisma_1.prisma.$executeRaw `
                  INSERT INTO "DocumentChunk"
                    (id, content, embedding, "documentId", "documentName", "sourceFilePath",
                     "chunkIndex", "organisationId", "createdAt")
                  VALUES (
                    gen_random_uuid(),
                    ${content},
                    ${embeddingStr}::vector,
                    ${documentId},
                    ${documentName},
                    ${filePath},
                    ${chunkIndex},
                    ${organisationId ?? null},
                    NOW()
                  )
                `;
            chunksCreated++;
        }));
        console.log(`  Embedded chunks ${i + 1}–${Math.min(i + BATCH_SIZE, chunks.length)}`);
    }
    console.log(`  ✓ Done: ${chunksCreated} chunks stored for "${documentName}"`);
    return { chunksCreated };
}
/** Semantic search over document chunks. Used by Frank's search_documents tool. */
async function searchDocumentChunks(params) {
    const { query, organisationId, limit = 5 } = params;
    if (!VOYAGE_API_KEY)
        throw new Error('VOYAGE_API_KEY is not set — cannot search documents');
    // embed now returns a 2D array, so we take the first element for a single query
    const [queryEmbedding] = await embed(query, 'query');
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    const limitVal = Math.min(Math.max(limit, 1), 10);
    if (organisationId) {
        const results = await prisma_1.prisma.$queryRaw `
          SELECT
            content,
            "documentName",
            "sourceFilePath",
            "chunkIndex",
            1 - (embedding <=> ${embeddingStr}::vector) AS similarity
          FROM "DocumentChunk"
          WHERE "organisationId" = ${organisationId}
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT ${limitVal}
        `;
        return results;
    }
    const results = await prisma_1.prisma.$queryRaw `
      SELECT
        content,
        "documentName",
        "sourceFilePath",
        "chunkIndex",
        1 - (embedding <=> ${embeddingStr}::vector) AS similarity
      FROM "DocumentChunk"
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limitVal}
    `;
    return results;
}
