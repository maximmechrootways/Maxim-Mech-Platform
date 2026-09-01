-- Store digitized paper forms from external subcontractors (no link to Subcontractor entity).

CREATE TABLE "OfflineSubcontractorForm" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineSubcontractorForm_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfflineSubcontractorForm_uploadedById_idx" ON "OfflineSubcontractorForm"("uploadedById");
CREATE INDEX "OfflineSubcontractorForm_createdAt_idx" ON "OfflineSubcontractorForm"("createdAt");

ALTER TABLE "OfflineSubcontractorForm" ADD CONSTRAINT "OfflineSubcontractorForm_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
