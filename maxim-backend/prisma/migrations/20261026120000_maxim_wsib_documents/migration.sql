-- Maxim company WSIB / compliance documents (Owner + HR only)

CREATE TABLE IF NOT EXISTS "MaximWsibDocument" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "documentType" TEXT NOT NULL DEFAULT 'Other',
  "issueDate" TEXT,
  "expirationDate" TEXT,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  CONSTRAINT "MaximWsibDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MaximWsibDocument_expirationDate_idx"
  ON "MaximWsibDocument"("expirationDate");

CREATE INDEX IF NOT EXISTS "MaximWsibDocument_documentType_idx"
  ON "MaximWsibDocument"("documentType");

CREATE INDEX IF NOT EXISTS "MaximWsibDocument_uploadedById_idx"
  ON "MaximWsibDocument"("uploadedById");
