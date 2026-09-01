-- Toolbox topic catalog for IHSA imports + submission linkage

CREATE TABLE IF NOT EXISTS "ToolboxTopic" (
  "id" TEXT NOT NULL,
  "sourceProvider" TEXT NOT NULL DEFAULT 'IHSA',
  "sourcePageUrl" TEXT,
  "sourcePdfUrl" TEXT NOT NULL,
  "sourcePdfHash" TEXT,
  "topicTitle" TEXT NOT NULL,
  "category" TEXT,
  "summary" TEXT,
  "keyPoints" JSONB NOT NULL DEFAULT '[]',
  "rawExtract" TEXT,
  "importStatus" TEXT NOT NULL DEFAULT 'READY',
  "importError" TEXT,
  "batchTag" TEXT,
  "lastImportedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "importedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolboxTopic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ToolboxTopic_sourceProvider_sourcePdfUrl_key"
  ON "ToolboxTopic"("sourceProvider", "sourcePdfUrl");

CREATE INDEX IF NOT EXISTS "ToolboxTopic_isActive_topicTitle_idx"
  ON "ToolboxTopic"("isActive", "topicTitle");

CREATE INDEX IF NOT EXISTS "ToolboxTopic_batchTag_idx"
  ON "ToolboxTopic"("batchTag");

CREATE INDEX IF NOT EXISTS "ToolboxTopic_importStatus_idx"
  ON "ToolboxTopic"("importStatus");

ALTER TABLE "ToolboxTopic"
  ADD CONSTRAINT "ToolboxTopic_importedById_fkey"
  FOREIGN KEY ("importedById")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "PdfSubmission"
  ADD COLUMN IF NOT EXISTS "selectedToolboxTopicId" TEXT;

CREATE INDEX IF NOT EXISTS "PdfSubmission_selectedToolboxTopicId_idx"
  ON "PdfSubmission"("selectedToolboxTopicId");

ALTER TABLE "PdfSubmission"
  ADD CONSTRAINT "PdfSubmission_selectedToolboxTopicId_fkey"
  FOREIGN KEY ("selectedToolboxTopicId")
  REFERENCES "ToolboxTopic"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
