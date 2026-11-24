-- Supporting documents for injury reports (PDF / images)

CREATE TABLE IF NOT EXISTS "InjuryReportAttachment" (
  "id" TEXT NOT NULL,
  "injuryReportId" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "notes" TEXT,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InjuryReportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InjuryReportAttachment_injuryReportId_idx"
  ON "InjuryReportAttachment"("injuryReportId");

CREATE INDEX IF NOT EXISTS "InjuryReportAttachment_uploadedById_idx"
  ON "InjuryReportAttachment"("uploadedById");

ALTER TABLE "InjuryReportAttachment"
  ADD CONSTRAINT "InjuryReportAttachment_injuryReportId_fkey"
  FOREIGN KEY ("injuryReportId") REFERENCES "InjuryReport"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
