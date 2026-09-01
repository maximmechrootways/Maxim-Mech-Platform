-- RAG Pipeline: DocumentChunk table setup for Neon DB
-- Run this ONCE in Neon SQL Editor before deploying.

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create DocumentChunk table (matches Prisma schema)
-- Only run if not already created by prisma db push.
-- Check first: SELECT COUNT(*) FROM "DocumentChunk";
-- If that errors, run the CREATE below.
CREATE TABLE IF NOT EXISTS "DocumentChunk" (
  id              TEXT PRIMARY KEY,
  content         TEXT NOT NULL,
  embedding       vector(1024),
  "documentId"    TEXT NOT NULL REFERENCES "LibraryDocument"(id) ON DELETE CASCADE,
  "documentName"  TEXT NOT NULL,
  "sourceFilePath" TEXT NOT NULL,
  "pageNumber"    INT,
  "chunkIndex"    INT NOT NULL DEFAULT 0,
  "organisationId" TEXT,
  "createdAt"     TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes for vector similarity search
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
  ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_idx"
  ON "DocumentChunk"("documentId");

CREATE INDEX IF NOT EXISTS "DocumentChunk_organisationId_idx"
  ON "DocumentChunk"("organisationId");

-- 4. Verify
SELECT COUNT(*) AS chunk_count FROM "DocumentChunk";
SELECT COUNT(*) AS doc_count FROM "LibraryDocument";
