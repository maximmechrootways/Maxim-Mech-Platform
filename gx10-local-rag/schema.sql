CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS local_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    content_type TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | ingested | stored | failed
    error TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    -- Top-level folder dropped into the inbox (e.g. a job/project name); '' for loose files.
    project TEXT NOT NULL DEFAULT '',
    -- Folder path within the project, e.g. "ONTC Station/drawings/mechanical".
    folder_path TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_documents_sha256_idx ON local_documents (sha256);
CREATE INDEX IF NOT EXISTS local_documents_project_idx ON local_documents (project);

CREATE TABLE IF NOT EXISTS local_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES local_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    page_number INTEGER,
    chunk_index INTEGER NOT NULL,
    embedding vector(1024) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_chunks_document_idx ON local_chunks (document_id);
CREATE INDEX IF NOT EXISTS local_chunks_hnsw_idx ON local_chunks USING hnsw (embedding vector_cosine_ops);
